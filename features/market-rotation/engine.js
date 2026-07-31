/**
 * Market Rotation — engine agregasi aliran uang per grup emiten.
 *
 * FILOSOFI (penting, beda dari fitur lain di suite ini):
 * Ini ALAT OBSERVASI, bukan sinyal prediktif. Ia menggambarkan ke mana uang
 * SEDANG mengalir — tidak meramal ke mana ia AKAN mengalir. Karena itu tidak
 * ada WLB/backtest di sini: tidak ada yang perlu dibuktikan untuk "menggambar
 * peta". Bahayanya justru di salah-baca: peta yang keliru terasa objektif.
 * Maka dua metrik disediakan (return berbobot & net asing) supaya bisa
 * di-cross-check — bukan percaya satu angka buta (pelajaran LPM Bandar Metrics).
 *
 * Semua fungsi murni — input array daily, output angka. Tidak fetch di sini.
 */

/** Return harian 1 emiten dari 2 candle daily terakhir (%). */
export function dayReturnPct(daily) {
  if (!daily || daily.length < 2) return null
  const a = daily[daily.length - 2].close
  const b = daily[daily.length - 1].close
  if (!a || !b) return null
  return (b - a) / a * 100
}

/** Net asing hari terakhir (rupiah). foreignbuy/sell sudah rupiah di daily. */
export function foreignNet(daily) {
  if (!daily || !daily.length) return null
  const r = daily[daily.length - 1]
  if (r.foreignbuy == null && r.foreignsell == null) return null
  return (r.foreignbuy || 0) - (r.foreignsell || 0)
}

/** Turnover hari terakhir (rupiah, proxy = close*volume) + rasio vs rata2 20 hari. */
export function turnover(daily) {
  if (!daily || !daily.length) return { today: null, ratio: null }
  const last = daily[daily.length - 1]
  const today = (last.close || 0) * (last.volume || 0)
  const prev = daily.slice(-21, -1).map(r => (r.close || 0) * (r.volume || 0)).filter(v => v > 0)
  const avg = prev.length ? prev.reduce((s, x) => s + x, 0) / prev.length : null
  return { today, ratio: avg ? today / avg : null }
}

/**
 * Bobot 1 emiten dalam agregasi grup.
 * Return berbobot: pembobot = turnover (nilai transaksi) — saham yang lebih
 * ramai diperdagangkan lebih menentukan "arah uang" grup daripada saham sepi.
 * Net asing: agregasi = jumlah rupiah (tidak dibobot; rupiah sudah absolut).
 */
export function aggregateGroup(members, metric) {
  // members: [{sym, daily}]  |  metric: 'return' | 'value'
  const rows = []
  for (const m of members) {
    const ret = dayReturnPct(m.daily)
    const tv = turnover(m.daily)
    // Net Value (proxy murah, tanpa trade-book): turnover diberi ARAH oleh
    // gerak harga hari itu. Naik → uang masuk (positif); turun → keluar.
    // Bukan HAKA−HAKI sebenarnya (itu perlu fetch trade-book per emiten =
    // terlalu mahal utk semua emiten live), tapi proxy arah yang koheren.
    const netValue = (ret != null && tv.today != null) ? Math.sign(ret) * tv.today : null
    rows.push({ sym: m.sym, ret, turnover: tv.today, turnoverRatio: tv.ratio, netValue,
                close: m.daily?.[m.daily.length - 1]?.close ?? null })
  }
  const valid = rows.filter(r => r.ret != null)

  let score = null, retW = null, valueSum = null
  if (valid.length) {
    const wr = rows.filter(r => r.ret != null && r.turnover)
    if (wr.length) {
      const wsum = wr.reduce((s, r) => s + r.turnover, 0)
      retW = wsum ? wr.reduce((s, r) => s + r.ret * r.turnover, 0) / wsum : null
    }
    if (retW == null) {
      const rs = rows.filter(r => r.ret != null)
      retW = rs.length ? rs.reduce((s, r) => s + r.ret, 0) / rs.length : null
    }
    const nv = rows.filter(r => r.netValue != null)
    valueSum = nv.length ? nv.reduce((s, r) => s + r.netValue, 0) : null
    score = metric === 'value' ? valueSum : retW
  }

  const turnoverSum = rows.reduce((s, r) => s + (r.turnover || 0), 0)
  return {
    score, retW, valueSum, turnoverSum,
    nValid: valid.length, nTotal: rows.length,
    members: rows.sort((a, b) => {
      const va = metric === 'value' ? (a.netValue ?? -Infinity) : (a.ret ?? -Infinity)
      const vb = metric === 'value' ? (b.netValue ?? -Infinity) : (b.ret ?? -Infinity)
      return vb - va
    }),
  }
}

/** Urutkan grup dari inflow terkuat → terlemah. */
export function rankGroups(groups, metric) {
  return [...groups]
    .filter(g => g.agg.score != null)
    .sort((a, b) => b.agg.score - a.agg.score)
}

/** Format rupiah ringkas: 12,3 M / 1,2 T. */
export function fmtRp(v) {
  if (v == null) return '–'
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(1)} T`
  if (a >= 1e9)  return `${sign}${(a / 1e9).toFixed(1)} M`
  if (a >= 1e6)  return `${sign}${(a / 1e6).toFixed(0)} jt`
  return `${sign}${a.toFixed(0)}`
}

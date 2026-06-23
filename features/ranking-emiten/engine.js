/**
 * features/ranking-emiten/engine.js
 * ====================================
 * Ranking Emiten — cari kombinasi (kondisi, exit time) TERBAIK per simbol,
 * lalu ranking semua simbol berdasarkan win rate terbaiknya.
 *
 * Diporting dari ihsg-lab.html (_renderRanking + _extractIEP/_extractIntraday)
 * — logic & 16 kondisi DIPERTAHANKAN PERSIS, diadaptasi ke struktur data
 * ihsg-suite yang sudah ada (enrichDaily dst), bukan exact line-by-line port.
 *
 * Beda dengan Win Rate Scanner (features/win-rate/) — JANGAN disamakan:
 *   - Entry = harga intraday p0902 (BUKAN daily.open) — definisi asli
 *     ihsg-lab, dipertahankan supaya hasil ranking konsisten dgn yang
 *     pernah dipakai Wisnu sebelumnya.
 *   - Gap = (p0902 - closeKemarin) / closeKemarin — beda formula dgn win-rate.
 *   - IEP Surge = SURGE VOLUME pre-opening (total volume 08:45-08:59 vs
 *     rata-rata 5 hari sebelumnya), BUKAN surge harga. Field ini & "Gap"
 *     benar-benar 2 metrik berbeda makna (di win-rate sempat digabung jadi
 *     1 — di sini TIDAK boleh, mengikuti definisi asli).
 *   - 16 kondisi hardcoded (bukan kombinatorial generik 3x3x3), beberapa
 *     gabungan beberapa syarat sekaligus.
 *   - WIN_PCT = 1.0% (bukan >0%) — harus untung MINIMAL 1% baru dihitung "win".
 *   - Per simbol cuma diambil 1 kombinasi (kondisi,exit) TERBAIKNYA, BUKAN
 *     matrix lengkap — tujuannya beda: cari saham mana yang paling
 *     exploitable, bukan lihat semua kombinasi utk 1 saham yang sama.
 */

export const ENTRY_KEY  = 'p0902'
export const EXIT_KEYS  = ['p0905', 'p0910', 'p0915', 'p0920', 'p0930', 'p1000', 'p1100', 'p1530', 'p1600']
export const WIN_PCT    = 1.0  // return >= +1% dihitung "win"
export const MIN_SAMPLE = 3    // minimal sampel valid per kondisi/exit, biar WR tidak bias dari 1-2 data

// ============================================================
// SEKSI 1: 16 KONDISI — PERSIS dari ihsg-lab.html, jangan diubah tanpa
// sepengetahuan Wisnu (ini hasil riset/observasi dia sebelumnya).
// ============================================================

export const CONDITIONS = [
  { name: 'IEP Surge >= 2x',                  f: r => r.iepSurge >= 2 },
  { name: 'IEP Surge >= 3x',                  f: r => r.iepSurge >= 3 },
  { name: 'ATR% H-1 > 1%',                    f: r => r.atrPct > 1 },
  { name: 'ATR Ratio > 1.5x',                 f: r => r.atrRatio > 1.5 },
  { name: 'Gap Up > +0.5%',                   f: r => r.gapPct > 0.5 },
  { name: 'Gap Up > +1%',                     f: r => r.gapPct > 1 },
  { name: 'RSI H-1 < 40',                     f: r => r.rsi < 40 },
  { name: 'MACD Hist H-1 > 0',                f: r => r.macdHist > 0 },
  { name: 'Vol/MA H-1 >= 1.5x',               f: r => r.vmaRatio >= 1.5 },
  { name: 'Foreign Net H-1 +',                f: r => r.foreignNet > 0 },
  { name: 'IHSG H-1 Naik',                    f: r => r.ihsgH1Trend === 'up' },
  { name: 'IEP>=2 + Gap Up',                  f: r => r.iepSurge >= 2 && r.gapPct > 0 },
  { name: 'IEP>=2 + ATR>1%',                  f: r => r.iepSurge >= 2 && r.atrPct > 1 },
  { name: 'IEP>=2 + MACD+',                   f: r => r.iepSurge >= 2 && r.macdHist > 0 },
  { name: 'IEP>=2 + IHSG H-1 Naik',           f: r => r.iepSurge >= 2 && r.ihsgH1Trend === 'up' },
  { name: 'IEP>=2 + ATR>1% + MACD+ + IHSG+',  f: r => r.iepSurge >= 2 && r.atrPct > 1 && r.macdHist > 0 && r.ihsgH1Trend === 'up' }
]

// ============================================================
// SEKSI 2: IEP SURGE — dihitung dari data RAW (totalVol/totalFreq per hari),
// BUKAN disimpan langsung sebagai surge final. Rolling 5 hari sebelumnya
// butuh sequence lengkap & terurut — dihitung di sini (bukan di fetch.js)
// supaya cache db.js cuma nyimpen data mentah, tetap akurat walau di-fetch
// bertahap per batch (tidak perlu rewrite history tiap nambah data baru).
// ============================================================

/**
 * Tambahkan field surge ke array IEP mentah (HARUS sudah terurut ascending).
 * @param {{date:string, totalVol:number, totalFreq:number}[]} iepRawSorted
 * @returns {{date, totalVol, totalFreq, avgIEV, surge, avgFreq, freqSurge}[]}
 */
export function withIEPSurge(iepRawSorted) {
  return iepRawSorted.map((d, i) => {
    const hist = iepRawSorted.slice(Math.max(0, i - 5), i)
    const avgV = hist.length ? hist.reduce((s, h) => s + h.totalVol, 0) / hist.length : 0
    const avgF = hist.length ? hist.reduce((s, h) => s + h.totalFreq, 0) / hist.length : 0
    return {
      ...d,
      avgIEV:   avgV,
      surge:    avgV > 0 ? d.totalVol / avgV : null,
      avgFreq:  avgF,
      freqSurge: avgF > 0 ? d.totalFreq / avgF : null
    }
  })
}

// ============================================================
// SEKSI 3: BANGUN ROWS — 1 row = 1 hari trading yang punya entry p0902
// ============================================================

/**
 * Bangun array "rows" siap diuji ke semua CONDITIONS, utk 1 simbol.
 * @param {Object} emitenData
 * @param {{date:string,open,high,low,close,volume,rsi,macdHist,atr,vmaRatio,foreignNet}[]} emitenData.daily - hasil enrichDaily()
 * @param {Object<string,Object>} emitenData.intraday - {date: {p0902, p0905, ...}}
 * @param {{date:string, totalVol:number, totalFreq:number}[]} emitenData.iep - RAW, belum ada surge
 * @param {Object<string,{close,ret,trend}>} ihsgByDate - {date: {trend:'up'|'down'|'flat'|'unknown'}}
 * @returns {Object[]} rows
 */
export function buildRows(emitenData, ihsgByDate) {
  const { daily, intraday, iep } = emitenData

  const iepWithSurge = withIEPSurge([...iep].sort((a, b) => a.date.localeCompare(b.date)))
  const iepByDate = {}
  for (const d of iepWithSurge) iepByDate[d.date] = d

  const dailySorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const ihsgDates = Object.keys(ihsgByDate).sort()

  const rows = []
  for (const date in intraday) {
    const snap = intraday[date]
    if (!snap[ENTRY_KEY]) continue

    const iepRow = iepByDate[date]
    const dailyIdx = dailySorted.findIndex(d => d.date === date)
    const prevDay = dailyIdx > 0 ? dailySorted[dailyIdx - 1] : null

    const ihsgIdx = ihsgDates.indexOf(date)
    const ihsgH1 = ihsgIdx > 0 ? (ihsgByDate[ihsgDates[ihsgIdx - 1]] || {}) : {}

    let gapPct = null
    if (prevDay && prevDay.close && snap[ENTRY_KEY]) {
      gapPct = (snap[ENTRY_KEY] - prevDay.close) / prevDay.close * 100
    }

    let atrPct = null, atrRatio = null
    if (prevDay && prevDay.atr && prevDay.close) {
      atrPct = prevDay.atr / prevDay.close * 100
      const atrWindow = dailySorted.slice(Math.max(0, dailyIdx - 20), dailyIdx)
        .filter(d => d.atr).map(d => d.atr)
      if (atrWindow.length >= 5) {
        const avgAtr = atrWindow.reduce((a, b) => a + b, 0) / atrWindow.length
        atrRatio = avgAtr > 0 ? prevDay.atr / avgAtr : null
      }
    }

    rows.push({
      date, snap, entry: snap[ENTRY_KEY],
      iepSurge:   iepRow ? iepRow.surge : null,
      rsi:        prevDay ? prevDay.rsi : null,
      macdHist:   prevDay ? prevDay.macdHist : null,
      vmaRatio:   prevDay ? prevDay.vmaRatio : null,
      foreignNet: prevDay ? prevDay.foreignNet : null,
      gapPct, atrPct, atrRatio,
      ihsgH1Trend: ihsgH1.trend || 'unknown'
    })
  }
  return rows
}

// ============================================================
// SEKSI 4: SCORING — cari kombinasi (kondisi, exit) TERBAIK utk 1 simbol
// ============================================================

/**
 * @param {Object[]} rows - hasil buildRows()
 * @returns {{bestWR:number, bestSignals:number, bestAvgGain:number, bestExit:string, bestCond:string, totalDays:number} | null}
 */
export function scoreSymbol(rows) {
  if (!rows.length) return null

  let bestWR = 0, bestSignals = 0, bestAvgGain = 0, bestExit = '—', bestCond = '—'

  for (const cond of CONDITIONS) {
    const matched = rows.filter(cond.f)
    if (matched.length < MIN_SAMPLE) continue

    for (const exitKey of EXIT_KEYS) {
      const valid = matched.filter(r => r.snap[exitKey] != null)
      if (valid.length < MIN_SAMPLE) continue

      const wins = valid.filter(r => (r.snap[exitKey] - r.entry) / r.entry * 100 >= WIN_PCT)
      const wr = wins.length / valid.length * 100

      if (wr > bestWR || (wr === bestWR && valid.length > bestSignals)) {
        bestWR = wr
        bestSignals = valid.length
        bestAvgGain = valid.reduce((s, r) => s + (r.snap[exitKey] - r.entry) / r.entry * 100, 0) / valid.length
        bestExit = exitKey
        bestCond = cond.name
      }
    }
  }

  return { bestWR, bestSignals, bestAvgGain, bestExit, bestCond, totalDays: rows.length }
}

// ============================================================
// SEKSI 5: RANKING — semua simbol, urut win rate terbaik
// ============================================================

/**
 * @param {Object<string,{daily,intraday,iep}>} emitenDataBySym
 * @param {Object<string,Object>} ihsgByDate
 * @returns {Object[]} terurut desc bestWR, tie-break desc bestSignals
 */
export function rankEmiten(emitenDataBySym, ihsgByDate) {
  const out = []
  for (const sym in emitenDataBySym) {
    const rows = buildRows(emitenDataBySym[sym], ihsgByDate)
    const score = scoreSymbol(rows)
    if (score) out.push({ sym, ...score })
  }
  out.sort((a, b) => {
    if (b.bestWR !== a.bestWR) return b.bestWR - a.bestWR
    return b.bestSignals - a.bestSignals
  })
  return out
}

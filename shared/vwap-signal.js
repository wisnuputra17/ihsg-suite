/**
 * shared/vwap-signal.js
 * ========================
 * Deteksi VWAP reclaim (bullish) / rejection (bearish) — murni matematika,
 * tidak ada fetch/render/state. REUSE calcVWAP() dari shared/indicators.js
 * utk nilai VWAP-nya sendiri — modul ini cuma deteksi titik CROSS-nya,
 * tidak menghitung VWAP ulang (hindari duplikasi logic).
 *
 * DEFINISI YANG DIPAKAI (simetris, paling umum dipakai di trading parlance —
 * KONFIRMASI ke Wisnu kalau maksudnya beda, mis. "rejection" sbg "harga
 * coba tembus VWAP dari bawah tapi gagal/balik lagi tanpa pernah breakout",
 * itu definisi LAIN yang belum diimplementasikan di sini):
 *   - Reclaim   = harga CLOSE balik ke ATAS VWAP, setelah candle sebelumnya
 *                 close-nya di BAWAH VWAP (bullish — "merebut kembali" rata-rata)
 *   - Rejection = harga CLOSE balik ke BAWAH VWAP, setelah candle sebelumnya
 *                 close-nya di ATAS VWAP (bearish — "ditolak", kehilangan rata-rata)
 *
 * ⚠️ BELUM PERNAH dites Wisnu dgn data pasar nyata — ini fondasi logic+test
 * (dikerjakan dlm "Mode Bakar Token"), BUKAN hasil analisis pasar yang sudah
 * divalidasi.
 */

/**
 * Deteksi SEMUA titik reclaim/rejection di 1 array candle (biasanya scope 1
 * hari, krn VWAP reset tiap hari — lihat calcVWAP).
 * @param {{close:number}[]} candles
 * @param {(number|null)[]} vwapValues - hasil calcVWAP(candles), HARUS SAMA
 *   PANJANG & URUTAN dgn candles (index i candles ↔ index i vwapValues)
 * @returns {{barIndex:number, direction:('reclaim'|'rejection'), close:number, vwap:number}[]}
 *   array kosong kalau tidak ada cross sama sekali
 */
export function detectVwapCrosses(candles, vwapValues) {
  const out = []
  if (!candles || !vwapValues || candles.length !== vwapValues.length) return out

  for (let i = 1; i < candles.length; i++) {
    const prevVwap = vwapValues[i - 1]
    const curVwap  = vwapValues[i]
    if (prevVwap == null || curVwap == null) continue // warmup VWAP (awal hari, belum ada volume) -- skip

    const prevClose = candles[i - 1].close
    const curClose  = candles[i].close
    if (prevClose == null || curClose == null) continue

    // Sengaja pakai strict < / > (bukan <=/>=) utk status "sebelumnya" --
    // candle yang persis di garis VWAP (close===vwap) dianggap netral,
    // tidak dihitung sbg "di atas" atau "di bawah" -- hindari sinyal palsu
    // dari noise pas harga pas banget di rata-rata.
    const wasBelow = prevClose < prevVwap
    const wasAbove = prevClose > prevVwap
    const isAboveNow = curClose >= curVwap
    const isBelowNow = curClose <= curVwap

    if (wasBelow && isAboveNow) {
      out.push({ barIndex: i, direction: 'reclaim', close: curClose, vwap: curVwap })
    } else if (wasAbove && isBelowNow) {
      out.push({ barIndex: i, direction: 'rejection', close: curClose, vwap: curVwap })
    }
  }
  return out
}

/**
 * Cari cross PERTAMA saja (dipakai utk alert real-time — begitu ketemu 1,
 * berhenti, tidak perlu scan semua sisa hari).
 * @returns {{barIndex:number, direction:('reclaim'|'rejection'), close:number, vwap:number} | null}
 */
export function detectFirstVwapCross(candles, vwapValues) {
  const all = detectVwapCrosses(candles, vwapValues)
  return all.length ? all[0] : null
}

/**
 * shared/orb.test.js
 * ====================
 * Fixture candle dibuat manual, nilai high/low/close/volume dihitung dulu
 * sebelum jadi assertion (sama prinsip dgn test lain di proyek ini).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeOpeningRange, detectBreakout, scanForFirstBreakout } from './orb.js'

// ============================================================
// computeOpeningRange
// ============================================================

test('computeOpeningRange: ambil high tertinggi & low terendah dari N candle pertama', () => {
  const candles = [
    { high: 105, low: 95, close: 100, volume: 1000 },
    { high: 108, low: 98, close: 103, volume: 1200 },
    { high: 106, low: 99, close: 102, volume: 900 },
    { high: 999, low: 1,  close: 500, volume: 1 } // candle ke-4, HARUS diabaikan (di luar window 3)
  ]
  const range = computeOpeningRange(candles, 3)
  assert.deepEqual(range, { high: 108, low: 95, barCount: 3 })
})

test('computeOpeningRange: candle lebih sedikit dari rangeBarCount -> null', () => {
  const candles = [{ high: 105, low: 95, close: 100, volume: 1000 }]
  assert.equal(computeOpeningRange(candles, 3), null)
})

test('computeOpeningRange: candles kosong/rangeBarCount 0 -> null', () => {
  assert.equal(computeOpeningRange([], 5), null)
  assert.equal(computeOpeningRange([{ high: 1, low: 1 }], 0), null)
})

// ============================================================
// detectBreakout
// ============================================================

const RANGE = { high: 108, low: 95, barCount: 3 }

test('detectBreakout: close di atas range.high -> bull', () => {
  assert.equal(detectBreakout({ close: 109 }, RANGE), 'bull')
})

test('detectBreakout: close di bawah range.low -> bear', () => {
  assert.equal(detectBreakout({ close: 94 }, RANGE), 'bear')
})

test('detectBreakout: close di DALAM range -> null (bukan breakout)', () => {
  assert.equal(detectBreakout({ close: 100 }, RANGE), null)
})

test('detectBreakout: close PERSIS di range.high -> null (harus BENAR2 lewat, bukan cuma sentuh)', () => {
  assert.equal(detectBreakout({ close: 108 }, RANGE), null)
})

test('detectBreakout: close PERSIS di range.low -> null', () => {
  assert.equal(detectBreakout({ close: 95 }, RANGE), null)
})

// ============================================================
// scanForFirstBreakout
// ============================================================

test('scanForFirstBreakout: ketemu breakout bull pertama, volumeRatio dihitung benar', () => {
  // Opening range (3 candle): high=108, low=95, avgVolume=(1000+1200+900)/3=1033.333...
  const candles = [
    { high: 105, low: 95, close: 100, volume: 1000 },
    { high: 108, low: 98, close: 103, volume: 1200 },
    { high: 106, low: 99, close: 102, volume: 900 },
    { high: 109, low: 103, close: 107, volume: 500 },  // close 107 < 108 -- BELUM breakout
    { high: 112, low: 104, close: 110, volume: 2000 }  // close 110 > 108 -- BREAKOUT BULL, vol 2000/1033.33=1.935
  ]
  const result = scanForFirstBreakout(candles, 3)
  assert.equal(result.direction, 'bull')
  assert.equal(result.barIndex, 4)
  assert.ok(Math.abs(result.volumeRatio - 1.935483870967742) < 1e-9)
})

test('scanForFirstBreakout: minVolumeMultiplier -- skip breakout yg volumenya kurang, lanjut cari berikutnya', () => {
  const candles = [
    { high: 105, low: 95, close: 100, volume: 1000 },
    { high: 108, low: 98, close: 103, volume: 1200 },
    { high: 106, low: 99, close: 102, volume: 900 },
    { high: 112, low: 104, close: 110, volume: 2000 }, // breakout bull tapi vol ratio 1.935 -- KURANG dari syarat 2.0
    { high: 115, low: 109, close: 113, volume: 3000 }  // breakout bull lagi, vol ratio 3000/1033.33=2.903 -- CUKUP
  ]
  const result = scanForFirstBreakout(candles, 3, { minVolumeMultiplier: 2.0 })
  assert.equal(result.barIndex, 4) // BUKAN index 3 -- yg itu di-skip krn volume kurang
  assert.ok(result.volumeRatio >= 2.0)
})

test('scanForFirstBreakout: breakout bear (arah turun) terdeteksi benar', () => {
  const candles = [
    { high: 105, low: 95, close: 100, volume: 1000 },
    { high: 108, low: 98, close: 103, volume: 1200 },
    { high: 106, low: 99, close: 102, volume: 900 },
    { high: 96,  low: 90, close: 92,  volume: 1500 } // close 92 < range.low(95) -- breakout BEAR
  ]
  const result = scanForFirstBreakout(candles, 3)
  assert.equal(result.direction, 'bear')
  assert.equal(result.barIndex, 3)
})

test('scanForFirstBreakout: tidak ada breakout sepanjang hari -> null', () => {
  const candles = [
    { high: 105, low: 95, close: 100, volume: 1000 },
    { high: 108, low: 98, close: 103, volume: 1200 },
    { high: 106, low: 99, close: 102, volume: 900 },
    { high: 107, low: 96, close: 101, volume: 800 }, // tetap di dalam range [95,108]
    { high: 106, low: 97, close: 99,  volume: 700 }
  ]
  assert.equal(scanForFirstBreakout(candles, 3), null)
})

test('scanForFirstBreakout: candle tidak cukup utk opening range sama sekali -> null', () => {
  const candles = [{ high: 105, low: 95, close: 100, volume: 1000 }]
  assert.equal(scanForFirstBreakout(candles, 3), null)
})

test('scanForFirstBreakout: minVolumeMultiplier tapi avgRangeVolume=0 -- tidak crash, volumeRatio null, breakout di-skip', () => {
  const candles = [
    { high: 105, low: 95, close: 100, volume: 0 },
    { high: 108, low: 98, close: 103, volume: 0 },
    { high: 106, low: 99, close: 102, volume: 0 },
    { high: 112, low: 104, close: 110, volume: 500 } // breakout, tapi avgRangeVolume=0 -> volumeRatio=null
  ]
  const result = scanForFirstBreakout(candles, 3, { minVolumeMultiplier: 1.5 })
  assert.equal(result, null) // tidak ada breakout LAIN yg lolos syarat volume, dan yg ini di-skip krn volumeRatio null
})

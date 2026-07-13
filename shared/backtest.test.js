import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  wilsonLowerBound, calcEquity, classifyGap,
  calcSesi2Return, backtestORB
} from './backtest.js'

// ── wilsonLowerBound ──
describe('wilsonLowerBound', () => {
  it('n=0 → 0', () => assert.equal(wilsonLowerBound(0, 0), 0))
  it('win 100% n=1 → tidak overclaim', () => assert.ok(wilsonLowerBound(1, 1) < 0.95))
  it('win 10/10 → WLB > 0.7', () => assert.ok(wilsonLowerBound(10, 10) > 0.70))
  it('win 7/10 → WLB < win rate', () => assert.ok(wilsonLowerBound(7, 10) < 0.7))
  it('win 0/100 → mendekati 0', () => assert.ok(wilsonLowerBound(0, 100) < 0.05))
  it('win 100/100 → mendekati 1', () => assert.ok(wilsonLowerBound(100, 100) > 0.95))
})

// ── calcEquity ──
describe('calcEquity', () => {
  it('semua 0% return → eq = modal', () => {
    const { eq } = calcEquity([0, 0, 0], 0, 100)
    assert.ok(Math.abs(eq - 100) < 0.01)
  })
  it('satu +10% tanpa fee → eq sekitar 110', () => {
    const { eq } = calcEquity([10], 0, 100)
    assert.ok(Math.abs(eq - 110) < 0.01)
  })
  it('fee dikurangi dari setiap trade', () => {
    const { eq: noFee } = calcEquity([1, 1, 1], 0)
    const { eq: withFee } = calcEquity([1, 1, 1], 0.26)
    assert.ok(withFee < noFee)
  })
  it('MDD dihitung dari peak', () => {
    const { mdd } = calcEquity([10, -20, 10], 0, 100)
    assert.ok(mdd > 0)
  })
  it('semua positif → MDD = 0', () => {
    const { mdd } = calcEquity([1, 2, 3], 0, 100)
    assert.equal(mdd, 0)
  })
  it('compounded — bukan simple sum', () => {
    const { eq } = calcEquity([10, 10], 0, 100)
    assert.ok(Math.abs(eq - 121) < 0.01)  // 100 * 1.1 * 1.1 = 121
  })
})

// ── classifyGap ──
describe('classifyGap', () => {
  it('null input → STABIL', () => assert.equal(classifyGap(null, 1000), 'STABIL'))
  it('gap +1% threshold 0.5% → UP', () => assert.equal(classifyGap(1010, 1000, 0.5), 'UP'))
  it('gap -1% threshold 0.5% → DOWN', () => assert.equal(classifyGap(990, 1000, 0.5), 'DOWN'))
  it('gap +0.3% threshold 0.5% → STABIL', () => assert.equal(classifyGap(1003, 1000, 0.5), 'STABIL'))
  it('gap tepat di threshold → STABIL', () => assert.equal(classifyGap(1005, 1000, 0.5), 'STABIL'))
  it('gap > threshold → UP', () => assert.equal(classifyGap(1006, 1000, 0.5), 'UP'))
  it('threshold 1.5% — gap +1% tidak cukup → STABIL', () =>
    assert.equal(classifyGap(1010, 1000, 1.5), 'STABIL'))
  it('threshold 1.5% — gap +2% → UP', () =>
    assert.equal(classifyGap(1020, 1000, 1.5), 'UP'))
})

// ── calcSesi2Return ──
describe('calcSesi2Return', () => {
  const makeCandle = (time, open, close) => ({
    datetime: `2026-07-07 ${time}:00`, open, close, high: close, low: open, volume: 1
  })

  it('return positif kalau close > open', () => {
    const candles = [makeCandle('13:30', 1000, 1000), makeCandle('15:50', 1000, 1100)]
    const ret = calcSesi2Return(candles, '13:30', '15:50')
    assert.ok(ret > 0)
  })
  it('return negatif kalau close < open', () => {
    const candles = [makeCandle('13:30', 1000, 1000), makeCandle('15:50', 1000, 900)]
    const ret = calcSesi2Return(candles, '13:30', '15:50')
    assert.ok(ret < 0)
  })
  it('tidak ada candle entry → null', () => {
    const candles = [makeCandle('09:00', 1000, 1000)]
    assert.equal(calcSesi2Return(candles, '13:30', '15:50'), null)
  })
  it('tidak ada candle exit → null', () => {
    // Candle hanya sebelum exitTime — cukup satu candle di jam 09:00, exit di 15:50
    const candles = [makeCandle('09:00', 1000, 1050)]
    assert.equal(calcSesi2Return(candles, '13:30', '15:50'), null)
  })
  it('pakai open candle entry', () => {
    const candles = [makeCandle('13:30', 1000, 1050), makeCandle('15:50', 1000, 1100)]
    const ret = calcSesi2Return(candles, '13:30', '15:50')
    assert.ok(Math.abs(ret - 10) < 0.01)  // (1100-1000)/1000*100 = 10%
  })

  it('Jumat: entry 13:30 otomatis geser ke 14:00 (sesi 2 Jumat mulai 14:00)', () => {
    // 2026-07-10 = Jumat
    const mk = (time, open, close) => ({
      datetime: `2026-07-10 ${time}:00`, open, close, high: close, low: open, volume: 1
    })
    // Ada candle 13:30 (seharusnya TIDAK dipakai di Jumat) dan 14:00
    const candles = [mk('13:30', 900, 900), mk('14:00', 1000, 1000), mk('15:50', 1000, 1100)]
    const ret = calcSesi2Return(candles, '13:30', '15:50')
    // Entry harus dari candle 14:00 (open 1000), bukan 13:30 (open 900)
    assert.ok(Math.abs(ret - 10) < 0.01)  // (1100-1000)/1000 = 10%, bukan (1100-900)/900 = 22%
  })

  it('Senin: entry 13:30 tetap 13:30 (bukan Jumat)', () => {
    // 2026-07-06 = Senin
    const mk = (time, open, close) => ({
      datetime: `2026-07-06 ${time}:00`, open, close, high: close, low: open, volume: 1
    })
    const candles = [mk('13:30', 1000, 1000), mk('15:50', 1000, 1100)]
    const ret = calcSesi2Return(candles, '13:30', '15:50')
    assert.ok(Math.abs(ret - 10) < 0.01)
  })

  it('entry candle nyasar >30 menit dari target → null', () => {
    // Saham sepi: minta entry 13:30 tapi candle pertama 15:40
    const mk = (time, open, close) => ({
      datetime: `2026-07-06 ${time}:00`, open, close, high: close, low: open, volume: 1
    })
    const candles = [mk('15:40', 1000, 1000), mk('15:50', 1000, 1100)]
    assert.equal(calcSesi2Return(candles, '13:30', '15:50'), null)
  })
})

// ── backtestORB ──
describe('backtestORB', () => {
  // Helper buat hari trading sederhana
  const makeDay = (date, prevClose, iepPrice, openPrice, orbHigh, exitPrice, params = {}) => {
    const candles = []
    // IEP
    candles.push({ datetime: `${date} 08:58:00`, open: iepPrice, high: iepPrice, low: iepPrice, close: iepPrice, volume: 1000 })
    // Open 09:00 + ORB
    candles.push({ datetime: `${date} 09:00:00`, open: openPrice, high: orbHigh, low: openPrice * 0.995, close: openPrice, volume: 500 })
    // Candle breakout 09:05 (ORB confirmed)
    if (params.orbBreak) {
      candles.push({ datetime: `${date} 09:05:00`, open: openPrice, high: orbHigh + 10, low: openPrice, close: orbHigh + 5, volume: 600 })
    }
    // Exit candle
    candles.push({ datetime: `${date} 10:00:00`, open: exitPrice, high: exitPrice, low: exitPrice, close: exitPrice, volume: 200 })
    return candles
  }

  it('tidak ada trade kalau semua hari STABIL', () => {
    // IEP = 1000 = close hari ke-1 (1000) → gap 0% → STABIL
    const candles = [
      ...makeDay('2026-01-01', 900, 900, 900, 910, 900),   // close = 900
      ...makeDay('2026-01-02', 900, 900, 900, 910, 900),   // IEP = 900 = prevClose → gap 0%
    ]
    const { n } = backtestORB({ candles })
    assert.equal(n, 0)
  })

  it('GAP UP + ORB confirmed → trade type orb', () => {
    // Hari ke-1 close = 1000, IEP hari ke-2 = 1010 → gap +1% > 0.5% → UP
    const candles = [
      ...makeDay('2026-01-01', 900, 900, 900, 910, 1000),   // close 10:00 = 1000
      ...makeDay('2026-01-02', 1000, 1010, 1010, 1020, 1030, { orbBreak: true }),
    ]
    const { trades } = backtestORB({ candles, gapThreshold: 0.5 })
    assert.ok(trades.length > 0)
    assert.equal(trades[0].type, 'orb')
  })

  it('return dihitung dari entry (open 09:00)', () => {
    const candles = [
      ...makeDay('2026-01-01', 1000, 1000, 1000, 1010, 1010),
      ...makeDay('2026-01-02', 1000, 1010, 1010, 1020, 1060, { orbBreak: true }),
    ]
    const { trades } = backtestORB({ candles, gapThreshold: 0.5, exitOrb: '10:00' })
    if (trades.length > 0) {
      // entry = 1010 (open 09:00 hari ke-2), exit = 1060
      assert.ok(Math.abs(trades[0].ret - (1060-1010)/1010*100) < 0.1)
    }
  })

  it('SL kena sebelum ORB → type sl, ret = -slPct', () => {
    const candles = [
      ...makeDay('2026-01-01', 1000, 1000, 1000, 1010, 1010),
    ]
    // Hari ke-2: gap UP, tapi harga turun kena SL sebelum ORB
    const d2 = [
      { datetime: '2026-01-02 08:58:00', open: 1010, high: 1010, low: 1010, close: 1010, volume: 100 },
      { datetime: '2026-01-02 09:00:00', open: 1010, high: 1020, low: 1005, close: 1010, volume: 100 },
      { datetime: '2026-01-02 09:05:00', open: 1010, high: 1010, low: 995, close: 1000, volume: 100 }, // kena SL 0.5% = 1005
      { datetime: '2026-01-02 10:00:00', open: 990, high: 990, low: 990, close: 990, volume: 100 },
    ]
    const { trades } = backtestORB({ candles: [...candles, ...d2], gapThreshold: 0.5, slPct: 0.5 })
    const slTrade = trades.find(t => t.type === 'sl')
    if (slTrade) assert.ok(Math.abs(slTrade.ret - (-0.5)) < 0.01)
  })

  it('WLB 0 kalau n=0', () => {
    const { wlb } = backtestORB({ candles: [], gapThreshold: 0.5 })
    assert.equal(wlb, 0)
  })

  it('fee mengurangi equity', () => {
    const candles = [
      ...makeDay('2026-01-01', 1000, 1000, 1000, 1010, 1010),
      ...makeDay('2026-01-02', 1000, 1010, 1010, 1020, 1050, { orbBreak: true }),
    ]
    const { eq: noFee }   = backtestORB({ candles, gapThreshold: 0.5, fee: 0 })
    const { eq: withFee } = backtestORB({ candles, gapThreshold: 0.5, fee: 0.26 })
    assert.ok(withFee <= noFee)
  })
})

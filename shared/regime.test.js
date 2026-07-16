import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyTrend, momentum, relativeStrength, regimeScore, regimeLabel } from './regime.js'

const rising  = Array.from({length: 60}, (_, i) => 100 + i * 2)   // naik konsisten
const falling = Array.from({length: 60}, (_, i) => 200 - i * 2)   // turun konsisten
const flat    = Array.from({length: 60}, () => 100)

describe('classifyTrend', () => {
  it('rising → UPTREND', () => assert.equal(classifyTrend(rising), 'UPTREND'))
  it('falling → DOWNTREND', () => assert.equal(classifyTrend(falling), 'DOWNTREND'))
  it('flat → SIDEWAYS', () => assert.equal(classifyTrend(flat), 'SIDEWAYS'))
  it('data < 50 → null', () => assert.equal(classifyTrend([1,2,3]), null))
})

describe('momentum', () => {
  it('rising 20d positif', () => assert.ok(momentum(rising, 20) > 0))
  it('falling 20d negatif', () => assert.ok(momentum(falling, 20) < 0))
  it('flat ~0', () => assert.equal(momentum(flat, 20), 0))
})

describe('relativeStrength', () => {
  it('sektor naik lebih cepat → OUTPERFORM', () => {
    const sector = Array.from({length: 40}, (_, i) => 100 + i * 3)
    const bench  = Array.from({length: 40}, (_, i) => 100 + i * 1)
    assert.equal(relativeStrength(sector, bench, 20).rs, 'OUTPERFORM')
  })
  it('sektor turun relatif → UNDERPERFORM', () => {
    const sector = Array.from({length: 40}, (_, i) => 100 - i * 1)
    const bench  = Array.from({length: 40}, (_, i) => 100 + i * 1)
    assert.equal(relativeStrength(sector, bench, 20).rs, 'UNDERPERFORM')
  })
})

describe('regimeScore & label', () => {
  it('semua bullish → tinggi', () => {
    const s = regimeScore('UPTREND', 'UPTREND', 'OUTPERFORM')
    assert.ok(s >= 66)
    assert.equal(regimeLabel(s).label, 'KONDUSIF')
  })
  it('semua bearish → rendah', () => {
    const s = regimeScore('DOWNTREND', 'DOWNTREND', 'UNDERPERFORM')
    assert.ok(s < 33)
    assert.equal(regimeLabel(s).label, 'DEFENSIF')
  })
  it('campuran → tengah', () => {
    const s = regimeScore('SIDEWAYS', 'SIDEWAYS', 'INLINE')
    assert.equal(s, 50)
    assert.equal(regimeLabel(s).label, 'HATI-HATI')
  })
  it('skor clamp 0-100', () => {
    assert.ok(regimeScore('UPTREND','UPTREND','OUTPERFORM') <= 100)
    assert.ok(regimeScore('DOWNTREND','DOWNTREND','UNDERPERFORM') >= 0)
  })
})

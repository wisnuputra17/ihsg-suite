import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isTradingDay, prevTradingDay, nextTradingDay, tickSize, roundToTick } from './idx-calendar.js'

describe('isTradingDay', () => {
  it('Senin biasa → true', () => assert.equal(isTradingDay('2026-07-06'), true))
  it('Sabtu → false', () => assert.equal(isTradingDay('2026-07-11'), false))
  it('Minggu → false', () => assert.equal(isTradingDay('2026-07-12'), false))
  it('Tahun Baru → false', () => assert.equal(isTradingDay('2026-01-01'), false))
  it('Kemerdekaan → false', () => assert.equal(isTradingDay('2026-08-17'), false))
})

describe('prevTradingDay', () => {
  it('Senin → Jumat (skip weekend)', () => assert.equal(prevTradingDay('2026-07-06'), '2026-07-03'))
  it('setelah libur Pancasila (2 Jun) → 29 Mei', () => {
    // 1 Jun 2026 = Senin libur Pancasila, 30-31 Mei weekend
    assert.equal(prevTradingDay('2026-06-02'), '2026-05-29')
  })
})

describe('nextTradingDay', () => {
  it('Jumat → Senin', () => assert.equal(nextTradingDay('2026-07-03'), '2026-07-06'))
})

describe('tickSize', () => {
  it('harga 150 → tick 1', () => assert.equal(tickSize(150), 1))
  it('harga 350 → tick 2', () => assert.equal(tickSize(350), 2))
  it('harga 1000 → tick 5', () => assert.equal(tickSize(1000), 5))
  it('harga 4000 (RAJA) → tick 10', () => assert.equal(tickSize(4000), 10))
  it('harga 8000 → tick 25', () => assert.equal(tickSize(8000), 25))
})

describe('roundToTick', () => {
  it('4127 nearest → 4130 (tick 10)', () => assert.equal(roundToTick(4127), 4130))
  it('4127 down → 4120', () => assert.equal(roundToTick(4127, 'down'), 4120))
  it('4121 up → 4130', () => assert.equal(roundToTick(4121, 'up'), 4130))
})

/**
 * shared/monitor.test.js
 * ======================
 * Test untuk EmitenMonitor — fokus pada state machine orbStatus
 * dan logika kalkulasi yang bisa ditest tanpa DOM/API.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { wibTime, isMarketHours, shouldFetchAfterMarket } from './monitor.js'

// ── Helper: mock jam WIB ──────────────────────────────────────────────────────
// Karena wibTime() pakai Date.now(), kita test logika state machine secara langsung

/**
 * Simulasi _compute() state machine dengan parameter yang bisa dikontrol.
 * Ini versi pure dari logika di EmitenMonitor._compute() tanpa fetch.
 */
function computeOrbStatus({ gapCat, brokenUp, timeNow, orb_deadline, exit_up, exit_down, exit_avoid, openPrice = 1000, orbHigh = 1010 }) {
  const exitOrbTime   = gapCat === 'DOWN' ? exit_down : exit_up
  const exitAvoidTime = exit_avoid

  let orbStatus, exitPrice = null, tradeReturn = null

  if (gapCat === 'STABIL' && timeNow < '09:00') {
    orbStatus = 'skip'
  } else if (timeNow < '08:58') {
    orbStatus = 'pre_iep'
  } else if (timeNow < '09:00') {
    orbStatus = gapCat === 'STABIL' ? 'skip' : 'iep_confirmed'
  } else if (timeNow < '09:05') {
    orbStatus = gapCat === 'STABIL' ? 'skip' : 'orb_forming'
  } else if (brokenUp) {
    if (timeNow >= exitOrbTime) {
      orbStatus = 'done_orb'
    } else {
      orbStatus = 'broken_up'
    }
  } else if (timeNow < orb_deadline) {
    orbStatus = gapCat === 'STABIL' ? 'skip' : 'waiting'
  } else {
    orbStatus = 'done_avoid'
  }

  return { orbStatus, exitOrbTime, exitAvoidTime }
}

describe('EmitenMonitor state machine (RAJA config)', () => {
  const RAJA = { orb_deadline: '09:15', exit_up: '10:00', exit_down: '09:15', exit_avoid: '09:15' }
  const MBMA = { orb_deadline: '09:31', exit_up: '09:30', exit_down: '09:30', exit_avoid: '09:15' }

  // ── Pre-market ──
  it('pre_iep: sebelum 08:58, gap UP', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'UP', brokenUp: false, timeNow: '08:30' })
    assert.equal(orbStatus, 'pre_iep')
  })

  it('pre_iep: sebelum 08:58, gap DOWN', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'DOWN', brokenUp: false, timeNow: '07:00' })
    assert.equal(orbStatus, 'pre_iep')
  })

  it('skip: STABIL sebelum 09:00', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'STABIL', brokenUp: false, timeNow: '08:50' })
    assert.equal(orbStatus, 'skip')
  })

  // ── IEP Confirmed 08:58-08:59 ──
  it('iep_confirmed: 08:58, gap UP', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'UP', brokenUp: false, timeNow: '08:58' })
    assert.equal(orbStatus, 'iep_confirmed')
  })

  it('iep_confirmed: 08:59, gap DOWN', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'DOWN', brokenUp: false, timeNow: '08:59' })
    assert.equal(orbStatus, 'iep_confirmed')
  })

  it('skip: 08:58, STABIL (bukan iep_confirmed)', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'STABIL', brokenUp: false, timeNow: '08:58' })
    assert.equal(orbStatus, 'skip')
  })

  // ── ORB forming 09:00-09:04 ──
  it('orb_forming: 09:00, gap UP', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'UP', brokenUp: false, timeNow: '09:00' })
    assert.equal(orbStatus, 'orb_forming')
  })

  it('orb_forming: 09:04, gap DOWN', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'DOWN', brokenUp: false, timeNow: '09:04' })
    assert.equal(orbStatus, 'orb_forming')
  })

  it('skip: 09:03, STABIL', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'STABIL', brokenUp: false, timeNow: '09:03' })
    assert.equal(orbStatus, 'skip')
  })

  // ── Waiting / ORB monitoring ──
  it('waiting: 09:05, gap UP, belum ada breakout', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'UP', brokenUp: false, timeNow: '09:05' })
    assert.equal(orbStatus, 'waiting')
  })

  it('waiting: 09:14, gap DOWN, belum ada breakout', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'DOWN', brokenUp: false, timeNow: '09:14' })
    assert.equal(orbStatus, 'waiting')
  })

  // ── ORB broken_up / done_orb ──
  it('broken_up: 09:07, gap UP, ada breakout, belum lewat exit', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'UP', brokenUp: true, timeNow: '09:07' })
    assert.equal(orbStatus, 'broken_up')
  })

  it('done_orb: 10:00, gap UP, ada breakout, sudah lewat exit_up', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'UP', brokenUp: true, timeNow: '10:00' })
    assert.equal(orbStatus, 'done_orb')
  })

  it('done_orb: 09:15, gap DOWN, ada breakout, sudah lewat exit_down', () => {
    const { orbStatus, exitOrbTime } = computeOrbStatus({ ...RAJA, gapCat: 'DOWN', brokenUp: true, timeNow: '09:15' })
    assert.equal(orbStatus, 'done_orb')
    assert.equal(exitOrbTime, '09:15')  // exit_down untuk RAJA
  })

  it('done_orb: 15:00, gap UP, sudah jauh lewat exit', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'UP', brokenUp: true, timeNow: '15:00' })
    assert.equal(orbStatus, 'done_orb')
  })

  // ── Done avoid ──
  it('done_avoid: 09:15, gap UP, tidak ada breakout (RAJA deadline)', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'UP', brokenUp: false, timeNow: '09:15' })
    assert.equal(orbStatus, 'done_avoid')
  })

  it('done_avoid: 16:00, gap DOWN, tidak ada breakout', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'DOWN', brokenUp: false, timeNow: '16:00' })
    assert.equal(orbStatus, 'done_avoid')
  })

  // ── STABIL setelah 09:00 tetap done_avoid (bukan skip) ──
  it('done_avoid: STABIL setelah deadline', () => {
    const { orbStatus } = computeOrbStatus({ ...RAJA, gapCat: 'STABIL', brokenUp: false, timeNow: '09:20' })
    assert.equal(orbStatus, 'done_avoid')
  })

  // ── MBMA config ──
  it('MBMA: waiting sampai 09:30 (deadline 09:31)', () => {
    const { orbStatus } = computeOrbStatus({ ...MBMA, gapCat: 'UP', brokenUp: false, timeNow: '09:25' })
    assert.equal(orbStatus, 'waiting')
  })

  it('MBMA: done_avoid setelah 09:31', () => {
    const { orbStatus } = computeOrbStatus({ ...MBMA, gapCat: 'UP', brokenUp: false, timeNow: '09:31' })
    assert.equal(orbStatus, 'done_avoid')
  })

  it('MBMA: done_orb setelah 09:30 kalau ada breakout', () => {
    const { orbStatus, exitOrbTime } = computeOrbStatus({ ...MBMA, gapCat: 'UP', brokenUp: true, timeNow: '09:30' })
    assert.equal(orbStatus, 'done_orb')
    assert.equal(exitOrbTime, '09:30')  // exit_up MBMA
  })

  it('MBMA: exit_down = exit_up = 09:30 (kedua kondisi sama)', () => {
    const up   = computeOrbStatus({ ...MBMA, gapCat: 'UP',   brokenUp: true, timeNow: '09:30' })
    const down = computeOrbStatus({ ...MBMA, gapCat: 'DOWN', brokenUp: true, timeNow: '09:30' })
    assert.equal(up.exitOrbTime,   '09:30')
    assert.equal(down.exitOrbTime, '09:30')
  })
})

describe('shouldFetchAfterMarket', () => {
  it('returns boolean', () => {
    const result = shouldFetchAfterMarket('09:15')
    assert.equal(typeof result, 'boolean')
  })
})

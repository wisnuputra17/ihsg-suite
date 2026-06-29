/**
 * features/win-rate/db.test.js
 * =============================
 * db.js sekarang import dari shared/indexeddb.js (migrasi dari firebase.js,
 * 29 Jun 2026) -- pakai 'fake-indexeddb/auto' (implementasi MURNI JS dari
 * spec IndexedDB asli), jadi test ini pakai STORAGE ASLI, BUKAN simulasi
 * manual. gsAppend di-wrap mock.fn() supaya tetap bisa diperiksa "berapa
 * kali & data apa" -- spy ini tetap MEMANGGIL implementasi asli di
 * baliknya. Pola identik dgn features/ranking-emiten/db.test.js.
 */
import 'fake-indexeddb/auto'
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import * as IDB from '../../shared/indexeddb.js'

const _gsAppendSpy = mock.fn(IDB.gsAppend)

mock.module('../../shared/indexeddb.js', {
  namedExports: {
    gsLoad: IDB.gsLoad,
    gsAppend: _gsAppendSpy,
    gsSave: IDB.gsSave,
    gsClear: IDB.gsClear,
    gsLoadFiltered: IDB.gsLoadFiltered
  }
})

const {
  DB, loadSym, appendDaily, appendIntraday,
  rowToDaily, dailyToRow, rowToIntraday, intradayToRow
} = await import('./db.js')

function _appendCalls() {
  return _gsAppendSpy.mock.calls.map(c => ({ sheet: c.arguments[0], data: c.arguments[1] }))
}

async function resetMocks() {
  _gsAppendSpy.mock.resetCalls()
  await IDB._resetForTesting()
}

// ============================================================
// Mapper round-trip — PURE, tidak butuh fetch
// ============================================================

test('dailyToRow -> rowToDaily: round-trip nilai tidak berubah', () => {
  const d = {
    date: '2026-01-15', open: 1000, high: 1050, low: 980, close: 1020, volume: 50000,
    foreignbuy: 3000, foreignsell: 2000, rsi: 55.5, macdHist: -1.2, atr: 18.3,
    vmaRatio: 1.1, foreignNet: 1000, returnPct: 2.0
  }
  const row = dailyToRow('BBCA', d)
  assert.equal(row.sym, 'BBCA')
  const back = rowToDaily(row)
  assert.deepEqual(back, d)
})

test('rowToDaily: normalisasi tanggal WAJIB (Sheets auto-convert ke ISO penuh)', () => {
  const row = { date: '2026-01-15T00:00:00.000Z', open: '1000', high: '1050', low: '980',
    close: '1020', volume: '50000', foreignbuy: '3000', foreignsell: '2000',
    rsi: '', macdHist: '', atr: '', vmaRatio: '', foreignNet: '', returnPct: '' }
  const d = rowToDaily(row)
  assert.equal(d.date, '2026-01-15') // bukan '2026-01-15T00:00:00.000Z'
  assert.equal(d.rsi, null)          // string kosong dari Sheets -> null, bukan NaN/0
  assert.equal(d.open, 1000)         // string number -> Number (open = IEP, field krusial)
})

test('intradayToRow -> rowToIntraday: round-trip, kolom yang hilang tidak nyangkut sbg NaN', () => {
  const snap = { p0905: 1010, p0910: 1020 } // sengaja parsial, sisanya belum ada datanya
  const row = intradayToRow('BBCA', '2026-01-15', snap)
  assert.equal(row.p0905, 1010)
  assert.equal(row.p1600, '') // kolom kosong, bukan undefined/NaN
  assert.equal('p0902' in row, false) // entry BUKAN lagi kolom intraday

  const back = rowToIntraday(row)
  assert.deepEqual(back, snap) // kolom kosong TIDAK muncul di object hasil parse balik
  assert.equal('p1600' in back, false)
})

// ============================================================
// loadSym — pakai mock fetch
// ============================================================

test('loadSym: filter per simbol dengan benar, simbol lain tidak nyasar masuk', async () => {
  await resetMocks()
  await IDB.gsSave('winrate-daily', [
    { sym: 'BBCA', date: '2026-01-15', open: '1000', high: '1050', low: '980', close: '1020',
      volume: '1000', foreignbuy: '1', foreignsell: '1', rsi: '50', macdHist: '0', atr: '10',
      vmaRatio: '1', foreignNet: '0', returnPct: '0' },
    { sym: 'TLKM', date: '2026-01-15', open: '500', high: '510', low: '490', close: '505',
      volume: '500', foreignbuy: '1', foreignsell: '1', rsi: '60', macdHist: '0', atr: '5',
      vmaRatio: '1', foreignNet: '0', returnPct: '0' }
  ])

  const e = await loadSym('BBCA')
  assert.equal(e.daily.length, 1)
  assert.equal(e.daily[0].close, 1020)
  assert.equal(DB.emiten.TLKM, undefined) // TLKM belum pernah di-loadSym, tidak ikut nyangkut
})

test('loadSym: idempoten dalam 1 sesi — panggil 2x tidak fetch 2x', async () => {
  await resetMocks()
  await IDB.gsSave('winrate-daily', [
    { sym: 'GOTO', date: '2026-01-10', open: '100', high: '105', low: '95', close: '102',
      volume: '1', foreignbuy: '0', foreignsell: '0', rsi: '', macdHist: '', atr: '',
      vmaRatio: '', foreignNet: '', returnPct: '' }
  ])

  await loadSym('GOTO')
  await IDB.gsAppend('winrate-daily', [{ sym: 'GOTO', date: '2026-01-11' }]) // simulasi data baru ke storage
  const e2 = await loadSym('GOTO') // panggilan ke-2 — harusnya tidak fetch ulang
  assert.equal(e2.daily.length, 1) // tetap 1, bukan ikut data "baru" yg disuntik manual di atas
})

// ============================================================
// appendDaily / appendIntraday — dedup
// ============================================================

test('appendDaily: hari yang sudah ada di-skip, cuma hari baru yang benar2 dikirim ke gsAppend', async () => {
  await resetMocks()
  await loadSym('UNVR') // load kosong dulu (sheet belum ada data UNVR)

  const day1 = { date: '2026-02-01', open: 100, high: 105, low: 95, close: 102, volume: 1,
    foreignbuy: 0, foreignsell: 0, rsi: null, macdHist: null, atr: null, vmaRatio: null,
    foreignNet: null, returnPct: 0 }
  const day2 = { ...day1, date: '2026-02-02' }

  const r1 = await appendDaily('UNVR', [day1])
  assert.equal(r1.written, 1)
  assert.equal(_appendCalls().length, 1)
  assert.equal(_appendCalls()[0].data.length, 1)

  const r2 = await appendDaily('UNVR', [day1, day2]) // day1 sudah ada, day2 baru
  assert.equal(r2.written, 1)              // cuma day2 yg "written" (baru)
  assert.equal(_appendCalls().length, 2)     // network call ke-2
  assert.equal(_appendCalls()[1].data.length, 1) // ISI yang dikirim cuma 1 baris (day2), day1 TIDAK dikirim ulang
  assert.equal(_appendCalls()[1].data[0].date, '2026-02-02')

  assert.equal(DB.emiten.UNVR.daily.length, 2) // in-memory tetap lengkap 2 hari
})

test('appendIntraday: dedup per tanggal, panggil ulang dgn tanggal sama tidak network call lagi', async () => {
  await resetMocks()
  await loadSym('ICBP')

  const r1 = await appendIntraday('ICBP', [
    { date: '2026-02-01', snap: { p0905: 1000, p1600: 1050 } }
  ])
  assert.equal(r1.written, 1)
  assert.equal(_appendCalls().length, 1)

  const r2 = await appendIntraday('ICBP', [
    { date: '2026-02-01', snap: { p0905: 1000, p1600: 1050 } } // tanggal sama, harus di-skip total
  ])
  assert.equal(r2.written, 0)
  assert.equal(_appendCalls().length, 1) // TIDAK ada network call tambahan
})

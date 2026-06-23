/**
 * features/ranking-emiten/db.test.js
 * =====================================
 * Mock global fetch (dipanggil shared/sheets.js secara internal) supaya test
 * murni cek logic db.js — tidak ada network call sungguhan ke Apps Script.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

let _mockSheets = {}
let _appendCalls = []

globalThis.fetch = async (url, options) => {
  if (!options || !options.method) {
    const sheet = new URL(url).searchParams.get('sheet')
    return { ok: true, json: async () => ({ ok: true, data: _mockSheets[sheet] || [] }) }
  }
  const body = JSON.parse(options.body)
  if (body.action === 'append') {
    _appendCalls.push({ sheet: body.sheet, data: body.data })
    _mockSheets[body.sheet] = [...(_mockSheets[body.sheet] || []), ...body.data]
  }
  return { ok: true, json: async () => ({ ok: true, written: body.data.length }) }
}

const {
  DB, loadSym, loadIhsg, appendDaily, appendIntraday, appendIepRaw, appendIhsg,
  rowToDaily, dailyToRow, rowToIntraday, intradayToRow, rowToIep, iepToRow, rowToIhsg, ihsgToRow
} = await import('./db.js')

function resetMocks() { _mockSheets = {}; _appendCalls = [] }

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
  assert.deepEqual(rowToDaily(row), d)
})

test('rowToDaily: normalisasi tanggal WAJIB (Sheets auto-convert ke ISO penuh)', () => {
  const row = { date: '2026-01-15T00:00:00.000Z', open: '1000', high: '1050', low: '980',
    close: '1020', volume: '50000', foreignbuy: '3000', foreignsell: '2000',
    rsi: '', macdHist: '', atr: '', vmaRatio: '', foreignNet: '', returnPct: '' }
  const d = rowToDaily(row)
  assert.equal(d.date, '2026-01-15')
  assert.equal(d.rsi, null)
})

test('intradayToRow -> rowToIntraday: round-trip, 10 kolom (ENTRY_KEY p0902 + 9 exit)', () => {
  const snap = { p0902: 1000, p0905: 1010 } // sengaja parsial
  const row = intradayToRow('BBCA', '2026-01-15', snap)
  assert.equal(row.p0902, 1000)
  assert.equal(row.p1600, '') // kolom kosong, bukan undefined/NaN

  const back = rowToIntraday(row)
  assert.deepEqual(back, snap)
  assert.equal('p1600' in back, false)
})

test('iepToRow -> rowToIep: round-trip, RAW saja (totalVol/totalFreq), TIDAK ada field surge', () => {
  const d = { date: '2026-01-15', totalVol: 25000, totalFreq: 120 }
  const row = iepToRow('BBCA', d)
  assert.equal('surge' in row, false) // surge dihitung di engine.js, bukan disimpan
  assert.deepEqual(rowToIep(row), d)
})

test('ihsgToRow -> rowToIhsg: round-trip, TIDAK ada field sym (global)', () => {
  const d = { close: 7500, ret: 0.8, trend: 'up' }
  const row = ihsgToRow('2026-01-15', d)
  assert.equal('sym' in row, false)
  assert.deepEqual(rowToIhsg(row), { date: '2026-01-15', ...d })
})

// ============================================================
// loadSym — pakai mock fetch
// ============================================================

test('loadSym: filter per simbol dengan benar, simbol lain tidak nyasar masuk', async () => {
  resetMocks()
  _mockSheets['ranking-daily'] = [
    { sym: 'BBCA', date: '2026-01-15', open: '1000', high: '1050', low: '980', close: '1020',
      volume: '1000', foreignbuy: '1', foreignsell: '1', rsi: '50', macdHist: '0', atr: '10',
      vmaRatio: '1', foreignNet: '0', returnPct: '0' },
    { sym: 'TLKM', date: '2026-01-15', open: '500', high: '510', low: '490', close: '505',
      volume: '500', foreignbuy: '1', foreignsell: '1', rsi: '60', macdHist: '0', atr: '5',
      vmaRatio: '1', foreignNet: '0', returnPct: '0' }
  ]
  _mockSheets['ranking-intraday'] = []
  _mockSheets['ranking-iep'] = []

  const e = await loadSym('BBCA')
  assert.equal(e.daily.length, 1)
  assert.equal(e.daily[0].close, 1020)
  assert.equal(DB.emiten.TLKM, undefined)
})

// ============================================================
// loadIhsg — GLOBAL, beda dari loadSym
// ============================================================

test('loadIhsg: load global (tidak per simbol), idempoten dalam 1 sesi', async () => {
  resetMocks()
  _mockSheets['ranking-ihsg'] = [
    { date: '2026-01-15', close: '7500', ret: '0.8', trend: 'up' },
    { date: '2026-01-16', close: '7450', ret: '-0.67', trend: 'down' }
  ]
  const ihsg = await loadIhsg()
  assert.equal(Object.keys(ihsg).length, 2)
  assert.equal(ihsg['2026-01-15'].trend, 'up')

  _mockSheets['ranking-ihsg'].push({ date: '2026-01-17', close: '7600', ret: '2', trend: 'up' })
  await loadIhsg() // panggilan ke-2 -- harusnya tidak fetch ulang
  assert.equal(Object.keys(DB.ihsg).length, 2) // tetap 2, bukan ikut data baru yg disuntik manual
})

// ============================================================
// appendDaily / appendIntraday / appendIepRaw — dedup per simbol
// ============================================================

test('appendDaily: hari yang sudah ada di-skip, cuma hari baru yang dikirim ke gsAppend', async () => {
  resetMocks()
  await loadSym('UNVR')

  const day1 = { date: '2026-02-01', open: 100, high: 105, low: 95, close: 102, volume: 1,
    foreignbuy: 0, foreignsell: 0, rsi: null, macdHist: null, atr: null, vmaRatio: null,
    foreignNet: null, returnPct: 0 }
  const day2 = { ...day1, date: '2026-02-02' }

  await appendDaily('UNVR', [day1])
  const r2 = await appendDaily('UNVR', [day1, day2])
  assert.equal(r2.written, 1)
  assert.equal(_appendCalls.length, 2)
  assert.equal(_appendCalls[1].data.length, 1)
  assert.equal(_appendCalls[1].data[0].date, '2026-02-02')
  assert.equal(DB.emiten.UNVR.daily.length, 2)
})

test('appendIntraday: dedup per tanggal, tidak network call lagi kalau tanggal sama', async () => {
  resetMocks()
  await loadSym('ICBP')

  const r1 = await appendIntraday('ICBP', [{ date: '2026-02-01', snap: { p0902: 1000, p1600: 1050 } }])
  assert.equal(r1.written, 1)
  assert.equal(_appendCalls.length, 1)

  const r2 = await appendIntraday('ICBP', [{ date: '2026-02-01', snap: { p0902: 1000, p1600: 1050 } }])
  assert.equal(r2.written, 0)
  assert.equal(_appendCalls.length, 1)
})

test('appendIepRaw: simpan RAW (totalVol/totalFreq) saja, dedup per tanggal', async () => {
  resetMocks()
  await loadSym('ASII')

  await appendIepRaw('ASII', [{ date: '2026-02-01', totalVol: 1000, totalFreq: 50 }])
  const r2 = await appendIepRaw('ASII', [
    { date: '2026-02-01', totalVol: 1000, totalFreq: 50 }, // duplikat
    { date: '2026-02-02', totalVol: 2000, totalFreq: 80 }  // baru
  ])
  assert.equal(r2.written, 1)
  assert.equal(_appendCalls.at(-1).data.length, 1)
  assert.equal(DB.emiten.ASII.iep.length, 2)
  assert.equal('surge' in DB.emiten.ASII.iep[0], false) // tetap raw, bukan surge final
})

// ============================================================
// appendIhsg — GLOBAL, dedup per tanggal saja (tidak per simbol)
// ============================================================

test('appendIhsg: dedup per tanggal (global, tidak per simbol)', async () => {
  resetMocks()
  await loadIhsg()

  const r1 = await appendIhsg({ '2026-03-01': { close: 7000, ret: null, trend: 'unknown' } })
  assert.equal(r1.written, 1)
  assert.equal(_appendCalls.length, 1)

  const r2 = await appendIhsg({
    '2026-03-01': { close: 7000, ret: null, trend: 'unknown' }, // duplikat
    '2026-03-02': { close: 7100, ret: 1.43, trend: 'up' }       // baru
  })
  assert.equal(r2.written, 1)
  assert.equal(_appendCalls.at(-1).data.length, 1)
  // DB.ihsg singleton (sama spt _loadedSyms) numpuk antar test dalam 1 file --
  // cek key spesifik yg baru ditambah test ini, bukan total count absolut
  assert.equal(DB.ihsg['2026-03-01'].close, 7000)
  assert.equal(DB.ihsg['2026-03-02'].trend, 'up')
})

/**
 * features/ranking-emiten/engine.test.js
 * =========================================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONDITIONS, EXIT_KEYS, ENTRY_KEY, WIN_PCT, MIN_SAMPLE,
  withIEPSurge, buildRows, scoreSymbol, rankEmiten, validateSplit
} from './engine.js'

const EPS = 1e-9
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < EPS, msg || `${a} !== ${b}`)

// ============================================================
// Konstanta — pastikan sesuai spek yang disepakati (porting dari ihsg-lab)
// ============================================================

test('konstanta sesuai spek porting dari ihsg-lab', () => {
  assert.equal(ENTRY_KEY, 'p0902')
  assert.deepEqual(EXIT_KEYS, ['p0905','p0910','p0915','p0920','p0930','p1000','p1100','p1530','p1600'])
  assert.equal(WIN_PCT, 1.0)
  assert.equal(MIN_SAMPLE, 3)
  assert.equal(CONDITIONS.length, 16)
})

// ============================================================
// withIEPSurge
// ============================================================

test('withIEPSurge: hari pertama (tidak ada histori sebelumnya) -> surge null', () => {
  const raw = [{ date: '2026-01-01', totalVol: 1000, totalFreq: 50 }]
  const out = withIEPSurge(raw)
  assert.equal(out[0].surge, null)
})

test('withIEPSurge: rolling rata-rata maksimal 5 hari sebelumnya', () => {
  const raw = [
    { date: '2026-01-01', totalVol: 100, totalFreq: 10 },
    { date: '2026-01-02', totalVol: 200, totalFreq: 10 },
    { date: '2026-01-03', totalVol: 300, totalFreq: 10 },
    { date: '2026-01-04', totalVol: 400, totalFreq: 10 },
    { date: '2026-01-05', totalVol: 500, totalFreq: 10 },
    { date: '2026-01-06', totalVol: 600, totalFreq: 10 }, // avg 5 hari sblmnya = (100+200+300+400+500)/5=300
  ]
  const out = withIEPSurge(raw)
  close(out[5].avgIEV, 300)
  close(out[5].surge, 600 / 300) // = 2
})

test('withIEPSurge: surge null kalau avgVol historis 0 (cegah divide by zero)', () => {
  const raw = [
    { date: '2026-01-01', totalVol: 0, totalFreq: 0 },
    { date: '2026-01-02', totalVol: 500, totalFreq: 10 },
  ]
  const out = withIEPSurge(raw)
  assert.equal(out[1].surge, null)
})

// ============================================================
// buildRows
// ============================================================

function fixtureEmitenData() {
  const daily = [
    { date: '2026-01-01', open: 990, high: 1005, low: 985, close: 1000, rsi: 50, macdHist: 1, atr: 10, vmaRatio: 1, foreignNet: 0 },
    { date: '2026-01-02', open: 1000, high: 1015, low: 995, close: 1010, rsi: 35, macdHist: 2, atr: 12, vmaRatio: 1.6, foreignNet: 500 },
    { date: '2026-01-05', open: 1010, high: 1030, low: 1005, close: 1020, rsi: 45, macdHist: -1, atr: 11, vmaRatio: 0.8, foreignNet: -200 },
  ]
  const intraday = {
    '2026-01-02': { p0902: 1005, p0905: 1010, p1600: 1015 },
    '2026-01-05': { p0902: 1015, p0905: 1020, p1600: 1000 },
  }
  const iep = [
    { date: '2026-01-01', totalVol: 100, totalFreq: 5 },
    { date: '2026-01-02', totalVol: 250, totalFreq: 8 }, // surge vs histori [100] = 2.5
    { date: '2026-01-05', totalVol: 80,  totalFreq: 3 },
  ]
  return { daily, intraday, iep }
}

test('buildRows: hari tanpa entry p0902 di-skip (tidak masuk rows)', () => {
  const data = fixtureEmitenData()
  data.intraday['2026-01-06'] = { p0905: 999 } // tidak ada p0902
  const ihsgByDate = {}
  const rows = buildRows(data, ihsgByDate)
  assert.equal(rows.find(r => r.date === '2026-01-06'), undefined)
})

test('buildRows: gapPct dihitung dari p0902 vs close HARI SEBELUMNYA (bukan daily.open)', () => {
  const rows = buildRows(fixtureEmitenData(), {})
  const row = rows.find(r => r.date === '2026-01-02')
  // prevDay = 2026-01-01, close=1000. entry (p0902) = 1005.
  close(row.gapPct, (1005 - 1000) / 1000 * 100) // = 0.5%
})

test('buildRows: rsi/macdHist/vmaRatio/foreignNet diambil dari HARI SEBELUMNYA (H-1), bukan hari yang sama', () => {
  const rows = buildRows(fixtureEmitenData(), {})
  const row = rows.find(r => r.date === '2026-01-02')
  // prevDay = 2026-01-01 (rsi=50), BUKAN 2026-01-02 sendiri (rsi=35)
  assert.equal(row.rsi, 50)
  assert.equal(row.macdHist, 1)
  assert.equal(row.vmaRatio, 1)
  assert.equal(row.foreignNet, 0)
})

test('buildRows: ihsgH1Trend pakai trend IHSG HARI SEBELUMNYA, "unknown" kalau tidak ada data', () => {
  const ihsgByDate = {
    '2026-01-01': { trend: 'up' },
    '2026-01-02': { trend: 'down' } // trend HARI INI -- TIDAK boleh dipakai utk row 01-05
  }
  const rows = buildRows(fixtureEmitenData(), ihsgByDate)
  const row0102 = rows.find(r => r.date === '2026-01-02')
  assert.equal(row0102.ihsgH1Trend, 'up') // H-1 dari 01-02 adalah 01-01 (up)

  const row0105 = rows.find(r => r.date === '2026-01-05')
  assert.equal(row0105.ihsgH1Trend, 'unknown') // tidak ada data ihsg utk H-1 dari 01-05 (01-04 tidak ada)
})

test('buildRows: iepSurge diambil dari hari yang SAMA (bukan H-1) -- surge pre-opening hari itu sendiri', () => {
  const rows = buildRows(fixtureEmitenData(), {})
  const row = rows.find(r => r.date === '2026-01-02')
  close(row.iepSurge, 250 / 100) // totalVol 01-02 (250) / avg histori [01-01: 100] = 2.5
})

test('buildRows: atrRatio null kalau window histori < 5 hari valid (anti-bias)', () => {
  // fixtureEmitenData cuma 2 hari sebelum row pertama -- tidak cukup 5 valid
  const rows = buildRows(fixtureEmitenData(), {})
  const row = rows.find(r => r.date === '2026-01-02')
  assert.equal(row.atrRatio, null)
})

test('buildRows: atrRatio terhitung kalau window histori >= 5 hari valid (window TERMASUK prevDay sendiri, sesuai kode asli)', () => {
  const daily = [
    { date: '2026-01-01', close: 1000, atr: 10 },
    { date: '2026-01-02', close: 1000, atr: 10 },
    { date: '2026-01-03', close: 1000, atr: 10 },
    { date: '2026-01-04', close: 1000, atr: 10 },
    { date: '2026-01-05', close: 1000, atr: 30 }, // prevDay -- atr naik dibanding 4 hari sblmnya
    { date: '2026-01-06', close: 1000, atr: 99 }, // 'today' -- nilai atr di sini tidak relevan utk atrRatio
  ]
  const intraday = { '2026-01-06': { p0902: 1000 } }
  const rows = buildRows({ daily, intraday, iep: [] }, {})
  // window = slice(0,5) = 5 hari (01-01..01-05) TERMASUK prevDay (01-05) sendiri -- bukan 4 hari sblm prevDay
  const avgAtr = (10 + 10 + 10 + 10 + 30) / 5 // = 14
  close(rows[0].atrRatio, 30 / avgAtr) // prevDay.atr(30) / avgAtr(14)
})

// ============================================================
// scoreSymbol
// ============================================================

function fixedRow({ rsi, snapP0905, snapP1600, entry = 1000 }) {
  return { entry, rsi, snap: { p0905: snapP0905, p1600: snapP1600 } }
}

test('scoreSymbol: cari kombinasi (kondisi,exit) dgn WR tertinggi, abaikan exit dgn WR lebih rendah', () => {
  // Kondisi 'RSI H-1 < 40' match semua 5 row. Exit p0905: WR 80%. Exit p1600: WR 40%.
  const rows = [
    fixedRow({ rsi: 30, snapP0905: 1015, snapP1600: 1005 }), // p0905 +1.5% win | p1600 +0.5% no
    fixedRow({ rsi: 35, snapP0905: 1012, snapP1600: 1020 }), // p0905 +1.2% win | p1600 +2.0% win
    fixedRow({ rsi: 20, snapP0905: 1011, snapP1600: 990 }),  // p0905 +1.1% win | p1600 -1.0% no
    fixedRow({ rsi: 38, snapP0905: 990,  snapP1600: 1030 }), // p0905 -1.0% no  | p1600 +3.0% win
    fixedRow({ rsi: 25, snapP0905: 1013, snapP1600: 980 }),  // p0905 +1.3% win | p1600 -2.0% no
  ]
  const score = scoreSymbol(rows)
  close(score.bestWR, 80)
  assert.equal(score.bestExit, 'p0905')
  assert.equal(score.bestCond, 'RSI H-1 < 40')
  assert.equal(score.bestSignals, 5)
  close(score.bestAvgGain, (1.5 + 1.2 + 1.1 - 1.0 + 1.3) / 5)
  assert.equal(score.totalDays, 5)
})

test('scoreSymbol: WIN_PCT=1.0% persis -- return tepat 1.0% dihitung win, 0.99% tidak', () => {
  const rows = [
    fixedRow({ rsi: 30, snapP0905: 1010,   snapP1600: 1000 }), // tepat +1.00% -> win
    fixedRow({ rsi: 30, snapP0905: 1009.9, snapP1600: 1000 }), // +0.99% -> bukan win
    fixedRow({ rsi: 30, snapP0905: 1010,   snapP1600: 1000 }),
  ]
  const score = scoreSymbol(rows)
  assert.equal(score.bestExit, 'p0905')
  close(score.bestWR, 200 / 3) // 2 dari 3 win = 66.67%
})

test('scoreSymbol: kondisi dgn sample < MIN_SAMPLE(3) di-skip total', () => {
  const rows = [
    fixedRow({ rsi: 30, snapP0905: 2000, snapP1600: 2000 }), // hanya 2 row match RSI<40
    fixedRow({ rsi: 35, snapP0905: 2000, snapP1600: 2000 }),
    fixedRow({ rsi: 50, snapP0905: 1001, snapP1600: 1001 }), // RSI netral, tidak match kondisi manapun yg butuh RSI<40
  ]
  const score = scoreSymbol(rows)
  // RSI<40 cuma 2 sample (< MIN_SAMPLE) -> di-skip, bestWR tetap 0 (tidak ada kondisi valid)
  assert.equal(score.bestWR, 0)
  assert.equal(score.bestCond, '—')
})

test('scoreSymbol: array rows kosong -> null', () => {
  assert.equal(scoreSymbol([]), null)
})

test('scoreSymbol: tie-break WR sama -> menang yang sample (bestSignals) lebih banyak', () => {
  // 2 kondisi beda yg keduanya menghasilkan WR 100% di exit yang sama, tapi beda jumlah sample
  const rows = [
    fixedRow({ rsi: 30, snapP0905: 1020, snapP1600: 1020 }),
    fixedRow({ rsi: 30, snapP0905: 1020, snapP1600: 1020 }),
    fixedRow({ rsi: 30, snapP0905: 1020, snapP1600: 1020 }),
  ]
  rows.push({ entry: 1000, rsi: 50, macdHist: 1, snap: { p0905: 1020, p1600: 1020 } })
  rows.forEach(r => { if (r.macdHist === undefined) r.macdHist = 1 }) // semua row juga match MACD>0

  const score = scoreSymbol(rows)
  assert.equal(score.bestWR, 100)
  assert.equal(score.bestSignals, 4) // menang krn sample lebih banyak (MACD>0, 4 row) drpd RSI<40 (3 row)
  assert.equal(score.bestCond, 'MACD Hist H-1 > 0')
})

// ============================================================
// rankEmiten
// ============================================================

test('rankEmiten: ranking desc by bestWR, tie-break desc bestSignals', () => {
  function makeData(p0905Pool) {
    // Semua hari (termasuk seed) rsi=30 -- supaya prevDay (H-1) tiap row KONSISTEN
    // match 'RSI H-1 < 40', bukan cuma row tertentu (lihat bug yg sempat ketemu:
    // row pertama prevDay-nya adalah hari seed, kalau rsi seed beda, sample-nya
    // jadi < MIN_SAMPLE secara tidak sengaja).
    const allDates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']
    const daily = allDates.map(date => ({ date, close: 1000, rsi: 30 }))
    const intraday = {}
    const tradingDates = ['2026-01-02', '2026-01-03', '2026-01-04']
    tradingDates.forEach((d, i) => { intraday[d] = { p0902: 1000, p0905: p0905Pool[i] } })
    return { daily, intraday, iep: [] }
  }

  const symA = makeData([1010, 995, 1000]) // return: +1.0%(win) / -0.5%(no) / 0%(no) -> WR 33.3%
  const symB = makeData([1010, 1015, 1020]) // return: +1.0% / +1.5% / +2.0% -> semua win, WR 100%
  const symC = { daily: [{ date: '2026-01-01', close: 1000 }], intraday: {}, iep: [] } // tidak ada entry sama sekali

  const ranking = rankEmiten({ A: symA, B: symB, C: symC }, {})
  assert.equal(ranking.length, 2) // C di-exclude (tidak ada score valid)
  assert.equal(ranking[0].sym, 'B') // WR lebih tinggi duluan
  assert.equal(ranking[1].sym, 'A')
  close(ranking[0].bestWR, 100)
  close(ranking[1].bestWR, 100 / 3)
})

// ============================================================
// validateSplit — train/test
// ============================================================

function _row(rsi, exitPrice) { return { entry: 1000, rsi, snap: { p0905: exitPrice } } }
function _winRow() { return _row(30, 1020) } // +2%, win (WIN_PCT=1.0%)
function _lossRow() { return _row(30, 990) } // -1%, bukan win

test('validateSplit: rows < 10 -> semua null (terlalu sedikit utk dibelah bermakna)', () => {
  const rows = Array.from({ length: 9 }, () => _winRow())
  assert.deepEqual(validateSplit(rows), { train: null, test: null, holds: null })
})

test('validateSplit: kondisi BERTAHAN di data uji -> holds=true', () => {
  // Train (14 baris, 10 win + 4 loss) -> WR train = 10/14 = 71.43%
  // Test  (6 baris, 4 win + 2 loss)   -> WR test  = 4/6   = 66.67% (93% dari train, >= ambang 80%)
  const rows = [
    ...Array.from({ length: 10 }, _winRow), ...Array.from({ length: 4 }, _lossRow), // train, total 14
    ...Array.from({ length: 4 },  _winRow), ...Array.from({ length: 2 }, _lossRow), // test, total 6
  ]
  const result = validateSplit(rows) // 20 baris -> splitIdx = floor(20*0.7) = 14, pas di batas train

  assert.equal(result.train.bestCond, 'RSI H-1 < 40')
  assert.equal(result.train.bestExit, 'p0905')
  close(result.train.bestWR, 100 * 10 / 14)
  assert.equal(result.test.signals, 6)
  close(result.test.winRate, 100 * 4 / 6)
  assert.equal(result.holds, true)
  assert.ok(result.train.wilsonLower < result.train.bestWR, 'wilsonLower harus < WR mentah (lebih konservatif)')
  assert.ok(result.test.wilsonLower !== null)
})

test('validateSplit: kondisi ANJLOK di data uji -> holds=false', () => {
  // Train sama (WR 71.43%), Test (6 baris, cuma 1 win + 5 loss) -> WR test 16.67% (23% dari train, < ambang 80%)
  const rows = [
    ...Array.from({ length: 10 }, _winRow), ...Array.from({ length: 4 }, _lossRow), // train, total 14
    ...Array.from({ length: 1 },  _winRow), ...Array.from({ length: 5 }, _lossRow), // test, total 6
  ]
  const result = validateSplit(rows)
  close(result.test.winRate, 100 / 6)
  assert.equal(result.holds, false)
})

test('validateSplit: sample uji terlalu kecil (<MIN_TEST_SAMPLE) -> holds=null, BUKAN false', () => {
  // 10 baris total -> splitIdx = floor(10*0.7) = 7 -> train=7, test=3 (di bawah ambang 5)
  const rows = [
    ...Array.from({ length: 5 }, _winRow), ...Array.from({ length: 2 }, _lossRow), // train, total 7
    ...Array.from({ length: 2 },  _winRow), ...Array.from({ length: 1 }, _lossRow), // test, total 3
  ]
  const result = validateSplit(rows)
  assert.equal(result.test.signals, 3)
  assert.equal(result.test.winRate, null) // tidak dihitung krn sample terlalu kecil
  assert.equal(result.holds, null) // BUKAN false -- "belum bisa disimpulkan", beda dgn "terbukti gagal"
})

test('validateSplit: tidak ada kondisi valid sama sekali di data latih -> train.bestCond="—", test=null', () => {
  // Tidak ada field yang match kondisi manapun (rsi tinggi, field lain undefined)
  const rows = Array.from({ length: 12 }, () => ({ entry: 1000, rsi: 80, snap: { p0905: 1010 } }))
  const result = validateSplit(rows)
  assert.equal(result.train.bestCond, '—')
  assert.equal(result.test, null)
  assert.equal(result.holds, null)
})

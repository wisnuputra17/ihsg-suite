/**
 * features/winrate/engine.test.js
 * =================================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCondition, allConditionIds, simulateTrade, runBacktest, EXIT_KEYS } from './engine.js'

const EPS = 1e-9
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < EPS, msg || `${a} !== ${b}`)

// ============================================================
// allConditionIds — harus pas 27, semua id unik
// ============================================================

test('allConditionIds: tepat 27 kondisi, semua id unik', () => {
  const conds = allConditionIds()
  assert.equal(conds.length, 27)
  const ids = new Set(conds.map(c => c.id))
  assert.equal(ids.size, 27)
})

// ============================================================
// classifyCondition
// ============================================================

test('classifyCondition: kombinasi dasar diklasifikasi dengan benar', () => {
  const c1 = classifyCondition(-1, 25, -0.5)
  assert.equal(c1.id, 'turun|oversold|negatif')
  const c2 = classifyCondition(2, 50, 0)
  assert.equal(c2.id, 'netral|netral|netral')
  const c3 = classifyCondition(5, 80, 0.5)
  assert.equal(c3.id, 'kuat|overbought|positif')
})

test('classifyCondition: batas band Gap (0 dan 3 adalah inklusif ke netral)', () => {
  assert.equal(classifyCondition(0, 50, 0).id.split('|')[0], 'netral')
  assert.equal(classifyCondition(2.99, 50, 0).id.split('|')[0], 'netral')
  assert.equal(classifyCondition(3, 50, 0).id.split('|')[0], 'kuat')
  assert.equal(classifyCondition(-0.01, 50, 0).id.split('|')[0], 'turun')
})

test('classifyCondition: batas band RSI (30 dan 70 inklusif ke netral)', () => {
  assert.equal(classifyCondition(1, 30, 0).id.split('|')[1], 'netral')
  assert.equal(classifyCondition(1, 70, 0).id.split('|')[1], 'netral')
  assert.equal(classifyCondition(1, 29.99, 0).id.split('|')[1], 'oversold')
  assert.equal(classifyCondition(1, 70.01, 0).id.split('|')[1], 'overbought')
})

test('classifyCondition: batas band MACD (-0.2 dan 0.2 inklusif ke netral)', () => {
  assert.equal(classifyCondition(1, 50, -0.2).id.split('|')[2], 'netral')
  assert.equal(classifyCondition(1, 50, 0.2).id.split('|')[2], 'netral')
  assert.equal(classifyCondition(1, 50, -0.21).id.split('|')[2], 'negatif')
  assert.equal(classifyCondition(1, 50, 0.21).id.split('|')[2], 'positif')
})

test('classifyCondition: null kalau salah satu input null/undefined/NaN (warmup)', () => {
  assert.equal(classifyCondition(null, 50, 0), null)
  assert.equal(classifyCondition(1, undefined, 0), null)
  assert.equal(classifyCondition(1, 50, NaN), null)
})

// ============================================================
// simulateTrade — entryPrice sekarang parameter terpisah (today.open / IEP)
// ============================================================

test('simulateTrade: returnPct & maxDD dasar (tidak ada dip di tengah)', () => {
  const intraday = { p0905: 1010, p0910: 1020 }
  const t = simulateTrade(1000, intraday, 'p0910')
  close(t.returnPct, 2.0)
  close(t.maxDDPct, 0) // tidak pernah turun di bawah entry
})

test('simulateTrade: maxDD ambil titik TERENDAH di tengah, bukan cuma harga exit', () => {
  const intraday = { p0905: 950, p0910: 1100 } // dip ke 950 sebelum naik lagi
  const t = simulateTrade(1000, intraday, 'p0910')
  close(t.returnPct, 10.0)   // (1100-1000)/1000*100
  close(t.maxDDPct, -5.0)    // (950-1000)/1000*100 — dip di tengah, bukan 0
})

test('simulateTrade: null kalau entryPrice atau harga exit tidak ada', () => {
  assert.equal(simulateTrade(0, { p0905: 1000 }, 'p0905'), null)     // entryPrice falsy
  assert.equal(simulateTrade(1000, { p0910: 1010 }, 'p0905'), null)  // p0905 tidak ada di intraday
})

test('simulateTrade: null kalau exitKey bukan salah satu dari EXIT_KEYS', () => {
  const intraday = { p0905: 1010 }
  assert.equal(simulateTrade(1000, intraday, 'p0859'), null)
})

test('EXIT_KEYS sesuai spesifikasi yang disepakati', () => {
  assert.deepEqual(EXIT_KEYS, ['p0905','p0910','p0920','p0935','p1000','p1030','p1130','p1330','p1600'])
})

// ============================================================
// runBacktest — dataset kecil, dihitung manual
// ============================================================

function buildFixture() {
  const daily = [
    { date: '2026-01-01', open: 995,  close: 1000, rsi: 50, macdHist: 2.5 },  // day0 — cuma "prev" utk day1
    { date: '2026-01-02', open: 1025, close: 1010, rsi: 65, macdHist: -3 },   // day1 entry, prev=day0
    { date: '2026-01-03', open: 1030, close: 1005, rsi: 45, macdHist: -1 },   // day2 entry, prev=day1
  ]
  const intraday = {
    '2026-01-02': { // entry = day1.open = 1025
      p0905: 1010, p0910: 990, p0920: 1005, p0935: 1020,
      p1000: 1030, p1030: 1015, p1130: 1040, p1330: 1050, p1600: 1060
    },
    '2026-01-03': { // entry = day2.open = 1030
      p0905: 1980, p0910: 2010, p0920: 1960, p0935: 2005,
      p1000: 2020, p1030: 1990, p1130: 2030, p1330: 1950, p1600: 2050
    }
  }
  return { daily, intraday }
}

test('runBacktest: day1 (prev=day0, rsi=50 netral, macdHist=2.5/1000=0.25% positif, gap=(1025-1000)/1000=2.5% netral) -> netral|netral|positif', () => {
  const matrix = runBacktest(buildFixture())
  const cell = matrix['netral|netral|positif']['p0905']
  assert.equal(cell.n, 1)
  // entry=1025, exit p0905=1010 -> return = (1010-1025)/1025*100
  close(cell.avgReturn, (1010 - 1025) / 1025 * 100)
  close(cell.winRate, 0) // rugi
})

test('runBacktest: cell yang sama di exit p1600 — maxDD ambil dip terendah sepanjang hari (990), bukan cuma harga exit', () => {
  const matrix = runBacktest(buildFixture())
  const cell = matrix['netral|netral|positif']['p1600']
  assert.equal(cell.n, 1)
  close(cell.avgReturn, (1060 - 1025) / 1025 * 100)
  close(cell.maxDD, (990 - 1025) / 1025 * 100) // dip terendah 990, BUKAN cuma harga exit
})

test('runBacktest: day2 (prev=day1, rsi=65 netral, macdHist=-3/1010=-0.297% negatif, gap=(1030-1010)/1010=1.98% netral) -> netral|netral|negatif', () => {
  const matrix = runBacktest(buildFixture())
  const cell = matrix['netral|netral|negatif']['p0905']
  assert.equal(cell.n, 1)
  close(cell.avgReturn, (1980 - 1030) / 1030 * 100)
})

test('runBacktest: kondisi yang tidak pernah terjadi (n=0) -> winRate/avgReturn/maxRet/maxDD semua null', () => {
  const matrix = runBacktest(buildFixture())
  const emptyCell = matrix['kuat|oversold|negatif']['p1600']
  assert.equal(emptyCell.n, 0)
  assert.equal(emptyCell.winRate, null)
  assert.equal(emptyCell.avgReturn, null)
  assert.equal(emptyCell.maxRet, null)
  assert.equal(emptyCell.maxDD, null)
})

test('runBacktest: hari pertama (i=0) di-skip — tidak ada "prev" utk klasifikasi', () => {
  const matrix = runBacktest(buildFixture())
  let totalN = 0
  for (const condId in matrix) for (const exitKey of EXIT_KEYS) totalN += matrix[condId][exitKey].n
  assert.equal(totalN, 2 * EXIT_KEYS.length) // 2 hari valid (day1+day2) x 9 exit
})

test('runBacktest: hari tanpa today.open (IEP) di-skip total, tidak nyasar ke kondisi manapun', () => {
  const fixture = buildFixture()
  fixture.daily[1].open = null // day1 kehilangan data open/IEP
  const matrix = runBacktest(fixture)
  let totalN = 0
  for (const condId in matrix) for (const exitKey of EXIT_KEYS) totalN += matrix[condId][exitKey].n
  assert.equal(totalN, 1 * EXIT_KEYS.length) // cuma day2 yang valid sekarang
})

test('runBacktest: matrix punya tepat 27 kondisi x 9 exit key, semua terinisialisasi walau n=0', () => {
  const matrix = runBacktest(buildFixture())
  assert.equal(Object.keys(matrix).length, 27)
  for (const condId in matrix) {
    for (const exitKey of EXIT_KEYS) assert.ok(exitKey in matrix[condId], `${condId} kehilangan exit key ${exitKey}`)
  }
})

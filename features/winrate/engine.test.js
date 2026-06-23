/**
 * features/winrate/engine.test.js
 * =================================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCondition, allConditionIds, simulateTrade, runBacktest, ENTRY_KEY, EXIT_KEYS } from './engine.js'

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
  // Gap -1% (turun) | RSI 25 (oversold) | MACD -0.5% (negatif)
  const c1 = classifyCondition(-1, 25, -0.5)
  assert.equal(c1.id, 'turun|oversold|negatif')

  // Gap 2% (netral) | RSI 50 (netral) | MACD 0 (netral)
  const c2 = classifyCondition(2, 50, 0)
  assert.equal(c2.id, 'netral|netral|netral')

  // Gap 5% (kuat) | RSI 80 (overbought) | MACD 0.5% (positif)
  const c3 = classifyCondition(5, 80, 0.5)
  assert.equal(c3.id, 'kuat|overbought|positif')
})

test('classifyCondition: batas band Gap (0 dan 3 adalah inklusif ke netral)', () => {
  assert.equal(classifyCondition(0, 50, 0).id.split('|')[0], 'netral')   // 0 → netral, bukan turun
  assert.equal(classifyCondition(2.99, 50, 0).id.split('|')[0], 'netral')
  assert.equal(classifyCondition(3, 50, 0).id.split('|')[0], 'kuat')     // 3 → kuat
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
// simulateTrade
// ============================================================

test('simulateTrade: returnPct & maxDD dasar (tidak ada dip di tengah)', () => {
  const intraday = { p0902: 1000, p0905: 1010, p0910: 1020 }
  const t = simulateTrade(intraday, 'p0910')
  close(t.returnPct, 2.0)
  close(t.maxDDPct, 0) // tidak pernah turun di bawah entry
})

test('simulateTrade: maxDD ambil titik TERENDAH di tengah, bukan cuma harga exit', () => {
  const intraday = { p0902: 1000, p0905: 950, p0910: 1100 } // dip ke 950 sebelum naik lagi
  const t = simulateTrade(intraday, 'p0910')
  close(t.returnPct, 10.0)   // (1100-1000)/1000*100
  close(t.maxDDPct, -5.0)    // (950-1000)/1000*100 — dip di tengah, bukan 0
})

test('simulateTrade: null kalau harga entry atau exit tidak ada', () => {
  assert.equal(simulateTrade({ p0905: 1000 }, 'p0905'), null) // p0902 tidak ada
  assert.equal(simulateTrade({ p0902: 1000 }, 'p0905'), null) // p0905 tidak ada
})

test('simulateTrade: null kalau exitKey lebih awal dari entry (urutan waktu salah)', () => {
  const intraday = { p0902: 1000, p0905: 1010 }
  assert.equal(simulateTrade(intraday, 'p0859'), null) // key tidak match format p\\d{4} → tidak ditemukan di allKeys
})

test('ENTRY_KEY dan EXIT_KEYS sesuai spesifikasi yang disepakati', () => {
  assert.equal(ENTRY_KEY, 'p0902')
  assert.deepEqual(EXIT_KEYS, ['p0905','p0910','p0920','p0935','p1000','p1030','p1130','p1330','p1600'])
})

// ============================================================
// runBacktest — dataset kecil, dihitung manual
// ============================================================

function buildFixture() {
  const daily = [
    { date: '2026-01-01', close: 1000, rsi: 50, macdHist: 2.5 },  // day0 — cuma dipakai sbg "prev" utk day1
    { date: '2026-01-02', close: 1010, rsi: 65, macdHist: -3 },   // day1 entry, prev=day0
    { date: '2026-01-03', close: 1005, rsi: 45, macdHist: -1 },   // day2 entry, prev=day1
  ]
  const iep = [
    { date: '2026-01-02', price: 1025 }, // gap vs day0.close(1000) = 2.5% → netral
    { date: '2026-01-03', price: 1030 }, // gap vs day1.close(1010) = 1.980...% → netral
  ]
  const intraday = {
    '2026-01-02': {
      p0902: 1000, p0905: 1010, p0910: 990, p0920: 1005, p0935: 1020,
      p1000: 1030, p1030: 1015, p1130: 1040, p1330: 1050, p1600: 1060
    },
    '2026-01-03': {
      p0902: 2000, p0905: 1980, p0910: 2010, p0920: 1960, p0935: 2005,
      p1000: 2020, p1030: 1990, p1130: 2030, p1330: 1950, p1600: 2050
    }
  }
  return { daily, intraday, iep }
}

test('runBacktest: day1 (prev=day0, rsi=50 netral, macdHist=2.5→0.25% positif) masuk ke kondisi netral|netral|positif', () => {
  const matrix = runBacktest(buildFixture())
  const cell = matrix['netral|netral|positif']['p0905']
  assert.equal(cell.n, 1)
  close(cell.winRate, 100)     // (1010-1000)/1000=1% → profit
  close(cell.avgReturn, 1.0)
  close(cell.maxRet, 1.0)
  close(cell.maxDD, 0)         // tidak ada dip antara p0902(1000) & p0905(1010)
})

test('runBacktest: cell yang sama di exit p1600 — maxDD ambil dip terendah sepanjang hari (990), bukan cuma 2 titik exit', () => {
  const matrix = runBacktest(buildFixture())
  const cell = matrix['netral|netral|positif']['p1600']
  assert.equal(cell.n, 1)
  close(cell.avgReturn, 6.0)   // (1060-1000)/1000*100
  close(cell.maxDD, -1.0)      // dip terendah 990 → (990-1000)/1000*100
})

test('runBacktest: day2 (prev=day1, rsi=65 netral, macdHist=-3→-0.297% negatif) masuk ke kondisi netral|netral|negatif', () => {
  const matrix = runBacktest(buildFixture())
  const cell = matrix['netral|netral|negatif']['p0905']
  assert.equal(cell.n, 1)
  close(cell.avgReturn, -1.0)  // (1980-2000)/2000*100
  close(cell.winRate, 0)       // rugi
})

test('runBacktest: exit p1600 utk day2 — maxDD ambil dip terendah 1950 (bukan harga exit 2050)', () => {
  const matrix = runBacktest(buildFixture())
  const cell = matrix['netral|netral|negatif']['p1600']
  close(cell.avgReturn, 2.5)   // (2050-2000)/2000*100
  close(cell.maxDD, -2.5)      // (1950-2000)/2000*100
})

test('runBacktest: kondisi yang tidak pernah terjadi (n=0) → winRate/avgReturn/maxRet/maxDD semua null', () => {
  const matrix = runBacktest(buildFixture())
  const emptyCell = matrix['kuat|oversold|negatif']['p1600'] // kombinasi yang tidak match data fixture
  assert.equal(emptyCell.n, 0)
  assert.equal(emptyCell.winRate, null)
  assert.equal(emptyCell.avgReturn, null)
  assert.equal(emptyCell.maxRet, null)
  assert.equal(emptyCell.maxDD, null)
})

test('runBacktest: hari pertama (i=0) di-skip — tidak ada "prev" utk klasifikasi', () => {
  const matrix = runBacktest(buildFixture())
  // total trade di semua cell harus 2 (cuma day1 & day2), day0 tidak pernah dihitung
  let totalN = 0
  for (const condId in matrix) {
    for (const exitKey of EXIT_KEYS) totalN += matrix[condId][exitKey].n
  }
  assert.equal(totalN, 2 * EXIT_KEYS.length) // 2 hari valid x 9 exit time
})

test('runBacktest: hari tanpa data IEP di-skip total (tidak nyasar ke kondisi manapun)', () => {
  const fixture = buildFixture()
  fixture.iep = fixture.iep.filter(e => e.date !== '2026-01-02') // hapus IEP day1
  const matrix = runBacktest(fixture)
  let totalN = 0
  for (const condId in matrix) {
    for (const exitKey of EXIT_KEYS) totalN += matrix[condId][exitKey].n
  }
  assert.equal(totalN, 1 * EXIT_KEYS.length) // cuma day2 yang valid sekarang
})

test('runBacktest: matrix punya tepat 27 kondisi x 9 exit key, semua terinisialisasi walau n=0', () => {
  const matrix = runBacktest(buildFixture())
  assert.equal(Object.keys(matrix).length, 27)
  for (const condId in matrix) {
    for (const exitKey of EXIT_KEYS) {
      assert.ok(exitKey in matrix[condId], `${condId} kehilangan exit key ${exitKey}`)
    }
  }
})

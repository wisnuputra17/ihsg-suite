/**
 * shared/stats.test.js
 * ======================
 * Nilai referensi dihitung independen via Python statsmodels
 * (proportion_confint method='wilson') sebelum dijadikan fixture.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wilsonLowerBound } from './stats.js'

const EPS = 1e-4
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < EPS, msg || `${a} !== ${b}`)

test('wilsonLowerBound: cocok dengan referensi statsmodels (6 kasus)', () => {
  close(wilsonLowerBound(3, 3),   43.850297)
  close(wilsonLowerBound(60, 100), 50.200259)
  close(wilsonLowerBound(1, 1),   20.654931)
  close(wilsonLowerBound(0, 10),   0.000000)
  close(wilsonLowerBound(5, 10),  23.659309)
  close(wilsonLowerBound(50, 60), 71.968387)
})

test('wilsonLowerBound: n=0 -> null (tidak ada sample sama sekali)', () => {
  assert.equal(wilsonLowerBound(0, 0), null)
})

test('wilsonLowerBound: ILUSTRASI INTI -- sample kecil dgn WR sama TIDAK dapat skor sama dgn sample besar', () => {
  // 3/3 menang (100%) vs 65/100 menang (65%) -- WR mentah: A menang, B kalah
  const small  = wilsonLowerBound(3, 3)    // WR mentah 100%
  const large  = wilsonLowerBound(65, 100) // WR mentah 65%
  // Tapi diukur via lower bound, sample besar yg konsisten HARUS menang
  assert.ok(large > small, `sample besar (${large}) harus > sample kecil sempurna (${small})`)
})

test('wilsonLowerBound: monoton naik terhadap n pada win rate yg sama (makin banyak sample, makin yakin)', () => {
  const n10  = wilsonLowerBound(7, 10)   // 70%
  const n100 = wilsonLowerBound(70, 100) // 70% juga
  const n1000 = wilsonLowerBound(700, 1000) // 70% juga
  assert.ok(n10 < n100, 'n=10 harus lebih rendah dari n=100 pd WR yg sama')
  assert.ok(n100 < n1000, 'n=100 harus lebih rendah dari n=1000 pd WR yg sama')
  // Dengan n besar sekali, lower bound mendekati WR mentah (70%) -- margin
  // Wilson di titik ini ~3%, jadi toleransi 5% aman tanpa jadi longgar berlebihan
  assert.ok(Math.abs(n1000 - 70) < 5, `n1000 (${n1000}) harus mendekati 70`)
})

test('wilsonLowerBound: selalu di rentang [0,100]', () => {
  const lo = wilsonLowerBound(0, 1)
  const hi = wilsonLowerBound(1, 1)
  assert.ok(lo >= 0 && lo <= 100)
  assert.ok(hi >= 0 && hi <= 100)
})

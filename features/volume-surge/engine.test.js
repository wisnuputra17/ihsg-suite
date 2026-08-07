import { test } from 'node:test'
import assert from 'node:assert'
import { volumeSurge, rankSurge, alertLevel, fmtRatio, fmtVol } from './engine.js'

const mk = (vols) => vols.map((v, i) => ({ volume: v, close: 100, date: `2026-08-0${i+1}` }))

test('volumeSurge: hari ini 3x rata-rata 5 hari', () => {
  const s = volumeSurge(mk([100,100,100,100,100,300]))
  assert.equal(s.ratio, 3)
  assert.equal(s.today, 300)
  assert.equal(s.ma, 100)
})

test('volumeSurge: exclude hari berjalan dari MA', () => {
  const s = volumeSurge(mk([200,200,200,200,200,1000]))
  assert.equal(s.ma, 200)
  assert.equal(s.ratio, 5)
})

test('volumeSurge: MA5 nyata memasukkan outlier (kasus IPOL)', () => {
  // 5 hari sebelum: [218900,305100,732700,671600,69148900] — outlier 69jt MASUK
  // mean = 14.215.440. hari ini 3931600 → ratio 0.28x (benar per keputusan Wisnu)
  const s = volumeSurge(mk([376500,197000,218900,305100,732700,671600,69148900,3931600]))
  assert.equal(s.ma, 14215440)
  assert.ok(Math.abs(s.ratio - 0.28) < 0.01, `ratio ${s.ratio} harus ~0.28`)
})

test('volumeSurge: data kurang dari 6 candle → null', () => {
  assert.equal(volumeSurge(mk([100,100,100])), null)
})

test('volumeSurge: MA nol (suspend) → null, hindari bagi nol', () => {
  assert.equal(volumeSurge(mk([0,0,0,0,0,500])), null)
})

test('rankSurge: urut dari surge tertinggi', () => {
  const rows = [
    { sym: 'A', daily: mk([100,100,100,100,100,150]) }, // 1.5x
    { sym: 'B', daily: mk([100,100,100,100,100,400]) }, // 4x
    { sym: 'C', daily: mk([100,100,100,100,100,250]) }, // 2.5x
  ]
  const r = rankSurge(rows)
  assert.deepEqual(r.map(x => x.sym), ['B', 'C', 'A'])
  assert.equal(r[0].ratio, 4)
})

test('rankSurge: emiten data kurang di-skip, tak error', () => {
  const rows = [
    { sym: 'A', daily: mk([100,100,100,100,100,300]) },
    { sym: 'B', daily: mk([100,100]) },          // kurang
    { sym: 'C', daily: null },                    // null
  ]
  const r = rankSurge(rows)
  assert.equal(r.length, 1)
  assert.equal(r[0].sym, 'A')
})

test('alertLevel: ambang benar', () => {
  assert.equal(alertLevel(6), 'extreme')
  assert.equal(alertLevel(3.5), 'high')
  assert.equal(alertLevel(2.1), 'mid')
  assert.equal(alertLevel(1.2), 'normal')
})

test('fmtRatio & fmtVol', () => {
  assert.equal(fmtRatio(3.44), '3.4×')
  assert.equal(fmtRatio(null), '–')
  assert.equal(fmtVol(152_700_000), '152.7 jt')
  assert.equal(fmtVol(1_200_000_000), '1.2 M')
})

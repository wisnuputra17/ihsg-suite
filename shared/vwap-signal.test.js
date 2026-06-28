/**
 * shared/vwap-signal.test.js
 * =============================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectVwapCrosses, detectFirstVwapCross } from './vwap-signal.js'

test('detectVwapCrosses: reclaim (close balik ke ATAS vwap) terdeteksi di barIndex yang benar', () => {
  // i=1: prevVwap null (warmup) -> di-skip. i=2: prevClose(103)<prevVwap(104) -> wasBelow,
  // curClose(106)>=curVwap(104) -> RECLAIM. i=3: prevClose(106)>prevVwap(104) -> wasAbove,
  // curClose(107)<=curVwap(105)? 107<=105 false -> tidak ada cross. i=4: prevClose(107)>prevVwap(105)
  // -> wasAbove, curClose(102)<=curVwap(104) -> REJECTION.
  const candles     = [{ close: 100 }, { close: 103 }, { close: 106 }, { close: 107 }, { close: 102 }]
  const vwapValues  = [null, 104, 104, 105, 104]

  const crosses = detectVwapCrosses(candles, vwapValues)
  assert.equal(crosses.length, 2)
  assert.deepEqual(crosses[0], { barIndex: 2, direction: 'reclaim', close: 106, vwap: 104 })
  assert.deepEqual(crosses[1], { barIndex: 4, direction: 'rejection', close: 102, vwap: 104 })
})

test('detectVwapCrosses: tidak ada cross sama sekali (selalu di atas VWAP) -> array kosong', () => {
  const candles    = [{ close: 110 }, { close: 112 }, { close: 111 }]
  const vwapValues = [105, 106, 107]
  assert.deepEqual(detectVwapCrosses(candles, vwapValues), [])
})

test('detectVwapCrosses: VWAP null (warmup awal hari) di-skip, tidak bikin cross palsu', () => {
  const candles    = [{ close: 100 }, { close: 105 }]
  const vwapValues = [null, null] // belum ada volume sama sekali, VWAP belum kebentuk
  assert.deepEqual(detectVwapCrosses(candles, vwapValues), [])
})

test('detectVwapCrosses: transisi DARI tepat di garis VWAP (close===vwap) TIDAK dihitung sbg cross', () => {
  // candle tengah close PERSIS sama dgn vwap-nya sendiri -- wasBelow/wasAbove
  // keduanya false (strict </>), jadi transisi BERIKUTNYA (walau jelas2 di
  // atas) TIDAK dianggap reclaim. Ini sengaja (dokumentasi di kode), hindari
  // sinyal palsu dari noise pas harga pas banget di rata-rata.
  const candles    = [{ close: 100 }, { close: 100 }, { close: 105 }]
  const vwapValues = [null, 100, 100]
  assert.deepEqual(detectVwapCrosses(candles, vwapValues), [])
})

test('detectVwapCrosses: candles & vwapValues beda panjang -> array kosong (bukan crash)', () => {
  assert.deepEqual(detectVwapCrosses([{ close: 100 }], [100, 101]), [])
})

test('detectFirstVwapCross: cuma ambil cross PERTAMA, bukan semua', () => {
  const candles     = [{ close: 100 }, { close: 103 }, { close: 106 }, { close: 107 }, { close: 102 }]
  const vwapValues  = [null, 104, 104, 105, 104]
  const first = detectFirstVwapCross(candles, vwapValues)
  assert.deepEqual(first, { barIndex: 2, direction: 'reclaim', close: 106, vwap: 104 })
})

test('detectFirstVwapCross: tidak ada cross -> null', () => {
  assert.equal(detectFirstVwapCross([{ close: 110 }], [105]), null)
})

test('detectVwapCrosses: BANYAK cross berselang-seling (reclaim-rejection-reclaim) -- SEMUA tertangkap, bukan cuma yg pertama/terakhir', () => {
  // i=1: 100<104(prevVwap[0]=104)? perlu prevVwap[0] != null dulu. Susun:
  // vwap konstan 100 sepanjang test ini (sengaja, isolasi cuma close yg berubah)
  const candles    = [
    { close: 95 },  // i=0: di bawah vwap(100)
    { close: 105 }, // i=1: RECLAIM (95<100 -> 105>=100)
    { close: 98 },  // i=2: REJECTION (105>100 -> 98<=100)
    { close: 102 }, // i=3: RECLAIM lagi (98<100 -> 102>=100)
    { close: 97 }   // i=4: REJECTION lagi (102>100 -> 97<=100)
  ]
  const vwapValues = [100, 100, 100, 100, 100]
  const crosses = detectVwapCrosses(candles, vwapValues)
  assert.equal(crosses.length, 4)
  assert.deepEqual(crosses.map(c => c.direction), ['reclaim', 'rejection', 'reclaim', 'rejection'])
  assert.deepEqual(crosses.map(c => c.barIndex), [1, 2, 3, 4])
})

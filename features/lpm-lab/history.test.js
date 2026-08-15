import { test } from 'node:test'
import assert from 'node:assert'
import { probePagination, fetchDayFull, normalizeTrades } from './history.js'

// Mock: simulasikan endpoint yg mengembalikan transaksi mundur via trade_number.
// Data: 250 transaksi, id 1000..1249, waktu menurun dari 16:00 ke 09:00.
function makeMockDay(total = 250) {
  const trades = []
  for (let i = 0; i < total; i++) {
    const id = String(1000 + i)
    // waktu menurun: transaksi 0 = terbaru (16:00), makin besar i makin awal
    const mins = 420 - Math.floor(i / (total/420))  // 09:00..16:00 range
    const hh = String(Math.floor(mins/60)+9).padStart(2,'0')
    const mm = String(mins%60).padStart(2,'0')
    trades.push({ id, trade_number: String(9000 - i), time: `${hh}:${mm}:00`,
                  lot: String((i%3)*50 + 50), action: i%2?'buy':'sell', price:'1000',
                  value:{raw:100} })
  }
  return trades  // sudah DESC (terbaru dulu)
}

// fetchFn mock: parse cursor dari URL, kembalikan 80 transaksi setelah cursor
function mockFetchFn(allTrades, limit = 80) {
  return async (url) => {
    const m = url.match(/trade_number=(\d+)/)
    let start = 0
    if (m) {
      const cursor = m[1]
      const idx = allTrades.findIndex(t => t.trade_number === cursor)
      start = idx >= 0 ? idx + 1 : 0
    }
    return allTrades.slice(start, start + limit)
  }
}

test('probePagination: deteksi paginasi bekerja', async () => {
  const day = makeMockDay(250)
  const r = await probePagination(mockFetchFn(day), 'X', '2026-03-16', 80)
  assert.equal(r.works, true)
  assert.equal(r.batch1Count, 80)
  assert.equal(r.batch2Count, 80)
  assert.equal(r.overlap, 0)               // batch2 tak tumpang tindih batch1
  assert.ok(r.batch2Latest <= r.batch1Earliest)  // batch2 mundur ke waktu lebih awal
})

test('probePagination: batch kosong → tak bekerja', async () => {
  const r = await probePagination(async () => [], 'X', '2026-03-16')
  assert.equal(r.works, false)
})

test('fetchDayFull: kumpulkan semua transaksi 1 hari', async () => {
  const day = makeMockDay(250)
  const all = await fetchDayFull(mockFetchFn(day), 'X', '2026-03-16', { limit: 80, maxBatch: 40 })
  assert.equal(all.length, 250)            // semua terkumpul
  // ascending by time: pertama <= terakhir
  assert.ok(all[0].time <= all[all.length-1].time)
})

test('fetchDayFull: dedup id, berhenti saat habis', async () => {
  const day = makeMockDay(100)             // < limit banyak batch
  const all = await fetchDayFull(mockFetchFn(day), 'X', '2026-03-16', { limit: 80, maxBatch: 40 })
  assert.equal(all.length, 100)
  const ids = new Set(all.map(t => t.id))
  assert.equal(ids.size, 100)              // tak ada duplikat
})

test('normalizeTrades: bentuk utk bot-engine', () => {
  const norm = normalizeTrades([{ lot:'50', action:'buy', time:'09:00', price:'1000', value:{raw:100}, id:'1', extra:'x' }])
  assert.deepEqual(Object.keys(norm[0]).sort(), ['action','id','lot','price','time','value'])
})

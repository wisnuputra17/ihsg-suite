/**
 * Penarik running-trade HISTORIS — fondasi grafik bot 1 tahun.
 *
 * TEMUAN yg dipakai:
 * - endpoint running-trade terima param `date` → transaksi hari itu (terbukti:
 *   Maret beda dari Agustus)
 * - paginasi via `trade_number` cursor (dari Network tab Stockbit): ambil batch,
 *   pakai trade_number transaksi TERLAMA sbg cursor batch berikutnya → gulir mundur
 * - tiap batch default 50-80 tx dari penutupan mundur
 *
 * CATATAN JUJUR: apakah paginasi benar-benar menggulir mundur SEPANJANG hari
 * masih perlu diverifikasi dgn data nyata (fungsi probePagination di bawah).
 * Kalau ternyata cuma kasih penutupan, deteksi bot tetap jalan tapi berbasis
 * sampel penutupan harian, bukan hari penuh.
 */

const HOST = 'https://exodus.stockbit.com'

function buildUrl(sym, date, limit, cursor) {
  let u = `${HOST}/order-trade/running-trade?symbols%5B%5D=${encodeURIComponent(sym)}`
        + `&sort=DESC&limit=${limit}&order_by=RUNNING_TRADE_ORDER_BY_TIME&date=${date}`
  if (cursor) u += `&trade_number=${cursor}`
  return u
}

/** Satu batch mentah. fetchFn = (url) => Promise<list>. */
async function fetchBatch(fetchFn, sym, date, limit, cursor) {
  const list = await fetchFn(buildUrl(sym, date, limit, cursor))
  return list || []
}

/**
 * Uji apakah paginasi trade_number menggulir mundur.
 * @returns {{works, batch1Count, batch2Count, batch1Earliest, batch2Latest, overlap}}
 */
export async function probePagination(fetchFn, sym, date, limit = 80) {
  const b1 = await fetchBatch(fetchFn, sym, date, limit)
  if (!b1.length) return { works: false, reason: 'batch1 kosong', batch1Count: 0 }
  const cursor = b1[b1.length - 1].trade_number
  const b2 = await fetchBatch(fetchFn, sym, date, limit, cursor)
  const b1Times = b1.map(t => t.time)
  const b2Times = b2.map(t => t.time)
  const b1Earliest = b1Times[b1Times.length - 1]
  const b2Latest = b2Times[0]
  // paginasi bekerja bila batch2 mundur ke waktu <= batch1 paling awal, & id beda
  const b1Ids = new Set(b1.map(t => t.id))
  const overlap = b2.filter(t => b1Ids.has(t.id)).length
  const works = b2.length > 0 && overlap < b2.length && b2Latest <= b1Earliest
  return { works, batch1Count: b1.length, batch2Count: b2.length,
           batch1Earliest: b1Earliest, batch2Latest: b2Latest, overlap, cursor }
}

/**
 * Tarik SEMUA transaksi 1 hari via paginasi mundur (sampai habis / maxBatch).
 * @returns {Array} transaksi ascending-by-time (lama→baru)
 */
export async function fetchDayFull(fetchFn, sym, date, { limit = 80, maxBatch = 40, onProgress } = {}) {
  const all = []
  const seen = new Set()
  let cursor = null
  for (let i = 0; i < maxBatch; i++) {
    const batch = await fetchBatch(fetchFn, sym, date, limit, cursor)
    if (!batch.length) break
    const fresh = batch.filter(t => !seen.has(t.id))
    if (!fresh.length) break                    // tak ada transaksi baru → habis
    for (const t of fresh) { seen.add(t.id); all.push(t) }
    cursor = batch[batch.length - 1].trade_number
    if (onProgress) onProgress(all.length, i + 1)
    if (batch.length < limit) break             // batch tak penuh → hari habis
  }
  // urutkan lama→baru pakai waktu
  return all.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0))
}

/** Normalisasi transaksi mentah ke bentuk yg dipakai bot-engine. */
export function normalizeTrades(list) {
  return list.map(t => ({ lot: t.lot, action: t.action, time: t.time,
                          price: t.price, value: t.value, id: t.id }))
}

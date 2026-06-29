/**
 * shared/indexeddb.js
 * =====================
 * Backend LOKAL (IndexedDB) — pengganti shared/firebase.js. Kontrak fungsi
 * (gsLoad/gsSave/gsAppend/gsClear) DIJAGA IDENTIK supaya tiap db.js fitur
 * cuma ganti 1 baris import, TIDAK perlu ubah logic apa pun — pola yang
 * sama persis dipakai saat migrasi sheets.js → firebase.js sebelumnya.
 *
 * KENAPA PINDAH DARI FIRESTORE (29 Jun 2026): Firestore Spark (gratis) ada
 * kuota harian baca/tulis yang kena 2x dalam 1 hari testing intensif —
 * Wisnu tidak punya kartu kredit utk upgrade ke Blaze, dan migrasi ke
 * backend cloud LAIN (Supabase, dst) tetap migrasi besar lagi dgn
 * karakteristik baru yang belum terbukti. IndexedDB: TIDAK ADA KONSEP
 * KUOTA SAMA SEKALI (baca/tulis sebanyak apa pun, gratis, tanpa kartu
 * kredit), TIDAK perlu internet. Trade-off yang DISADARI & DITERIMA:
 *   - TIDAK sinkron antar device (data tersimpan PER BROWSER/LAPTOP) —
 *     diterima krn Wisnu cuma pakai 1 laptop.
 *   - Data BISA hilang kalau cache browser di-clear / pindah laptop —
 *     diterima krn semua data ini ASALNYA bisa di-fetch ulang dari
 *     Stockbit (bukan data yang sekali hilang ya hilang selamanya).
 *
 * MODEL DATA: SATU object store ('records') utk SEMUA "sheet"/collection
 * (bukan 1 object store per sheet) — field `collection` di tiap record
 * jadi penanda, dgn INDEX di field itu utk lookup cepat. Dipilih supaya
 * TIDAK perlu tau di awal semua nama sheet yang akan ada (kalau pakai 1
 * object store per sheet, IndexedDB butuh `onupgradeneeded`/version bump
 * tiap kali ada sheet BARU — merepotkan & rawan lupa).
 *
 * Error yang di-throw (SAMA kontraknya dgn firebase.js/sheets.js — kode
 * .code TIDAK berubah, supaya error handling di tiap index.html tidak
 * perlu diubah):
 *   FETCH_FAILED   → gagal baca (jarang terjadi di IndexedDB, tapi tetap
 *                    dijaga utk konsistensi kontrak)
 *   SHEETS_ERROR    → gagal tulis (gsSave/gsAppend/gsClear)
 *
 * ⚠️ LIMITASI YANG PERLU DIKETAHUI:
 *   - filter di gsLoad(sheet, filter) HANYA dukung op '==' (kesetaraan
 *     persis) — sesuai SEMUA pemakaian filter yang ada sekarang di proyek
 *     ini. Kalau nanti butuh operator lain (>, <, dst), perlu diperluas.
 *   - IndexedDB PUNYA limit storage juga (biasanya berbasis % free disk
 *     space browser, bisa ratusan MB-GB) — TAPI TIDAK ADA limit jumlah
 *     REQUEST/operasi baca-tulis sama sekali, beda total dari Firestore
 *     yang limitnya justru di JUMLAH OPERASI per hari.
 */

const DB_NAME    = 'ihsg-suite'
const DB_VERSION = 1
const STORE_NAME = 'records'
const INDEX_NAME = 'by_collection'

let _dbPromise = null

/** Buka (atau bikin baru kalau belum ada) database IndexedDB. Lazy, sekali per page load. */
function _openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { autoIncrement: true })
        store.createIndex(INDEX_NAME, 'collection')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
  return _dbPromise
}

function _wrapError(code, e) {
  return Object.assign(new Error(code), { code, detail: e?.message || String(e) })
}

// ============================================================
// API PUBLIK — kontrak IDENTIK dengan shared/firebase.js
// ============================================================

/**
 * Baca semua record dari 1 "collection" (sheet).
 * @param {string} sheet
 * @param {{field:string, op:string, value:*}} [filter] - OPSIONAL, op HARUS
 *   '==' (satu-satunya yg didukung). Tanpa filter = ambil semua record.
 * @returns {Object[]} array of objects (field `collection` internal SUDAH dibuang dari hasil)
 */
export async function gsLoad(sheet, filter = null) {
  try {
    const db = await _openDB()
    return await new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readonly')
      const index = tx.objectStore(STORE_NAME).index(INDEX_NAME)
      const results = []
      const req = index.openCursor(IDBKeyRange.only(sheet))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const { collection, ...data } = cursor.value
          if (!filter || data[filter.field] === filter.value) results.push(data)
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    throw _wrapError('FETCH_FAILED', e)
  }
}

/**
 * Timpa seluruh isi collection dengan data baru (hapus semua record lama, tulis baru).
 * @param {string} sheet
 * @param {Object[]} data
 */
export async function gsSave(sheet, data) {
  try {
    const db = await _openDB()
    await new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index(INDEX_NAME)
      const req = index.openCursor(IDBKeyRange.only(sheet))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          data.forEach(obj => store.add({ collection: sheet, ...obj }))
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch (e) {
    throw _wrapError('SHEETS_ERROR', e)
  }
}

/**
 * Tambah record baru ke collection — TIDAK menghapus data lama.
 * @param {string} sheet
 * @param {Object[]} data
 */
export async function gsAppend(sheet, data) {
  if (!data || data.length === 0) return
  try {
    const db = await _openDB()
    await new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      data.forEach(obj => store.add({ collection: sheet, ...obj }))
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch (e) {
    throw _wrapError('SHEETS_ERROR', e)
  }
}

/**
 * Hapus semua record di collection.
 * @param {string} sheet
 */
export async function gsClear(sheet) {
  try {
    const db = await _openDB()
    await new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite')
      const index = tx.objectStore(STORE_NAME).index(INDEX_NAME)
      const req = index.openCursor(IDBKeyRange.only(sheet))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) { cursor.delete(); cursor.continue() }
      }
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch (e) {
    throw _wrapError('SHEETS_ERROR', e)
  }
}

/**
 * Shortcut utk gsLoad dengan filter '==' — OPSIONAL, sama spt firebase.js.
 * @example await gsLoadFiltered('ranking-daily', 'sym', 'BULL')
 */
export async function gsLoadFiltered(sheet, field, value) {
  return gsLoad(sheet, { field, op: '==', value })
}

/**
 * KHUSUS TESTING — reset koneksi + hapus database, supaya tiap test mulai
 * dari state bersih. JANGAN dipanggil dari kode produksi sama sekali.
 */
export async function _resetForTesting() {
  if (_dbPromise) {
    const db = await _dbPromise
    db.close()
  }
  _dbPromise = null
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
    req.onblocked = () => resolve() // jaring pengaman, jangan sampai hang
  })
}

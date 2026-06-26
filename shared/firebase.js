/**
 * shared/firebase.js
 * ====================
 * Pengganti shared/sheets.js — backend pindah dari Google Sheets/Apps Script
 * ke Firebase Firestore. Kontrak fungsi (nama, parameter, return value)
 * DIJAGA IDENTIK dengan sheets.js — tiap db.js fitur cuma perlu ganti 1
 * baris import (`from '../../shared/sheets.js'` → `from '../../shared/firebase.js'`),
 * TIDAK perlu ubah logic apa pun di db.js.
 *
 * KENAPA PINDAH (lihat histori sesi 23 Jun 2026):
 * Apps Script Web App terbukti FLAKY berkali-kali — CORS blocked / 500 / 404
 * berubah-ubah jenis tanpa kode kita diubah sama sekali. Pola "request sama
 * persis, error beda-beda setiap kali" itu ciri ketidakstabilan infrastruktur
 * Google Apps Script, BUKAN bug logika kita (sudah dicoba 2x perbaikan
 * berbasis kode — race condition & sheet idempoten — keduanya tidak
 * menyelesaikan, error tetap muncul dengan jenis berbeda). Firestore
 * didesain dari awal utk diakses langsung dari browser tanpa lapisan
 * Apps Script Web App yang rawan gagal itu.
 *
 * ⚠️ SETUP YANG WAJIB DILAKUKAN MANUAL SEBELUM FILE INI BISA DIPAKAI:
 * Lihat FIREBASE_SETUP.md di root repo — langkah lengkap bikin project
 * Firebase (gratis, Spark plan), aktifkan Firestore + Anonymous Auth,
 * deploy firestore.rules, lalu isi shared/firebase.config.js dengan config
 * asli project kamu (sekarang masih placeholder, TIDAK akan jalan).
 *
 * PENTING — BEDA PERILAKU dari sheets.js yang perlu diketahui:
 *   1. "sheet" yang dulu nama tab Google Sheets, sekarang jadi nama
 *      COLLECTION Firestore — konsepnya 1:1, tetap dipanggil dgn nama yang
 *      sama (mis. 'ranking-daily', 'winrate-intraday', dst).
 *   2. gsLoad() BISA terima filter opsional {field, op, value} — query
 *      spesifik di SERVER (mis. cuma ambil dokumen sym='BULL'), bukan
 *      download semua dokumen lalu filter di JS seperti pola lama. Dipanggil
 *      TANPA filter = perilaku sama persis dgn gsLoad lama (ambil semua).
 *      Ini OPSIONAL — db.js tidak wajib diubah utk pakai ini, tapi kalau
 *      diubah nanti, ini yang bikin makin banyak data ter-scan TIDAK bikin
 *      makin lambat (beda dari sheets.js yang selalu download semua baris).
 *   3. Field tanggal TIDAK PERNAH butuh normalisasi String(d).slice(0,10)
 *      lagi (bug pattern #2 di HANDOFF) — Firestore tidak auto-convert
 *      string ke Date seperti Google Sheets. Kode db.js yang masih panggil
 *      normalisasi itu TIDAK masalah (tetap aman, cuma tidak akan pernah
 *      ketemu kasus '...T00:00:00.000Z' lagi).
 *   4. TIDAK ADA isu "urutan kolom harus konsisten" (bug Code.gs _append
 *      yang sempat di-fix) — tiap dokumen Firestore independen, tidak ada
 *      konsep kolom/header yang harus disamakan urutannya.
 *   5. Batas 500 operasi per batch write Firestore — gsAppend/gsSave
 *      otomatis dipecah per 450 (kasih margin aman), TIDAK perlu db.js tau
 *      soal ini sama sekali.
 *
 * Error yang di-throw (SAMA kontraknya dengan sheets.js — kode .code TIDAK
 * berubah, supaya error handling di tiap index.html tidak perlu diubah):
 *   FETCH_FAILED   → network error / tidak bisa connect ke Firestore
 *   SHEETS_ERROR   → operasi Firestore gagal (permission, dst) — nama
 *                    'SHEETS_ERROR' DIPERTAHANKAN walau sumbernya sekarang
 *                    Firestore, bukan diganti, persis demi kompatibilitas itu.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js'
import {
  getFirestore, collection, getDocs, doc, query, where, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js'
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js'
import { FIREBASE_CONFIG } from './firebase.config.js'

// ============================================================
// SEKSI 1: INIT (lazy, sekali per page load)
// ============================================================

let _app  = null
let _db   = null
let _authReady = null

/**
 * Init Firebase app + Firestore + sign-in anonim (sekali saja, lazy).
 * Anonymous auth dipakai supaya firestore.rules bisa mensyaratkan
 * request.auth != null (tolak bot/script asing yang langsung tembak
 * Firestore tanpa lewat app ini) — TANPA perlu Wisnu login pakai
 * username/password apa pun. Transparan, tidak ada UI tambahan.
 */
async function _ensureInit() {
  if (_db && _authReady) { await _authReady; return _db }
  _app = initializeApp(FIREBASE_CONFIG)
  _db  = getFirestore(_app)
  const auth = getAuth(_app)
  _authReady = signInAnonymously(auth)
  await _authReady
  return _db
}

// ============================================================
// SEKSI 2: HELPER INTERNAL
// ============================================================

function _wrapError(code, e) {
  return Object.assign(new Error(code), { code, detail: e?.message || String(e) })
}

const BATCH_LIMIT = 450 // di bawah limit 500 operasi/batch Firestore, kasih margin aman

function _chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ============================================================
// SEKSI 3: API PUBLIK — kontrak IDENTIK dengan shared/sheets.js
// ============================================================

/**
 * Baca semua dokumen dari 1 collection ("sheet" lama).
 * @param {string} sheet - nama collection
 * @param {{field:string, op:string, value:*}} [filter] - OPSIONAL, query
 *   spesifik di server. Tanpa filter = ambil semua dokumen (sama spt lama).
 * @returns {Object[]} array of objects, [] kalau collection masih kosong
 */
export async function gsLoad(sheet, filter = null) {
  try {
    const db  = await _ensureInit()
    const col = collection(db, sheet)
    const q   = filter ? query(col, where(filter.field, filter.op, filter.value)) : col
    const snap = await getDocs(q)
    return snap.docs.map(d => d.data())
  } catch (e) {
    throw _wrapError('FETCH_FAILED', e)
  }
}

/**
 * Timpa seluruh isi collection dengan data baru (hapus semua dokumen lama,
 * tulis yang baru) — dipecah per batch 450 kalau datanya banyak.
 * @param {string} sheet
 * @param {Object[]} data - array of objects
 */
export async function gsSave(sheet, data) {
  try {
    const db  = await _ensureInit()
    const col = collection(db, sheet)
    const existing = await getDocs(col)

    for (const chunk of _chunk(existing.docs, BATCH_LIMIT)) {
      const batch = writeBatch(db)
      chunk.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    for (const chunk of _chunk(data, BATCH_LIMIT)) {
      const batch = writeBatch(db)
      chunk.forEach(obj => batch.set(doc(col), obj))
      await batch.commit()
    }
  } catch (e) {
    throw _wrapError('SHEETS_ERROR', e)
  }
}

/**
 * Tambah dokumen baru ke collection — TIDAK menghapus data lama.
 * @param {string} sheet
 * @param {Object[]} data - array of objects baru yang akan ditambahkan
 */
export async function gsAppend(sheet, data) {
  if (!data || data.length === 0) return
  try {
    const db  = await _ensureInit()
    const col = collection(db, sheet)
    for (const chunk of _chunk(data, BATCH_LIMIT)) {
      const batch = writeBatch(db)
      chunk.forEach(obj => batch.set(doc(col), obj))
      await batch.commit()
    }
  } catch (e) {
    throw _wrapError('SHEETS_ERROR', e)
  }
}

/**
 * Hapus semua dokumen di collection.
 * @param {string} sheet
 */
export async function gsClear(sheet) {
  try {
    const db  = await _ensureInit()
    const col = collection(db, sheet)
    const existing = await getDocs(col)
    for (const chunk of _chunk(existing.docs, BATCH_LIMIT)) {
      const batch = writeBatch(db)
      chunk.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  } catch (e) {
    throw _wrapError('SHEETS_ERROR', e)
  }
}

/**
 * BARU — query spesifik 1 field langsung di server (shortcut utk gsLoad
 * dengan filter). OPSIONAL, bukan wajib dipakai — gsLoad(sheet) tanpa filter
 * masih jalan sama seperti pola lama (ambil semua dokumen).
 * @example await gsLoadFiltered('ranking-daily', 'sym', 'BULL')
 */
export async function gsLoadFiltered(sheet, field, value) {
  return gsLoad(sheet, { field, op: '==', value })
}

/**
 * Pratinjau — hitung berapa dokumen yang AKAN terhapus oleh gsDeleteOlderThan
 * dengan parameter yang sama, TANPA benar-benar menghapus apa pun. Selalu
 * panggil ini DULU sebelum gsDeleteOlderThan — hapus permanen, tidak bisa
 * dibatalkan.
 * @returns {number} jumlah dokumen yang AKAN terhapus
 */
export async function gsCountOlderThan(sheet, dateField, cutoffDate) {
  try {
    const db   = await _ensureInit()
    const col  = collection(db, sheet)
    const snap = await getDocs(query(col, where(dateField, '<', cutoffDate)))
    return snap.docs.length
  } catch (e) {
    throw _wrapError('SHEETS_ERROR', e)
  }
}

/**
 * Hapus SEMUA dokumen di collection yang field tanggalnya LEBIH LAMA dari
 * cutoff — dipakai utk bersihkan cache lama (broker-analyzer-cache,
 * chart-lpm-cache, dst) yang sudah tidak relevan, supaya storage tidak
 * terus bertambah tanpa batas.
 *
 * Perbandingan string lexicographic AMAN buat format tanggal ISO
 * 'YYYY-MM-DD' — urutan string-nya otomatis sama dengan urutan kronologis
 * (tidak perlu parse jadi Date object dulu).
 *
 * ⚠️ PERMANEN, TIDAK BISA DIBATALKAN — panggil gsCountOlderThan() dulu
 * dengan parameter yang sama utk lihat berapa yang akan terhapus.
 *
 * @param {string} sheet - nama collection
 * @param {string} dateField - nama field tanggal di tiap dokumen (mis. 'date')
 * @param {string} cutoffDate - 'YYYY-MM-DD' — dokumen dgn dateField < ini DIHAPUS
 * @returns {number} jumlah dokumen yang dihapus
 * @example
 *   const n = await gsCountOlderThan('broker-analyzer-cache', 'date', '2025-06-01')
 *   console.log(`${n} dokumen akan terhapus`) // cek dulu, baru lanjut kalau wajar
 *   await gsDeleteOlderThan('broker-analyzer-cache', 'date', '2025-06-01')
 */
export async function gsDeleteOlderThan(sheet, dateField, cutoffDate) {
  try {
    const db   = await _ensureInit()
    const col  = collection(db, sheet)
    const snap = await getDocs(query(col, where(dateField, '<', cutoffDate)))
    for (const chunk of _chunk(snap.docs, BATCH_LIMIT)) {
      const batch = writeBatch(db)
      chunk.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    return snap.docs.length
  } catch (e) {
    throw _wrapError('SHEETS_ERROR', e)
  }
}

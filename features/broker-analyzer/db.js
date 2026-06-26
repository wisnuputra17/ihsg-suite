/**
 * features/broker-analyzer/db.js
 * ================================
 * Database in-memory untuk fitur Broker Analyzer.
 *
 * PENTING soal efisiensi: 1 request marketdetectors (from=to=1 tanggal) sudah
 * kasih SEMUA broker sekaligus (~100 broker) — bukan per-broker. Jadi cache
 * di sini SENGAJA disusun per-TANGGAL dulu (bukan per-broker dulu), supaya
 * fetch 1 hari bisa langsung dipakai utk BERAPAPUN broker yang dibandingkan,
 * tanpa fetch ulang tanggal yang sama berkali-kali per broker.
 *
 * SHAPE FIRESTORE (diubah 24 Jun 2026, lihat alasan di bawah): 1 DOKUMEN
 * PER (sym,date) — field `brokers` berisi MAP semua broker hari itu sekaligus
 * ({code: {buy,sell,net}, ...}), BUKAN 1 dokumen per (sym,date,broker).
 *
 * KENAPA DIUBAH: shape lama (1 dokumen per broker per hari) berarti ~100
 * writes Firestore PER HARI PER SAHAM. Wisnu rutin fetch beberapa TAHUN ke
 * belakang -- 1x fetch 3 tahun (~750 hari trading) x 100 broker = 75.000
 * writes, jauh melebihi kuota gratis 20.000 writes/hari Firestore DALAM
 * SATU SESI FETCH SAJA (dikonfirmasi Wisnu: grafik Usage Firestore sampai
 * 100% setelah testing). Shape baru ini cuma 1 write/hari/saham -- turun
 * ~100x, data TETAP lengkap (semua broker per hari, TIDAK dipotong/filter
 * spt bug sebelumnya yang cuma simpan broker yang dipilih user). Storage
 * juga ikut turun (lebih sedikit dokumen = lebih sedikit overhead metadata
 * & index per dokumen Firestore).
 *
 * ⚠️ MIGRASI: shape lama TIDAK kompatibel dgn shape baru (field `broker`
 * tunggal vs `brokers` map). Data lama di collection ini perlu di-gsClear()
 * dulu sebelum dipakai lagi -- lihat TODO.md.
 */

import { gsLoad, gsAppend } from '../../shared/firebase.js'

export const DB = {
  sym:    null,
  daily:  [],                          // candle harian, konteks harga
  brokerTop: { buys: [], sells: [] },  // snapshot top broker hari terakhir tersedia (1 request, murah)
  selectedBrokers: [],                 // ['BK','XL',...] kode broker yang dipilih utk dibandingkan
  brokerCache: {}                      // {date: {brokerCode: {buy,sell,net}} | null} — null = sudah dicek, API tidak punya data hari itu
}

const SHEET_BROKER_CACHE = 'broker-analyzer-cache'
const PREF_KEY = 'broker_analyzer_prefs'

// Lacak TANGGAL (bukan lagi date|broker, krn 1 dokumen = 1 hari penuh
// SEMUA broker sekaligus -- tidak ada lagi skenario "sebagian broker hari
// itu sudah tersimpan, sebagian belum") yang SUDAH tersimpan di Firestore.
const _persistedDates = new Set()

/** Firestore TIDAK auto-convert string tanggal jadi Date (beda dari Google
 * Sheets versi lama) -- normalisasi ini cuma jaring pengaman, harusnya
 * sudah selalu bersih, tapi tidak ada salahnya tetap dijaga. */
function _normalizeDate(d) {
  return String(d).slice(0, 10)
}

/** Load histori broker (HANYA utk sym ini, filter SERVER-SIDE) dari Firestore — dipanggil tiap ganti saham. */
export async function loadBrokerCacheForSym(sym) {
  _persistedDates.clear()
  try {
    const rows = await gsLoad(SHEET_BROKER_CACHE, { field: 'sym', op: '==', value: sym })
    const cache = {}
    rows.forEach(r => {
      const date = _normalizeDate(r.date)
      cache[date] = (r.brokers && Object.keys(r.brokers).length) ? r.brokers : null
      _persistedDates.add(date)
    })
    DB.brokerCache = cache
  } catch (e) {
    console.warn('[broker-analyzer/db] load cache gagal:', e.message)
    DB.brokerCache = {}
  }
}

/**
 * Simpan permanen histori broker yang BARU di-fetch — 1 dokumen PER TANGGAL
 * (field `brokers` = map SEMUA broker hari itu), BUKAN per broker. Tanggal
 * yang SUDAH tersimpan (cek _persistedDates) di-skip otomatis.
 * @param {string} sym
 * @param {{date:string, brokers:Object}[]} dateEntries
 */
export function appendBrokerCache(sym, dateEntries) {
  const newEntries = dateEntries.filter(e => !_persistedDates.has(e.date))
  if (!newEntries.length) return
  newEntries.forEach(e => _persistedDates.add(e.date)) // tandai SEBELUM await — cegah race kalau dipanggil 2x cepat
  const rows = newEntries.map(e => ({ sym, date: e.date, brokers: e.brokers }))
  gsAppend(SHEET_BROKER_CACHE, rows).catch(e =>
    console.warn('[broker-analyzer/db] append cache gagal:', e.message)
  )
}

/** Tandai tanggal "sudah dicek, API tidak punya data sama sekali" — brokers=null jadi sentinel-nya sendiri. */
export function appendNoDataDates(sym, dates) {
  const newDates = dates.filter(d => !_persistedDates.has(d))
  if (!newDates.length) return
  newDates.forEach(d => _persistedDates.add(d))
  const rows = newDates.map(date => ({ sym, date, brokers: null }))
  gsAppend(SHEET_BROKER_CACHE, rows).catch(e =>
    console.warn('[broker-analyzer/db] append no-data gagal:', e.message)
  )
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)) } catch (_) {}
}
export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') } catch (_) { return {} }
}

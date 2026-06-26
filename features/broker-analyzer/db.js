/**
 * features/broker-analyzer/db.js
 * ================================
 * Database in-memory untuk fitur Broker Analyzer.
 *
 * PENTING soal efisiensi: 1 request marketdetectors (from=to=1 tanggal) sudah
 * kasih SEMUA broker sekaligus (~70+ broker) — bukan per-broker. Jadi cache
 * di sini SENGAJA disusun per-TANGGAL dulu (bukan per-broker dulu), supaya
 * fetch 1 hari bisa langsung dipakai utk BERAPAPUN broker yang dibandingkan,
 * tanpa fetch ulang tanggal yang sama berkali-kali per broker.
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

// Lacak (date|broker) yang SUDAH tersimpan di Sheets — baik dari load awal
// maupun yang baru saja di-append sesi ini — supaya appendBrokerCache TIDAK
// menyimpan ulang baris yang sebenarnya sudah ada (misal skenario hapus lalu
// tambah lagi broker yang sama dalam 1 sesi).
const _persistedKeys = new Set()
function _key(date, broker) { return `${date}|${broker}` }

/** Google Sheets otomatis ubah string tanggal jadi Date cell — saat dibaca
 * balik formatnya jadi ISO lengkap ("2024-11-19T00:00:00.000Z"), bukan
 * "2024-11-19" polos seperti yang kita kirim. WAJIB dinormalisasi balik,
 * kalau tidak key cache tidak akan pernah cocok dengan tanggal yang dicek
 * di tempat lain (akibatnya: dianggap "belum di-fetch" terus, fetch ulang
 * tiap kali load meski sudah pernah tersimpan).
 */
function _normalizeDate(d) {
  return String(d).slice(0, 10)
}

/** Load histori broker (HANYA broker yang relevan utk sym ini) dari Sheets — dipanggil tiap ganti saham. */
export async function loadBrokerCacheForSym(sym) {
  _persistedKeys.clear()
  try {
    const rows = await gsLoad(SHEET_BROKER_CACHE)
    const cache = {}
    rows.filter(r => r.sym === sym).forEach(r => {
      const date = _normalizeDate(r.date)
      if (r.broker === '__none__') { cache[date] = null; _persistedKeys.add(_key(date, '__none__')); return }
      if (!cache[date]) cache[date] = {}
      cache[date][r.broker] = { buy: Number(r.buy), sell: Number(r.sell), net: Number(r.net) }
      _persistedKeys.add(_key(date, r.broker))
    })
    DB.brokerCache = cache
  } catch (e) {
    console.warn('[broker-analyzer/db] load cache gagal:', e.message)
    DB.brokerCache = {}
  }
}

/**
 * Simpan permanen data broker yang BARU di-fetch (append, bukan timpa semua).
 * Caller (features/broker-analyzer/index.html, _fetchDateBatch) MENGIRIM
 * SEMUA broker hasil 1 fetch (~100, sesuai limit API) -- BUKAN cuma yang
 * sedang dipilih user. Ini WAJIB, bukan optimasi storage: Top 10 butuh
 * data SEMUA broker utk ranking yang akurat di rentang waktu APA PUN, baik
 * sesi yang sedang berjalan MAUPUN setelah reload (waktu itu data yang ada
 * cuma yang sudah ke-persist ke sini). Sempat ada bug 24 Jun 2026 — fungsi
 * ini SEBELUMNYA cuma terima broker yang dipilih dari caller, akibatnya
 * Top 10 dari cache lama (setelah reload) cuma berisi sedikit broker.
 * Entry yang (date,broker)-nya SUDAH tersimpan (cek _persistedKeys) di-skip,
 * supaya tidak ada baris dobel kalau broker dihapus lalu ditambah lagi.
 * @param {string} sym
 * @param {{date, broker, buy, sell, net}[]} entries
 */
export function appendBrokerCache(sym, entries) {
  const newEntries = entries.filter(e => !_persistedKeys.has(_key(e.date, e.broker)))
  if (!newEntries.length) return
  newEntries.forEach(e => _persistedKeys.add(_key(e.date, e.broker))) // tandai SEBELUM await — cegah race kalau dipanggil 2x cepat
  const rows = newEntries.map(e => ({ sym, date: e.date, broker: e.broker, buy: e.buy, sell: e.sell, net: e.net }))
  gsAppend(SHEET_BROKER_CACHE, rows).catch(e =>
    console.warn('[broker-analyzer/db] append cache gagal:', e.message)
  )
}

/** Tandai 1 tanggal "sudah dicek, API tidak punya data sama sekali" — sentinel broker='__none__'. */
export function appendNoDataDates(sym, dates) {
  const newDates = dates.filter(d => !_persistedKeys.has(_key(d, '__none__')))
  if (!newDates.length) return
  newDates.forEach(d => _persistedKeys.add(_key(d, '__none__')))
  const rows = newDates.map(date => ({ sym, date, broker: '__none__', buy: -1, sell: -1, net: 0 }))
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

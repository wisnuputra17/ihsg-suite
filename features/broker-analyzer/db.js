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

import { gsLoad, gsAppend } from '../../shared/sheets.js'

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

/** Load histori broker (HANYA broker yang relevan utk sym ini) dari Sheets — dipanggil tiap ganti saham. */
export async function loadBrokerCacheForSym(sym) {
  _persistedKeys.clear()
  try {
    const rows = await gsLoad(SHEET_BROKER_CACHE)
    const cache = {}
    rows.filter(r => r.sym === sym).forEach(r => {
      if (r.broker === '__none__') { cache[r.date] = null; _persistedKeys.add(_key(r.date, '__none__')); return }
      if (!cache[r.date]) cache[r.date] = {}
      cache[r.date][r.broker] = { buy: Number(r.buy), sell: Number(r.sell), net: Number(r.net) }
      _persistedKeys.add(_key(r.date, r.broker))
    })
    DB.brokerCache = cache
  } catch (e) {
    console.warn('[broker-analyzer/db] load cache gagal:', e.message)
    DB.brokerCache = {}
  }
}

/**
 * Simpan permanen data broker yang BARU di-fetch (append, bukan timpa semua).
 * HANYA broker yang sedang dipilih user — supaya tidak membengkak nyimpan
 * 70+ broker/hari yang tidak pernah dilihat siapa-siapa.
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

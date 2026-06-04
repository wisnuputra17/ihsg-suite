/**
 * scalping/store.js
 * =================
 * Database in-memory untuk modul scalping.
 * Aturan ketat:
 *   - HANYA data domain — tidak ada STATE aplikasi, logic, atau UI
 *   - Seperti spreadsheet in-memory
 *   - Data yang perlu persist → localStorage via saveCache()/loadCache()
 *   - Data real-time (alerts) → tidak di-cache, hilang saat refresh wajar
 *
 * Analoginya:
 *   DB.winrate   = sheet "Win Rate"
 *   DB.iep       = sheet "IEP Historis"
 *   DB.haka      = sheet "HAKA Config + Feed"
 *   DB.hakahaki  = sheet "HAKA+HAKI Config + Feed"
 */

// ============================================================
// SEKSI 1: DATABASE
// ============================================================

export const DB = {

  // ----------------------------------------------------------
  // IEP — historis Indicative Equilibrium Price per saham
  // Key: kode saham (string)
  // Value: array [{date, price, vol, surge, ma10}]
  // ----------------------------------------------------------
  iep: {},
  // Contoh:
  // {
  //   BBCA: [
  //     { date: '2026-06-04', price: 9800, vol: 12500, surge: 2.1, ma10: 9650 },
  //     ...
  //   ]
  // }

  // ----------------------------------------------------------
  // HAKA — monitor BUY agresif (alert entry)
  // Watchlist bebas, maks 100 saham
  // ----------------------------------------------------------
  haka: {
    watchlist: [],       // ['BBCA', 'TPIA', ...]
    threshold: 500e6,    // default 500 juta
    alerts:    []        // [{sym, price, lot, value, time, id}]
    // alerts tidak di-cache — real-time, tiap sesi beda
  },

  // ----------------------------------------------------------
  // HAKA & HAKI — monitor posisi aktif (BUY + SELL agresif)
  // Fokus maks 20 saham yang sedang dipegang
  // ----------------------------------------------------------
  hakahaki: {
    watchlist: [],       // maks 20 saham
    threshold: 500e6,    // sama dengan haka, berubah bersama
    alerts:    []        // [{sym, price, lot, value, action:'buy'|'sell', time, id}]
    // alerts tidak di-cache — real-time, tiap sesi beda
  }

}

// ============================================================
// SEKSI 2: CACHE — localStorage sync
// Hanya data yang butuh persist antar sesi
// ============================================================

const CACHE_KEYS = {
  hakaWatchlist:    'scalping_haka_wl',
  hakahakiWatchlist:'scalping_hakahaki_wl',
  threshold:        'scalping_threshold',
  iep:              'scalping_iep'
}

/**
 * Simpan data yang perlu persist ke localStorage.
 * Dipanggil koordinator setiap kali data berubah.
 */
export function saveCache() {
  try {
    localStorage.setItem(CACHE_KEYS.hakaWatchlist,     JSON.stringify(DB.haka.watchlist))
    localStorage.setItem(CACHE_KEYS.hakahakiWatchlist, JSON.stringify(DB.hakahaki.watchlist))
    localStorage.setItem(CACHE_KEYS.threshold,         JSON.stringify(DB.haka.threshold))
    localStorage.setItem(CACHE_KEYS.iep,               JSON.stringify(DB.iep))
  } catch (e) {
    // localStorage penuh atau tidak tersedia — tidak fatal
    console.warn('[store] saveCache gagal:', e.message)
  }
}

/**
 * Baca cache dari localStorage ke DB.
 * Dipanggil koordinator sekali saat init.
 */
export function loadCache() {
  try {
    const hakaWl    = localStorage.getItem(CACHE_KEYS.hakaWatchlist)
    const hahakiWl  = localStorage.getItem(CACHE_KEYS.hakahakiWatchlist)
    const threshold = localStorage.getItem(CACHE_KEYS.threshold)
    const iep       = localStorage.getItem(CACHE_KEYS.iep)

    if (hakaWl)    DB.haka.watchlist     = JSON.parse(hakaWl)
    if (hahakiWl)  DB.hakahaki.watchlist = JSON.parse(hahakiWl)
    if (threshold) {
      const t = JSON.parse(threshold)
      DB.haka.threshold    = t
      DB.hakahaki.threshold = t
    }
    if (iep)       DB.iep = JSON.parse(iep)

  } catch (e) {
    console.warn('[store] loadCache gagal:', e.message)
  }
}

/**
 * Hapus semua cache scalping dari localStorage.
 * Untuk reset / debug.
 */
export function clearCache() {
  Object.values(CACHE_KEYS).forEach(k => localStorage.removeItem(k))
}

// ============================================================
// SEKSI 3: HELPER — operasi umum pada DB
// Bukan logic — hanya operasi data sederhana (add, remove, clear)
// ============================================================

/**
 * Tambah saham ke watchlist HAKA.
 * Ignore kalau sudah ada atau melebihi 100.
 */
export function hakaWatchlistAdd(sym) {
  if (DB.haka.watchlist.includes(sym))   return false
  if (DB.haka.watchlist.length >= 100)   return false
  DB.haka.watchlist.push(sym)
  return true
}

/**
 * Hapus saham dari watchlist HAKA.
 */
export function hakaWatchlistRemove(sym) {
  DB.haka.watchlist = DB.haka.watchlist.filter(s => s !== sym)
}

/**
 * Tambah saham ke watchlist HAKA+HAKI.
 * Maks 20 saham.
 */
export function hakahakiWatchlistAdd(sym) {
  if (DB.hakahaki.watchlist.includes(sym)) return false
  if (DB.hakahaki.watchlist.length >= 20)  return false
  DB.hakahaki.watchlist.push(sym)
  return true
}

/**
 * Hapus saham dari watchlist HAKA+HAKI.
 */
export function hakahakiWatchlistRemove(sym) {
  DB.hakahaki.watchlist = DB.hakahaki.watchlist.filter(s => s !== sym)
}

/**
 * Set threshold — berlaku untuk haka dan hakahaki sekaligus.
 * @param {number} val - 100e6 | 250e6 | 500e6 | 1e9 | 5e9
 */
export function setThreshold(val) {
  DB.haka.threshold     = val
  DB.hakahaki.threshold = val
}

/**
 * Tambah alert ke feed HAKA.
 * FIFO — maks 200 alert, yang lama otomatis terhapus.
 */
export function hakaAlertAdd(alert) {
  DB.haka.alerts.unshift(alert)       // terbaru di atas
  if (DB.haka.alerts.length > 200) DB.haka.alerts.pop()
}

/**
 * Tambah alert ke feed HAKA+HAKI.
 * FIFO — maks 200 alert.
 */
export function hakahakiAlertAdd(alert) {
  DB.hakahaki.alerts.unshift(alert)
  if (DB.hakahaki.alerts.length > 200) DB.hakahaki.alerts.pop()
}

/**
 * Clear semua alerts (reset feed).
 * @param {'haka'|'hakahaki'|'all'} target
 */
export function clearAlerts(target = 'all') {
  if (target === 'haka'    || target === 'all') DB.haka.alerts     = []
  if (target === 'hakahaki'|| target === 'all') DB.hakahaki.alerts = []
}

/**
 * Simpan hasil IEP historis untuk 1 saham.
 * @param {string} sym
 * @param {{date, price, vol, surge, ma10}[]} data
 */
export function setIep(sym, data) {
  DB.iep[sym] = data
}

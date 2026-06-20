/**
 * features/chart/db.js
 * =====================
 * Database in-memory untuk fitur Chart.
 * Data harga selalu fetch ulang (bukan input user) — tidak disimpan ke Sheets.
 * Hanya preferensi indikator yang dipilih disimpan ke localStorage (ringan,
 * wajar beda per-device, seperti setting tampilan).
 */

export const DB = {
  sym:    null,
  daily:  [],     // array OHLCV harian, urut lama → baru
  absorption: null // { date, net, buy, sell, prices } — hasil fetch terakhir
}

const PREF_KEY = 'chart_indicator_prefs'

/**
 * Simpan indikator mana yang sedang aktif (checkbox state).
 * @param {Object} prefs - {ma:bool, bollinger:bool, volume:bool, rsi:bool, macd:bool, absorption:bool}
 */
export function savePrefs(prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)) } catch (_) {}
}

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') } catch (_) { return {} }
}

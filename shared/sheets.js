/**
 * shared/sheets.js
 * ================
 * Helper generik untuk baca/tulis Google Sheets via Apps Script.
 * Semua fitur pakai ini — TIDAK boleh ada fungsi spesifik per modul.
 *
 * Pola pakai:
 *   import { gsGet, gsPost } from '../../shared/sheets.js'
 *   const data = await gsGet('load', { sheet: 'iep-scanner' })
 *   await gsPost('save', { sheet: 'cacing-watchlist', data: [...] })
 *
 * Error yang di-throw:
 *   SHEETS_NOT_CONFIGURED  → GS_URL belum diset
 *   SHEETS_ERROR           → Apps Script return status error
 *   FETCH_FAILED           → network error
 */

// ============================================================
// SEKSI 1: KONFIGURASI
// Ganti GS_URL setiap deploy Apps Script baru
// ============================================================

let GS_URL = localStorage.getItem('ihsglab_gs_url') || ''

/**
 * Set URL Apps Script. Dipanggil dari settings atau hardcode di koordinator.
 * URL disimpan ke localStorage supaya tidak perlu di-set ulang tiap buka tab.
 */
export function setGsUrl(url) {
  GS_URL = url
  localStorage.setItem('ihsglab_gs_url', url)
}

export function getGsUrl() {
  return GS_URL
}

export function isGsConfigured() {
  return !!GS_URL
}

// ============================================================
// SEKSI 2: HELPER INTERNAL
// ============================================================

async function _fetch(url, options = {}) {
  let res
  try {
    res = await fetch(url, options)
  } catch (e) {
    throw Object.assign(new Error('FETCH_FAILED'), { code: 'FETCH_FAILED', detail: e.message })
  }

  if (!res.ok) throw Object.assign(new Error('FETCH_FAILED'), { code: 'FETCH_FAILED', status: res.status })

  const json = await res.json()

  if (json?.status === 'error') {
    throw Object.assign(new Error('SHEETS_ERROR'), { code: 'SHEETS_ERROR', detail: json.message })
  }

  return json
}

function _checkUrl() {
  if (!GS_URL) throw Object.assign(new Error('SHEETS_NOT_CONFIGURED'), { code: 'SHEETS_NOT_CONFIGURED' })
}

// ============================================================
// SEKSI 3: API PUBLIK
// ============================================================

/**
 * Baca data dari satu sheet.
 * @param {string} sheet - nama sheet/tab di Spreadsheet
 * @param {Object} [params] - params tambahan (filter, limit, dll — opsional)
 * @returns {Object} json dari Apps Script, biasanya { status:'ok', data:[] }
 */
export async function gsGet(sheet, params = {}) {
  _checkUrl()
  const qs = new URLSearchParams({ action: 'load', sheet, ...params }).toString()
  return _fetch(`${GS_URL}?${qs}`)
}

/**
 * Tulis/timpa data ke satu sheet.
 * @param {string} sheet - nama sheet/tab di Spreadsheet
 * @param {Array}  data  - array of objects/arrays yang akan ditulis
 * @returns {Object} json dari Apps Script, biasanya { status:'ok', written: N }
 */
export async function gsPost(sheet, data) {
  _checkUrl()
  return _fetch(GS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action: 'save', sheet, data })
  })
}

/**
 * Hapus semua data di satu sheet (biarkan header tetap).
 * @param {string} sheet - nama sheet/tab di Spreadsheet
 */
export async function gsClear(sheet) {
  _checkUrl()
  return _fetch(GS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action: 'clear', sheet })
  })
}

/**
 * Append row/rows ke sheet tanpa menimpa data yang sudah ada.
 * @param {string} sheet - nama sheet/tab
 * @param {Array}  rows  - array of objects/arrays
 */
export async function gsAppend(sheet, rows) {
  _checkUrl()
  return _fetch(GS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action: 'append', sheet, data: rows })
  })
}

/**
 * Ping Apps Script — untuk verifikasi koneksi & URL benar.
 * @returns { status:'ok', spreadsheetId, sheets:[] }
 */
export async function gsPing() {
  _checkUrl()
  return _fetch(`${GS_URL}?action=ping`)
}

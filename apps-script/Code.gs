/**
 * IHSG Suite — Apps Script Generik
 * =================================
 * Satu script untuk semua fitur. Tidak ada fungsi spesifik per fitur.
 *
 * CARA DEPLOY:
 * 1. Buka https://script.google.com → buat project baru
 * 2. Paste seluruh kode ini
 * 3. Ganti SPREADSHEET_ID di bawah
 * 4. Klik Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy URL deployment → paste ke ihsg-suite settings
 *
 * PENTING: Selalu pakai "New deployment" (bukan "New version") setiap update.
 *
 * Actions yang didukung:
 *   GET  ?action=ping              → cek koneksi
 *   GET  ?action=load&sheet=nama   → baca semua data dari sheet
 *   POST {action:'save',   sheet, data:[]}    → timpa semua data
 *   POST {action:'append', sheet, data:[]}    → tambah ke bawah
 *   POST {action:'clear',  sheet}             → hapus data (biarkan header)
 *
 * Format sheet:
 *   - Baris 1: header (nama kolom) — WAJIB ADA, tidak boleh kosong
 *   - Baris 2+: data
 *   - Sheet akan dibuat otomatis kalau belum ada
 */

const SPREADSHEET_ID = 'GANTI_DENGAN_SPREADSHEET_ID_KAMU'

// ============================================================
// ENTRY POINT
// ============================================================

function doGet(e) {
  try {
    const action = e.parameter.action || ''
    const sheet  = e.parameter.sheet  || ''

    if (action === 'ping')  return _ok(_ping())
    if (action === 'load')  return _ok(_load(sheet, e.parameter))

    return _err('Unknown action: ' + action)
  } catch (err) {
    return _err(err.message)
  }
}

function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents)
    const action = body.action || ''
    const sheet  = body.sheet  || ''
    const data   = body.data   || []

    if (action === 'save')   return _ok(_save(sheet, data))
    if (action === 'append') return _ok(_append(sheet, data))
    if (action === 'clear')  return _ok(_clear(sheet))

    return _err('Unknown action: ' + action)
  } catch (err) {
    return _err(err.message)
  }
}

// ============================================================
// ACTIONS
// ============================================================

function _ping() {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID)
  const sheets = ss.getSheets().map(s => s.getName())
  return { spreadsheetId: SPREADSHEET_ID, sheets }
}

/**
 * Load semua data dari sheet.
 * Baris 1 = header → jadi key object.
 * Return array of objects: [{kolom1: val, kolom2: val}, ...]
 */
function _load(sheetName) {
  const sheet = _getOrCreateSheet(sheetName)
  const all   = sheet.getDataRange().getValues()
  if (all.length < 2) return { data: [] }

  const headers = all[0]
  const rows    = all.slice(1)
  const data    = rows.map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] })
    return obj
  })
  return { data }
}

/**
 * Timpa seluruh sheet dengan data baru.
 * Data bisa array of objects (key = nama kolom) atau array of arrays.
 * Kalau objects: header diambil dari key object pertama.
 */
function _save(sheetName, data) {
  const sheet = _getOrCreateSheet(sheetName)
  sheet.clearContents()

  if (!data || data.length === 0) return { written: 0 }

  const rows = _toRows(data)
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows)
  return { written: data.length }
}

/**
 * Tambah data ke bawah sheet yang sudah ada.
 * Kalau sheet kosong, header dari key object pertama akan ditulis dulu.
 */
function _append(sheetName, data) {
  if (!data || data.length === 0) return { written: 0 }
  const sheet    = _getOrCreateSheet(sheetName)
  const lastRow  = sheet.getLastRow()
  const rows     = _toRows(data)

  // Kalau sheet masih kosong, tulis lengkap (header + data)
  if (lastRow === 0) {
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows)
    return { written: data.length }
  }

  // Sudah ada data — tambah hanya baris data (skip header baris pertama rows)
  const dataRows = rows.slice(1)
  if (dataRows.length === 0) return { written: 0 }
  sheet.getRange(lastRow + 1, 1, dataRows.length, dataRows[0].length).setValues(dataRows)
  return { written: dataRows.length }
}

/**
 * Hapus semua data kecuali header (baris 1).
 */
function _clear(sheetName) {
  const sheet   = _getOrCreateSheet(sheetName)
  const lastRow = sheet.getLastRow()
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent()
  }
  return { cleared: true }
}

// ============================================================
// HELPER INTERNAL
// ============================================================

/** Ambil sheet by name, buat baru kalau belum ada */
function _getOrCreateSheet(name) {
  if (!name) throw new Error('Sheet name tidak boleh kosong')
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID)
  let   sheet = ss.getSheetByName(name)
  if (!sheet) sheet = ss.insertSheet(name)
  return sheet
}

/**
 * Konversi array of objects → 2D array dengan header di baris pertama.
 * Juga handle kalau input sudah array of arrays.
 */
function _toRows(data) {
  if (!data.length) return []

  // Sudah array of arrays — langsung return
  if (Array.isArray(data[0])) return data

  // Array of objects — extract header dari key object pertama
  const headers = Object.keys(data[0])
  const rows    = [headers, ...data.map(obj => headers.map(h => obj[h] ?? ''))]
  return rows
}

/** Wrapper response sukses */
function _ok(payload) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', ...payload }))
    .setMimeType(ContentService.MimeType.JSON)
}

/** Wrapper response error */
function _err(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', message }))
    .setMimeType(ContentService.MimeType.JSON)
}

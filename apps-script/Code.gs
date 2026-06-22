/**
 * IHSG Suite — Apps Script Generik (v2: row-based)
 * =================================================
 * Satu script untuk SEMUA fitur. Tidak ada fungsi spesifik per fitur.
 *
 * Format simpan: baris per data (bukan 1 blob JSON di sel A1)
 *   - Baris 1   = header (nama kolom, diambil dari key object pertama)
 *   - Baris 2+  = data
 *   - Bisa dibuka & dibaca langsung di Google Sheets — tidak seperti versi lama
 *
 * Data yang dikirim/diterima SELALU array of objects:
 *   [{kolom1: nilai, kolom2: nilai}, ...]
 * Kalau fitur punya bentuk data lain (object per-key, array string, dst),
 * itu dikonversi di db.js fitur masing-masing — Apps Script ini tidak perlu tahu.
 *
 * ===================================================
 * CARA DEPLOY:
 * 1. Buka https://script.google.com → buka project yang sudah ada (atau buat baru)
 * 2. Hapus semua kode lama, paste seluruh kode ini
 * 3. Pastikan SPREADSHEET_ID di bawah sudah benar
 * 4. Deploy → New deployment → pilih type "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy URL deployment yang baru → update di shared/sheets.js (GS_URL)
 *
 * PENTING: SELALU pilih "New deployment" tiap update kode, BUKAN "New version"
 * (sudah terbukti "New version" tidak bekerja untuk akun ini). URL akan berubah
 * tiap kali "New deployment" — wajib update di shared/sheets.js setelahnya.
 * ===================================================
 *
 * Actions yang didukung:
 *   GET  ?action=load&sheet=nama    → baca semua baris dari sheet → array of objects
 *   POST {action:'save',  sheet, data:[]}   → timpa semua isi sheet dengan data baru
 *   POST {action:'append',sheet, data:[]}   → tambah baris baru ke bawah (tidak hapus yang lama)
 *   POST {action:'clear', sheet}            → hapus semua data, sisakan header
 */

const SPREADSHEET_ID = '1JMa6x89Uw43WlRii2Ac-SElwE6KanOgSziVqqBIn7MI'

// ============================================================
// ENTRY POINT
// ============================================================

function doGet(e) {
  try {
    const action = e.parameter.action || ''
    const sheet  = e.parameter.sheet  || ''

    if (action === 'load') return _ok(_load(sheet))

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

/**
 * Baca semua baris dari sheet.
 * Baris 1 = header → jadi key tiap object.
 * @returns { data: [{kolom1, kolom2, ...}, ...] }
 */
function _load(sheetName) {
  const sheet = _getOrCreateSheet(sheetName)
  const all   = sheet.getDataRange().getValues()
  if (all.length < 2) return { data: [] }

  const headers = all[0]
  const rows    = all.slice(1)
  const data    = rows
    .filter(row => row.some(cell => cell !== '')) // skip baris benar-benar kosong
    .map(row => {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = row[i] })
      return obj
    })
  return { data }
}

/**
 * Timpa seluruh isi sheet dengan data baru.
 * @param {Array<Object>} data - array of objects
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
 * Tambah baris baru ke bawah, tanpa menghapus data lama.
 * Kalau sheet masih kosong, header ditulis dulu dari key object pertama.
 */
function _append(sheetName, data) {
  if (!data || data.length === 0) return { written: 0 }
  const sheet   = _getOrCreateSheet(sheetName)
  const lastRow = sheet.getLastRow()

  if (lastRow === 0) {
    // Sheet kosong — tulis header + data sekaligus, header dari key object pertama
    const rows = _toRows(data)
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows)
    return { written: data.length }
  }

  // Sheet sudah ada isinya — WAJIB pakai urutan header YANG SUDAH ADA di baris 1,
  // BUKAN urutan key dari object batch ini. Kalau dipaksa pakai urutan key batch
  // ini sendiri (seperti versi lama), batch dengan urutan/field beda dari
  // penulisan pertama akan menulis nilai ke kolom yang SALAH tanpa error apa pun.
  const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  const dataRows = data.map(obj => existingHeaders.map(h => {
    const v = obj[h]
    if (v !== null && typeof v === 'object') return JSON.stringify(v)
    return v ?? ''
  }))
  sheet.getRange(lastRow + 1, 1, dataRows.length, dataRows[0].length).setValues(dataRows)
  return { written: dataRows.length }
}

/**
 * Hapus semua baris data, sisakan baris header (baris 1).
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

/** Ambil sheet by name, buat baru otomatis kalau belum ada. */
function _getOrCreateSheet(name) {
  if (!name) throw new Error('Parameter "sheet" tidak boleh kosong')
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID)
  let   sheet = ss.getSheetByName(name)
  if (!sheet) sheet = ss.insertSheet(name)
  return sheet
}

/**
 * Konversi array of objects → 2D array dengan header di baris pertama.
 * Header diambil dari key object PERTAMA (semua object harus punya key yang sama).
 */
function _toRows(data) {
  if (!data.length) return []
  const headers = Object.keys(data[0])
  const rows    = [headers, ...data.map(obj => headers.map(h => {
    const v = obj[h]
    // Object/array nested → simpan sebagai JSON string dalam 1 sel
    if (v !== null && typeof v === 'object') return JSON.stringify(v)
    return v ?? ''
  }))]
  return rows
}

/** Wrapper response sukses */
function _ok(payload) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...payload }))
    .setMimeType(ContentService.MimeType.JSON)
}

/** Wrapper response error */
function _err(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON)
}

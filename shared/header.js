/**
 * shared/header.js
 * ================
 * Header standar untuk SEMUA halaman fitur — breadcrumb (kiri) + status token (kanan).
 * Satu sumber kebenaran, supaya tiap fitur baru otomatis konsisten tanpa duplikasi
 * ~80 baris logic token di tiap file.
 *
 * Cara pakai di tiap features/<nama>/index.html:
 *
 *   HTML:
 *     <header class="app-header" id="app-header"></header>
 *
 *   JS:
 *     import { renderHeader } from '../../shared/header.js'
 *     renderHeader(document.getElementById('app-header'), [
 *       { label: 'IHSG Suite', href: '../../index.html' },
 *       { label: 'Chart' }   // halaman saat ini — tanpa href
 *     ])
 *
 * Event yang di-dispatch ke window setelah token disimpan via popover ini:
 *   'ihsg:token-saved' — fitur bisa dengar ini untuk reaksi (misal auto-load data).
 */

import { TOKEN } from './store.js'
import { fetchMarketStatus } from './api.js'
import { gsLoad, gsSave } from './sheets.js'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // fallback kalau token bukan JWT / tanpa claim exp
const SHEET_TOKEN = 'user-token'

/**
 * Render header ke dalam container yang diberikan.
 * @param {HTMLElement} container - elemen <header> tujuan
 * @param {{label:string, href?:string}[]} crumbs - breadcrumb, item terakhir = halaman aktif (tanpa href)
 */
export function renderHeader(container, crumbs) {
  container.innerHTML = `
    <div class="app-header-left">
      ${crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1
        return isLast
          ? `<span class="breadcrumb-current">${c.label}</span>`
          : `<a class="breadcrumb-link" href="${c.href}">${c.label}</a><span class="breadcrumb-sep">/</span>`
      }).join('')}
    </div>
    <div class="token-status" id="hdr-token-status">
      <span class="status-dot" id="hdr-token-dot"></span>
      <span id="hdr-token-label">–––</span>
      <div class="token-popover hidden" id="hdr-token-popover">
        <input type="password" class="input" id="hdr-token-input" placeholder="Bearer token Stockbit..." style="flex:1;" autocomplete="off">
        <button class="btn btn-primary btn-sm" id="hdr-token-save">Simpan</button>
      </div>
    </div>
  `
  _bindTokenUI()
  // Kalau token lokal kosong/expired, coba ambil dari Sheets dulu (mungkin
  // baru diisi dari device lain) — SEBELUM render status, supaya tidak
  // sempat tampil "Token belum diisi" lalu berubah lagi sesaat kemudian.
  _syncTokenFromSheetsIfNeeded().then(_renderStatus)
  setInterval(_renderStatus, 60_000)
}

/**
 * Kalau token lokal tidak ada / sudah pasti expired, coba ambil dari Sheets
 * (sinkron antar device). Tidak menimpa token lokal yang masih valid.
 */
async function _syncTokenFromSheetsIfNeeded() {
  if (TOKEN.isSet()) {
    const expMs = TOKEN.getExpiryMs()
    if (expMs === null || expMs > Date.now()) return // token lokal masih oke (atau tak bisa dicek), jangan ganggu
  }
  try {
    const rows = await gsLoad(SHEET_TOKEN)
    const remoteToken = rows?.[0]?.token
    if (!remoteToken) return
    TOKEN.set(remoteToken)
    const remoteExp = TOKEN.getExpiryMs()
    if (remoteExp !== null && remoteExp <= Date.now()) TOKEN.clear() // token di Sheets juga sudah expired
  } catch (e) {
    console.warn('[header] gagal sync token dari Sheets:', e.message)
  }
}

function _bindTokenUI() {
  const statusEl = document.getElementById('hdr-token-status')
  const popover  = document.getElementById('hdr-token-popover')
  const input    = document.getElementById('hdr-token-input')
  const saveBtn  = document.getElementById('hdr-token-save')

  statusEl.addEventListener('click', e => {
    // PENTING: kalau klik di DALAM popover (misal fokus ke input), jangan toggle.
    // Bug lama: popover ditaruh di dalam elemen yang punya listener toggle, jadi
    // klik di input ikut "bubble" ke listener ini dan menutup popovernya sendiri.
    if (popover.contains(e.target)) return
    e.stopPropagation()
    popover.classList.toggle('hidden')
    if (!popover.classList.contains('hidden')) input.focus()
  })

  document.addEventListener('click', e => {
    if (!statusEl.contains(e.target)) popover.classList.add('hidden')
  })

  saveBtn.addEventListener('click', () => {
    const v = input.value.trim()
    if (!v) return
    TOKEN.set(v)
    gsSave(SHEET_TOKEN, [{ token: v }]).catch(e => console.warn('[header] gagal simpan token ke Sheets:', e.message))
    input.value = ''
    popover.classList.add('hidden')
    _renderStatus()
    window.dispatchEvent(new CustomEvent('ihsg:token-saved'))
  })

  input.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click() })
}

function _fmtDuration(ms) {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}j ${m}m` : `${m}m`
}

function _renderStatus() {
  const dot   = document.getElementById('hdr-token-dot')
  const label = document.getElementById('hdr-token-label')
  if (!dot || !label) return // header belum/sudah tidak ada di DOM

  if (!TOKEN.isSet()) {
    dot.className = 'status-dot'
    label.textContent = 'Token belum diisi'
    return
  }

  // Kadaluarsa PASTI dari claim `exp` JWT (lihat shared/store.js) — fallback estimasi
  // kalau token bukan JWT / tidak ada exp.
  const expMs = TOKEN.getExpiryMs()
  let remaining
  if (expMs !== null) {
    remaining = expMs - Date.now()
  } else {
    const elapsed = TOKEN.elapsedMs()
    remaining = elapsed !== null ? TOKEN_TTL_MS - elapsed : null
  }
  const sisaTxt = remaining !== null
    ? (remaining > 0 ? `sisa ${_fmtDuration(remaining)}` : 'kadaluarsa')
    : ''

  if (remaining !== null && remaining <= 0) {
    dot.className = 'status-dot down'
    label.textContent = 'Token expired'
    return
  }

  dot.className = 'status-dot wait'
  label.textContent = sisaTxt ? `Memeriksa · ${sisaTxt}` : 'Memeriksa...'

  // Verifikasi real ke API — dot hijau/merah berdasarkan kenyataan, bukan cuma hitungan waktu
  fetchMarketStatus().then(() => {
    dot.className = 'status-dot live'
    label.textContent = sisaTxt ? `Token · ${sisaTxt}` : 'Token aktif'
  }).catch(e => {
    if (e.code === 'TOKEN_EXPIRED') {
      dot.className = 'status-dot down'
      label.textContent = 'Token expired'
    } else {
      dot.className = 'status-dot wait'
      label.textContent = sisaTxt || 'Status tidak diketahui'
    }
  })
}

/** Dipanggil fitur lain kalau perlu paksa refresh status (misal setelah dapat TOKEN_EXPIRED dari fetch lain). */
export function refreshTokenStatus() {
  _renderStatus()
}

/** Buka popover token secara terprogram (misal saat fitur butuh token tapi belum diisi). */
export function openTokenPopover() {
  const popover = document.getElementById('hdr-token-popover')
  const input   = document.getElementById('hdr-token-input')
  if (!popover) return
  popover.classList.remove('hidden')
  if (input) input.focus()
}

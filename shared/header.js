/**
 * shared/header.js
 * ================
 * Header standar untuk SEMUA halaman — breadcrumb (kiri) + status token (kanan).
 * Termasuk index.html (landing page) yang sekarang pakai komponen yang sama.
 *
 * Cara pakai di setiap halaman:
 *
 *   HTML:
 *     <header class="app-header" id="app-header"></header>
 *
 *   JS:
 *     import { renderHeader } from '../../shared/header.js'
 *     renderHeader(document.getElementById('app-header'), [
 *       { label: 'IHSG Suite', href: '../../index.html' },
 *       { label: 'Chart' }
 *     ])
 *
 * Untuk landing page (index.html), breadcrumb cukup satu item:
 *     renderHeader(document.getElementById('app-header'), [
 *       { label: 'IHSG Suite' }
 *     ])
 *
 * Setelah token disimpan, semua onReady() callback di shared/token.js dipanggil.
 */

import { TOKEN }            from './store.js'
import { fetchMarketStatus } from './api.js'
import { gsLoad, gsSave }   from './sheets.js'
import { dispatchReady }    from './token.js'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const SHEET_TOKEN  = 'user-token'

let _syncPromise = null

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render header standar ke container.
 * @param {HTMLElement} container
 * @param {{label:string, href?:string}[]} crumbs
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
        <input type="password" class="input" id="hdr-token-input"
               placeholder="Bearer token Stockbit..." style="flex:1;" autocomplete="off">
        <button class="btn btn-primary btn-sm" id="hdr-token-save">Simpan</button>
      </div>
    </div>
  `
  _bindTokenUI()

  // Sync token dari Sheets kalau belum ada / expired, lalu render status.
  // Setelah sync selesai (atau token sudah ada), dispatchReady() dipanggil
  // sehingga semua onReady() callback di fitur-fitur otomatis terpicu.
  syncTokenFromSheetsIfNeeded().then(() => {
    _renderStatus()
    // Kalau token sudah ada (dari localStorage atau dari Sheets), dispatch ready
    if (TOKEN.isSet()) dispatchReady()
  })

  setInterval(_renderStatus, 60_000)
}

/**
 * Tunggu sync token selesai sebelum cek TOKEN.isSet().
 * Berguna untuk fitur yang butuh keputusan akurat di awal load.
 */
export async function whenTokenReady() {
  if (_syncPromise) await _syncPromise
}

/**
 * Sync token dari Sheets kalau token lokal tidak ada / expired.
 * Diekspor agar bisa dipakai halaman yang tidak pakai renderHeader.
 */
export function syncTokenFromSheetsIfNeeded() {
  _syncPromise = _doSync()
  return _syncPromise
}

/**
 * Simpan token ke localStorage + Sheets + trigger semua onReady callbacks.
 * Satu-satunya jalur untuk simpan token — tidak ada jalur lain.
 */
export function saveTokenEverywhere(v) {
  TOKEN.set(v)
  gsSave(SHEET_TOKEN, [{ token: v }])
    .catch(e => console.warn('[header] gagal simpan token ke Sheets:', e.message))
  _renderStatus()
  dispatchReady()
}

/** Buka popover token secara terprogram. */
export function openTokenPopover() {
  const popover = document.getElementById('hdr-token-popover')
  const input   = document.getElementById('hdr-token-input')
  if (!popover) return
  popover.classList.remove('hidden')
  if (input) input.focus()
}

/** Paksa refresh tampilan status token di header. */
export function refreshTokenStatus() {
  _renderStatus()
}

// ── Private ───────────────────────────────────────────────────────────────────

async function _doSync() {
  if (TOKEN.isSet()) {
    const expMs = TOKEN.getExpiryMs()
    // Token lokal masih valid — tidak perlu sync, langsung return
    if (expMs === null || expMs > Date.now()) return
  }
  try {
    const rows = await Promise.race([
      gsLoad(SHEET_TOKEN),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_SYNC_TOKEN')), 10_000)
      )
    ])
    const remoteToken = rows?.[0]?.token
    if (!remoteToken) return
    TOKEN.set(remoteToken)
    const remoteExp = TOKEN.getExpiryMs()
    if (remoteExp !== null && remoteExp <= Date.now()) {
      TOKEN.clear(); return // token di Sheets juga expired
    }
    // Token dari Sheets berhasil di-load — trigger dispatchReady()
    // (dilakukan di .then() caller — renderHeader)
  } catch (e) {
    console.warn('[header] gagal sync token dari Sheets:', e.message)
  }
}

function _bindTokenUI() {
  const statusEl = document.getElementById('hdr-token-status')
  const popover  = document.getElementById('hdr-token-popover')
  const input    = document.getElementById('hdr-token-input')
  const saveBtn  = document.getElementById('hdr-token-save')
  if (!statusEl) return

  statusEl.addEventListener('click', e => {
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
    saveTokenEverywhere(v)
    input.value = ''
    popover.classList.add('hidden')
  })

  input.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click() })
}

function _fmtDuration(ms) {
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}j ${m}m` : `${m}m`
}

function _renderStatus() {
  const dot   = document.getElementById('hdr-token-dot')
  const label = document.getElementById('hdr-token-label')
  if (!dot || !label) return

  if (!TOKEN.isSet()) {
    dot.className   = 'status-dot'
    label.textContent = 'Token belum diisi'
    return
  }

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
    dot.className   = 'status-dot down'
    label.textContent = 'Token expired'
    return
  }

  dot.className   = 'status-dot wait'
  label.textContent = sisaTxt ? `Memeriksa · ${sisaTxt}` : 'Memeriksa...'

  fetchMarketStatus().then(() => {
    dot.className   = 'status-dot live'
    label.textContent = sisaTxt ? `Token · ${sisaTxt}` : 'Token aktif'
  }).catch(e => {
    if (e.code === 'TOKEN_EXPIRED') {
      dot.className   = 'status-dot down'
      label.textContent = 'Token expired'
    } else {
      dot.className   = 'status-dot wait'
      label.textContent = sisaTxt || 'Status tidak diketahui'
    }
  })
}

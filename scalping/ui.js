/**
 * scalping/ui.js
 * ==============
 * Semua rendering dan tangkap aksi user untuk modul Scalping.
 * Aturan ketat:
 *   - HANYA render dan tangkap aksi user
 *   - TIDAK ada fetch, kalkulasi, atau logic bisnis
 *   - Semua aksi user → lapor ke koordinator via callback
 *   - Baca data dari DB (scalping/db.js) untuk render
 *
 * Pola:
 *   koordinator panggil ui.init(callbacks) → ui siap
 *   user aksi → ui panggil callback → koordinator handle
 *   koordinator update DB → koordinator panggil ui.render*() → ui update tampilan
 */

import { DB } from './db.js'

// ============================================================
// SEKSI 1: STATE UI — internal, tidak di store/db
// ============================================================

let _tab         = 'iep'      // tab aktif saat ini
let _callbacks   = {}         // callback dari koordinator
let _initialized = false

// ============================================================
// SEKSI 2: INIT
// ============================================================

/**
 * Inisialisasi UI — dipanggil koordinator sekali saat load.
 * @param {Object} callbacks
 * @param {Function} callbacks.onTabChange        - (tab) => void
 * @param {Function} callbacks.onHakaAdd          - (sym) => void
 * @param {Function} callbacks.onHakaRemove       - (sym) => void
 * @param {Function} callbacks.onHakahakiAdd      - (sym) => void
 * @param {Function} callbacks.onHakahakiRemove   - (sym) => void
 * @param {Function} callbacks.onThresholdChange  - (val) => void
 * @param {Function} callbacks.onStartHaka        - () => void
 * @param {Function} callbacks.onStopHaka         - () => void
 * @param {Function} callbacks.onStartHakahaki    - () => void
 * @param {Function} callbacks.onStopHakahaki     - () => void
 * @param {Function} callbacks.onStartIep         - () => void
 * @param {Function} callbacks.onStopIep          - () => void
 * @param {Function} callbacks.onClearAlerts      - (target) => void
 */
export function init(callbacks) {
  _callbacks   = callbacks
  _initialized = true
  _bindTabs()
  _bindTokenInput()
  renderAll()
}

// ============================================================
// SEKSI 3: TAB
// ============================================================

function _bindTabs() {
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      const tab = el.dataset.tab
      if (tab === _tab) return
      _tab = tab
      _renderTabActive()
      if (_callbacks.onTabChange) _callbacks.onTabChange(tab)
    })
  })
}

function _renderTabActive() {
  // Tab buttons
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === _tab)
  })
  // Tab panels
  document.querySelectorAll('[data-panel]').forEach(el => {
    el.classList.toggle('hidden', el.dataset.panel !== _tab)
  })
}

export function setTab(tab) {
  _tab = tab
  _renderTabActive()
}

export function getTab() { return _tab }

// ============================================================
// SEKSI 4: TOKEN INPUT
// ============================================================

function _bindTokenInput() {
  const input  = document.getElementById('sc-token-input')
  const btnSave = document.getElementById('sc-token-save')
  if (!input || !btnSave) return

  btnSave.addEventListener('click', () => {
    if (_callbacks.onTokenSave) _callbacks.onTokenSave(input.value.trim())
  })

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnSave.click()
  })
}

// ============================================================
// SEKSI 5: RENDER — IEP SCANNER
// ============================================================

/**
 * Render tabel hasil IEP Scanner.
 * Dipanggil koordinator setelah scan selesai atau DB.iep berubah.
 */
export function renderIep() {
  const container = document.getElementById('iep-results')
  if (!container) return

  // Flatten DB.iep ke array untuk sorting
  const rows = []
  for (const [sym, entries] of Object.entries(DB.iep)) {
    if (!entries.length) continue
    const latest = entries[0]  // index 0 = hari paling baru
    rows.push({ sym, ...latest, history: entries })
  }

  if (!rows.length) {
    container.innerHTML = _emptyState('Belum ada data IEP. Jalankan scanner.')
    return
  }

  // Sort by surge desc
  rows.sort((a, b) => (b.surge || 0) - (a.surge || 0))

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Saham</th>
          <th>IEP Terakhir</th>
          <th>Volume</th>
          <th>Vol Surge</th>
          <th>MA10 Vol</th>
          <th>Tanggal</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr class="${(r.surge || 0) >= 3 ? 'row-highlight' : ''}">
            <td class="sym-cell">${r.sym}</td>
            <td class="num-cell">${_fmtPrice(r.price)}</td>
            <td class="num-cell">${_fmtVol(r.vol)}</td>
            <td class="num-cell ${(r.surge || 0) >= 2 ? 'text-green' : (r.surge || 0) >= 1 ? 'text-yellow' : 'text-red'}">
              ${r.surge !== null ? r.surge.toFixed(2) + 'x' : '–'}
            </td>
            <td class="num-cell">${r.ma10 ? _fmtVol(r.ma10) : '–'}</td>
            <td class="dim-cell">${r.date || '–'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

/**
 * Render progress bar IEP Scanner.
 * @param {number} done  - jumlah saham selesai di-scan
 * @param {number} total - total saham yang di-scan
 * @param {boolean} running
 */
export function renderIepProgress(done, total, running) {
  const bar   = document.getElementById('iep-progress-bar')
  const label = document.getElementById('iep-progress-label')
  const btn   = document.getElementById('iep-btn-start')
  if (!bar || !label || !btn) return

  const pct = total > 0 ? Math.round(done / total * 100) : 0
  bar.style.width     = pct + '%'
  label.textContent   = running ? `${done} / ${total} saham (${pct}%)` : (done > 0 ? `Selesai — ${done} saham` : '')
  btn.textContent     = running ? 'Stop' : 'Scan'
  btn.dataset.running = running ? '1' : '0'
  btn.classList.toggle('btn-danger', running)
}

// Bind tombol IEP — dipanggil sekali saat init panel
export function bindIepButtons() {
  const btn = document.getElementById('iep-btn-start')
  if (!btn) return
  btn.addEventListener('click', () => {
    const running = btn.dataset.running === '1'
    if (running) { if (_callbacks.onStopIep)  _callbacks.onStopIep() }
    else         { if (_callbacks.onStartIep) _callbacks.onStartIep() }
  })
}

// ============================================================
// SEKSI 6: RENDER — HAKA
// ============================================================

/**
 * Render watchlist chips HAKA.
 */
export function renderHakaWatchlist() {
  const container = document.getElementById('haka-watchlist')
  if (!container) return

  container.innerHTML = DB.haka.watchlist.map(sym => `
    <span class="chip">
      ${sym}
      <button class="chip-remove" data-sym="${sym}" data-monitor="haka">×</button>
    </span>
  `).join('') + `
    <span class="chip-count">${DB.haka.watchlist.length}/100</span>
  `

  // Bind remove buttons
  container.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onHakaRemove) _callbacks.onHakaRemove(btn.dataset.sym)
    })
  })
}

/**
 * Render alert feed HAKA.
 */
export function renderHakaAlerts() {
  const container = document.getElementById('haka-feed')
  if (!container) return

  if (!DB.haka.alerts.length) {
    container.innerHTML = _emptyState('Belum ada alert. Jalankan monitor.')
    return
  }

  container.innerHTML = DB.haka.alerts.map(a => `
    <div class="alert-card alert-buy">
      <div class="alert-sym">${a.sym}</div>
      <div class="alert-val">${_fmtRp(a.value)}</div>
      <div class="alert-detail">
        ${_fmtLot(a.lot)} lot × ${_fmtPrice(a.price)}
      </div>
      <div class="alert-time">${a.time}</div>
    </div>
  `).join('')
}

/**
 * Render tombol start/stop HAKA + status.
 * @param {boolean} running
 */
export function renderHakaStatus(running) {
  const btn    = document.getElementById('haka-btn-start')
  const status = document.getElementById('haka-status')
  if (!btn) return

  btn.textContent     = running ? 'Stop Monitor' : 'Start Monitor'
  btn.dataset.running = running ? '1' : '0'
  btn.classList.toggle('btn-danger', running)

  if (status) {
    status.textContent  = running ? '● Monitoring...' : '○ Idle'
    status.className    = 'monitor-status ' + (running ? 'status-running' : 'status-idle')
  }
}

// Bind semua tombol HAKA — dipanggil sekali saat init panel
export function bindHakaButtons() {
  // Tombol start/stop
  const btn = document.getElementById('haka-btn-start')
  if (btn) {
    btn.addEventListener('click', () => {
      const running = btn.dataset.running === '1'
      if (running) { if (_callbacks.onStopHaka)  _callbacks.onStopHaka() }
      else         { if (_callbacks.onStartHaka) _callbacks.onStartHaka() }
    })
  }

  // Input tambah saham
  const input  = document.getElementById('haka-sym-input')
  const addBtn = document.getElementById('haka-sym-add')
  if (input && addBtn) {
    const _add = () => {
      const sym = input.value.trim().toUpperCase()
      if (!sym) return
      if (_callbacks.onHakaAdd) _callbacks.onHakaAdd(sym)
      input.value = ''
      input.focus()
    }
    addBtn.addEventListener('click', _add)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') _add() })
  }

  // Threshold selector
  document.querySelectorAll('[data-threshold]').forEach(el => {
    el.addEventListener('click', () => {
      const val = parseFloat(el.dataset.threshold)
      if (_callbacks.onThresholdChange) _callbacks.onThresholdChange(val)
    })
  })

  // Clear alerts
  const clearBtn = document.getElementById('haka-btn-clear')
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (_callbacks.onClearAlerts) _callbacks.onClearAlerts('haka')
    })
  }
}

/**
 * Render threshold buttons — highlight yang aktif.
 */
export function renderThreshold() {
  document.querySelectorAll('[data-threshold]').forEach(el => {
    const val = parseFloat(el.dataset.threshold)
    el.classList.toggle('active', val === DB.haka.threshold)
  })
}

// ============================================================
// SEKSI 7: RENDER — HAKA+HAKI
// ============================================================

/**
 * Render watchlist chips HAKA+HAKI.
 */
export function renderHakahakiWatchlist() {
  const container = document.getElementById('hakahaki-watchlist')
  if (!container) return

  container.innerHTML = DB.hakahaki.watchlist.map(sym => `
    <span class="chip">
      ${sym}
      <button class="chip-remove" data-sym="${sym}" data-monitor="hakahaki">×</button>
    </span>
  `).join('') + `
    <span class="chip-count">${DB.hakahaki.watchlist.length}/20</span>
  `

  container.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_callbacks.onHakahakiRemove) _callbacks.onHakahakiRemove(btn.dataset.sym)
    })
  })
}

/**
 * Render alert feed HAKA+HAKI — BUY dan SELL dalam 1 feed.
 */
export function renderHakahakiAlerts() {
  const container = document.getElementById('hakahaki-feed')
  if (!container) return

  if (!DB.hakahaki.alerts.length) {
    container.innerHTML = _emptyState('Belum ada alert. Jalankan monitor.')
    return
  }

  container.innerHTML = DB.hakahaki.alerts.map(a => `
    <div class="alert-card ${a.action === 'buy' ? 'alert-buy' : 'alert-sell'}">
      <div class="alert-sym">${a.sym}</div>
      <div class="alert-action">${a.action === 'buy' ? '▲ HAKA' : '▼ HAKI'}</div>
      <div class="alert-val">${_fmtRp(a.value)}</div>
      <div class="alert-detail">
        ${_fmtLot(a.lot)} lot × ${_fmtPrice(a.price)}
      </div>
      <div class="alert-time">${a.time}</div>
    </div>
  `).join('')
}

/**
 * Render status monitor HAKA+HAKI.
 */
export function renderHakahakiStatus(running) {
  const btn    = document.getElementById('hakahaki-btn-start')
  const status = document.getElementById('hakahaki-status')
  if (!btn) return

  btn.textContent     = running ? 'Stop Monitor' : 'Start Monitor'
  btn.dataset.running = running ? '1' : '0'
  btn.classList.toggle('btn-danger', running)

  if (status) {
    status.textContent = running ? '● Monitoring...' : '○ Idle'
    status.className   = 'monitor-status ' + (running ? 'status-running' : 'status-idle')
  }
}

// Bind tombol HAKA+HAKI
export function bindHakahakiButtons() {
  const btn = document.getElementById('hakahaki-btn-start')
  if (btn) {
    btn.addEventListener('click', () => {
      const running = btn.dataset.running === '1'
      if (running) { if (_callbacks.onStopHakahaki)  _callbacks.onStopHakahaki() }
      else         { if (_callbacks.onStartHakahaki) _callbacks.onStartHakahaki() }
    })
  }

  const input  = document.getElementById('hakahaki-sym-input')
  const addBtn = document.getElementById('hakahaki-sym-add')
  if (input && addBtn) {
    const _add = () => {
      const sym = input.value.trim().toUpperCase()
      if (!sym) return
      if (_callbacks.onHakahakiAdd) _callbacks.onHakahakiAdd(sym)
      input.value = ''
      input.focus()
    }
    addBtn.addEventListener('click', _add)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') _add() })
  }

  const clearBtn = document.getElementById('hakahaki-btn-clear')
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (_callbacks.onClearAlerts) _callbacks.onClearAlerts('hakahaki')
    })
  }
}

// ============================================================
// SEKSI 8: RENDER ALL — render ulang semua komponen
// ============================================================

/**
 * Render semua komponen sekaligus.
 * Dipanggil koordinator saat pertama load atau setelah data berubah besar.
 */
export function renderAll() {
  _renderTabActive()
  renderThreshold()
  renderHakaWatchlist()
  renderHakaAlerts()
  renderHakahakiWatchlist()
  renderHakahakiAlerts()
  renderIep()
}

// ============================================================
// SEKSI 9: HELPER FORMAT — internal
// ============================================================

function _fmtPrice(v) {
  if (v === null || v === undefined) return '–'
  return new Intl.NumberFormat('id-ID').format(Math.round(v))
}

function _fmtRp(v) {
  if (v === null || v === undefined) return '–'
  const abs = Math.abs(v)
  if (abs >= 1e9)  return (v / 1e9).toFixed(1) + ' M'
  if (abs >= 1e6)  return (v / 1e6).toFixed(0) + ' jt'
  return new Intl.NumberFormat('id-ID').format(Math.round(v))
}

function _fmtVol(v) {
  if (v === null || v === undefined) return '–'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' jt lot'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + ' rb lot'
  return v + ' lot'
}

function _fmtLot(v) {
  if (v === null || v === undefined) return '–'
  return new Intl.NumberFormat('id-ID').format(Math.round(Math.abs(v)))
}

function _emptyState(msg) {
  return `<div class="empty-state">${msg}</div>`
}

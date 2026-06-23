/**
 * shared/fetch-progress.js
 * ===========================
 * Progress bar + log feed scroll, dipakai bersama oleh fitur yang fetch data
 * dalam jumlah banyak (Win Rate Scanner, Ranking Emiten, dst).
 *
 * SENGAJA meniru PERSIS perilaku _setProgress()/_log() di ihsg-lab.html:
 *   - Progress bar % + label "step · done/total"
 *   - Log feed scroll, tiap baris timestamped & berwarna per tipe (ok/err/warn/info)
 *   - Panel disembunyikan total kalau tidak sedang fetch
 *
 * Cara pakai (container HARUS punya class "progress-wrap" + style hidden default):
 *   import { showProgress, hideProgress, setProgress, logProgress } from '../../shared/fetch-progress.js'
 *   const el = document.getElementById('progress-wrap')
 *   showProgress(el)
 *   setProgress(el, 2, 10, 'BBCA')
 *   logProgress(el, 'BBCA: 12 hari diambil', 'ok')
 *   hideProgress(el)
 */

function _ensureRendered(container) {
  if (container.dataset.fpInit) return
  container.innerHTML = `
    <div class="fp-title">
      <span class="fp-label" data-role="label">Memuat...</span>
      <span class="fp-pct" data-role="pct">0%</span>
    </div>
    <div class="fp-bar"><div class="fp-fill" data-role="fill" style="width:0%"></div></div>
    <div class="fp-log" data-role="log"></div>
  `
  container.dataset.fpInit = '1'
}

/** Tampilkan panel progress, reset log & progress ke 0%. */
export function showProgress(container) {
  _ensureRendered(container)
  container.classList.remove('hidden')
  container.querySelector('[data-role="log"]').innerHTML = ''
  setProgress(container, 0, 1, 'Memuat...')
}

/** Sembunyikan panel progress total (dipanggil setelah selesai/gagal). */
export function hideProgress(container) {
  container.classList.add('hidden')
}

/** Update progress bar % + label "label · done/total". */
export function setProgress(container, done, total, label) {
  _ensureRendered(container)
  const pct = total > 0 ? Math.round(done / total * 100) : 0
  container.querySelector('[data-role="fill"]').style.width = pct + '%'
  container.querySelector('[data-role="pct"]').textContent = pct + '%'
  container.querySelector('[data-role="label"]').textContent = `${label} · ${done}/${total}`
}

/**
 * Tambah 1 baris log timestamped ke feed (auto-scroll ke bawah).
 * @param {string} type - 'ok'|'err'|'warn'|'info'
 */
export function logProgress(container, msg, type = 'info') {
  _ensureRendered(container)
  const el = container.querySelector('[data-role="log"]')
  const div = document.createElement('div')
  div.className = `fp-log-${type}`
  div.textContent = `[${new Date().toLocaleTimeString('id-ID')}] ${msg}`
  el.appendChild(div)
  el.scrollTop = el.scrollHeight
}

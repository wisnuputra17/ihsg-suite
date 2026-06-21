/**
 * shared/symsearch.js
 * ====================
 * Search saham + dropdown saran — dipakai semua fitur yang punya input saham
 * (Chart, Broker Analyzer, dst). Sebelum ini, logic ini di-copy-paste persis
 * sama di tiap file; sekarang 1 sumber kebenaran.
 *
 * HTML yang dibutuhkan (struktur & class HARUS sama, CSS ada di tiap fitur
 * karena style spesifik tata letak beda-beda, tapi struktur DOM-nya sama):
 *   <div class="sym-search">
 *     <span class="sym-search-icon">⌕</span>
 *     <input type="text" id="sym-input" placeholder="cari saham..." maxlength="10" autocomplete="off">
 *     <div class="sym-dropdown hidden" id="sym-dropdown"></div>
 *   </div>
 *
 * Cara pakai:
 *   import { bindSymSearch } from '../../shared/symsearch.js'
 *   bindSymSearch(
 *     document.getElementById('sym-input'),
 *     document.getElementById('sym-dropdown'),
 *     (code) => _loadSym(code)   // dipanggil saat Enter / klik salah satu saran
 *   )
 */

import { EMITEN_INFO } from './store.js'

export function bindSymSearch(inputEl, dropdownEl, onSelect) {
  inputEl.addEventListener('input', () => _render(inputEl.value.trim()))
  inputEl.addEventListener('focus', () => { if (inputEl.value.trim()) _render(inputEl.value.trim()) })
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { dropdownEl.classList.add('hidden'); onSelect(inputEl.value.trim().toUpperCase()) }
    if (e.key === 'Escape') dropdownEl.classList.add('hidden')
  })
  document.addEventListener('click', e => {
    if (!dropdownEl.contains(e.target) && e.target !== inputEl) dropdownEl.classList.add('hidden')
  })

  function _render(query) {
    if (!query) { dropdownEl.classList.add('hidden'); return }
    const q = query.toUpperCase()
    const all = Object.entries(EMITEN_INFO)

    // Prioritas: kode yang AWALAN-nya cocok dulu, baru nama yang mengandung query
    const codeMatches = all.filter(([code]) => code.startsWith(q))
    const nameMatches  = all.filter(([code, info]) =>
      !code.startsWith(q) && info.name && info.name.toUpperCase().includes(q)
    )
    const results = [...codeMatches, ...nameMatches].slice(0, 30)

    if (!results.length) {
      dropdownEl.innerHTML = `<div class="sym-dropdown-empty">Tidak ditemukan</div>`
      dropdownEl.classList.remove('hidden')
      return
    }

    dropdownEl.innerHTML = results.map(([code, info]) => `
      <div class="sym-option" data-code="${code}">
        <span class="sym-option-code">${code}</span>
        <span class="sym-option-name">${info.name || ''}</span>
      </div>
    `).join('')
    dropdownEl.classList.remove('hidden')

    dropdownEl.querySelectorAll('.sym-option').forEach(el => {
      el.addEventListener('click', () => {
        inputEl.value = el.dataset.code
        dropdownEl.classList.add('hidden')
        onSelect(el.dataset.code)
      })
    })
  }
}

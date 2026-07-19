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

import { EMITEN_INFO, addEmiten } from './store.js'
import { fetchEmitenInfo } from './api.js'

/**
 * Pastikan 1 emiten ada di EMITEN_INFO. Kalau tidak ada (kode di luar
 * snapshot emiten.json — listing baru, dsb.), ambil info langsung dari
 * Stockbit dan merge ke store, supaya SEMUA fitur (data-collector, haka,
 * broker-analyzer, chart, ranking) langsung mengenalnya tanpa perlu
 * menunggu emiten.json diperbarui. Gagal fetch → tetap lanjut dengan
 * kode mentah (fitur-fitur memang menerima kode bebas).
 */
export async function ensureEmiten(code) {
  if (!code || EMITEN_INFO[code]) return
  try {
    const info = await fetchEmitenInfo(code)
    if (info && (info.name || info.symbol)) addEmiten(code, info)
  } catch (e) {
    console.warn('[symsearch] info emiten', code, 'tidak bisa diambil:', e.message)
  }
}

export function bindSymSearch(inputEl, dropdownEl, onSelect) {
  inputEl.addEventListener('input', () => _render(inputEl.value.trim()))
  inputEl.addEventListener('focus', () => { if (inputEl.value.trim()) _render(inputEl.value.trim()) })
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      dropdownEl.classList.add('hidden')
      const code = inputEl.value.trim().toUpperCase()
      ensureEmiten(code).then(() => onSelect(code))
    }
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
      // Kode tak dikenal ≠ jalan buntu: tawarkan pakai langsung — info
      // akan diambil dari Stockbit saat dipilih (kasus listing baru
      // yang belum masuk snapshot emiten.json: DEWA, COIN, YUPI, dst).
      const q6 = /^[A-Z0-9]{2,6}$/.test(q)
      dropdownEl.innerHTML = q6
        ? `<div class="sym-option" data-code="${q}">
             <span class="sym-option-code">${q}</span>
             <span class="sym-option-name">— tidak ada di database, pakai &amp; ambil info dari Stockbit</span>
           </div>`
        : `<div class="sym-dropdown-empty">Tidak ditemukan</div>`
      dropdownEl.classList.remove('hidden')
      if (q6) dropdownEl.querySelector('.sym-option').addEventListener('click', () => {
        inputEl.value = q
        dropdownEl.classList.add('hidden')
        ensureEmiten(q).then(() => onSelect(q))
      })
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

/**
 * Sistem tema — 4 pilihan, ditukar via atribut data-theme di <html>.
 * Pilihan disimpan di localStorage (sinkron, instan, tak perlu await IndexedDB
 * saat boot → mencegah "flash" tema default sebelum tema tersimpan termuat).
 * IndexedDB dipakai sbg cadangan lintas-sesi opsional.
 */
export const THEMES = [
  { id: 'minimalist', label: 'Minimalist', hint: 'Terminal fosfor — tenang, gelap' },
  { id: 'colorful',   label: 'Colorful',   hint: 'Warna per sektor, hangat' },
  { id: 'futuristik', label: 'Futuristik', hint: 'Cyber neon cyan-magenta' },
  { id: 'perjuangan', label: 'Perjuangan', hint: 'Merah-putih heroik, latar foto' },
]

const KEY = 'ihsg-theme'

/** Terapkan tema ke <html>. minimalist = hapus atribut (pakai :root default). */
export function applyTheme(id) {
  const valid = THEMES.some(t => t.id === id) ? id : 'minimalist'
  const root = document.documentElement
  if (valid === 'minimalist') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', valid)
  try { localStorage.setItem(KEY, valid) } catch (e) {}
  return valid
}

export function currentTheme() {
  try { return localStorage.getItem(KEY) || 'minimalist' } catch (e) { return 'minimalist' }
}

/**
 * Panggil SEDINI mungkin (sebelum render) agar tema tersimpan langsung aktif
 * tanpa flash. Aman dipanggil di <head> inline atau awal modul.
 */
export function initThemeEarly() {
  applyTheme(currentTheme())
}

/**
 * Bangun pemilih tema (dropdown kecil) di dalam container header.
 * Mengembalikan elemen agar bisa disisipkan.
 */
export function buildThemePicker() {
  const wrap = document.createElement('div')
  wrap.className = 'theme-picker'
  const cur = currentTheme()
  wrap.innerHTML = `
    <button class="theme-btn" id="theme-toggle" title="Ganti tema">
      <span class="theme-swatch" data-theme-swatch></span>
      <span id="theme-label">${THEMES.find(t => t.id === cur)?.label || 'Tema'}</span>
      <span style="opacity:.5">▾</span>
    </button>
    <div class="theme-menu hidden" id="theme-menu">
      ${THEMES.map(t => `
        <button class="theme-opt${t.id === cur ? ' active' : ''}" data-theme="${t.id}">
          <span class="theme-swatch theme-swatch-${t.id}"></span>
          <span class="theme-opt-text"><b>${t.label}</b><small>${t.hint}</small></span>
        </button>`).join('')}
    </div>`
  const toggle = wrap.querySelector('#theme-toggle')
  const menu = wrap.querySelector('#theme-menu')
  toggle.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden') })
  document.addEventListener('click', () => menu.classList.add('hidden'))
  wrap.querySelectorAll('.theme-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      const id = opt.dataset.theme
      applyTheme(id)
      wrap.querySelector('#theme-label').textContent = THEMES.find(t => t.id === id)?.label || id
      wrap.querySelectorAll('.theme-opt').forEach(o => o.classList.toggle('active', o === opt))
      menu.classList.add('hidden')
    })
  })
  return wrap
}

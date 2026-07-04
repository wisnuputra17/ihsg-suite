/**
 * shared/token.js
 * ===============
 * Satu titik masuk yang reliable untuk semua fitur yang butuh token.
 *
 * MASALAH YANG DIPECAHKAN:
 *   Sebelumnya ada 3 jalur load token yang bisa saling balapan:
 *   1. window.addEventListener('ihsg:token-saved', _start)
 *   2. window.addEventListener('load', () => { if (TOKEN.isSet()) _start() })
 *   3. if (TOKEN.isSet()) _start()  ← dipanggil sebelum module selesai parse
 *
 *   Hasilnya: kadang tidak terpanggil, kadang dipanggil 2x, kadang terlambat.
 *
 * SOLUSI:
 *   Satu fungsi onReady(fn) yang handle semua kasus:
 *   - Token sudah ada saat module load → fn() dipanggil setelah module selesai
 *   - Token belum ada → fn() disimpan, dipanggil saat token disimpan
 *   - Token disimpan user → semua pending fn() dipanggil
 *
 * CARA PAKAI (di setiap fitur):
 *   import { onReady } from '../../shared/token.js'
 *   onReady(_start)  // ← satu baris, gantikan 3 baris lama
 *
 * @module token
 */

import { TOKEN } from './store.js'

/** Daftar callback yang menunggu token ready */
const _callbacks = []

/** Apakah sudah pernah dispatch 'ready' minimal sekali */
let _ready = false

/**
 * Register callback yang dipanggil saat token tersedia dan valid.
 * - Kalau token sudah ada sekarang → callback dipanggil di tick berikutnya
 *   (setTimeout 0) agar module lain selesai parse dulu.
 * - Kalau token belum ada → callback disimpan, dipanggil saat token masuk.
 * - Aman dipanggil berkali-kali — callback tidak akan dipanggil 2x untuk
 *   satu event yang sama.
 *
 * @param {function} fn - Callback yang dipanggil saat token siap
 */
export function onReady(fn) {
  if (_ready && TOKEN.isSet()) {
    // Token sudah tersedia — panggil di tick berikutnya agar module selesai load
    setTimeout(fn, 0)
  } else {
    _callbacks.push(fn)
    // Cek sekali lagi setelah module selesai parse, kalau token sudah ada
    setTimeout(_checkAndDispatch, 0)
  }
}

/**
 * Paksa dispatch 'ready' — dipanggil oleh header.js setelah token disimpan
 * atau setelah sync Sheets selesai.
 * Tidak perlu dipanggil dari fitur lain.
 */
export function dispatchReady() {
  _ready = true
  const fns = _callbacks.splice(0) // ambil semua, kosongkan array
  fns.forEach(fn => { try { fn() } catch(e) { console.warn('[token] onReady callback error:', e) } })
}

/**
 * Cek apakah token sudah ada, kalau iya dispatch ready ke semua pending callback.
 * Dipanggil internal via setTimeout.
 */
function _checkAndDispatch() {
  if (TOKEN.isSet()) dispatchReady()
}

/**
 * Promise yang resolve saat token tersedia.
 * Berguna untuk async/await:
 *   await whenReady()
 *   const data = await fetchSomething()
 *
 * @returns {Promise<void>}
 */
export function whenReady() {
  return new Promise(resolve => onReady(resolve))
}

// Listen event lama 'ihsg:token-saved' untuk backward compatibility
// Fitur yang sudah pakai event ini tetap bekerja, tapi secara bertahap
// akan dimigrasikan ke onReady()
// Backward compat — event lama tetap bekerja (browser only)
if (typeof window !== 'undefined') {
  window.addEventListener('ihsg:token-saved', dispatchReady)
}


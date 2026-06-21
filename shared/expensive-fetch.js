/**
 * shared/expensive-fetch.js
 * ===========================
 * Pola "fetch historis MAHAL" — dipakai LPM (di Chart) dan histori broker
 * (di Broker Analyzer), dan kemungkinan fitur lain ke depan yang kena
 * keterbatasan API serupa: 1 request = 1 hari, tidak ada endpoint yang
 * kasih banyak hari sekaligus.
 *
 * Aturan: kalau jumlah hari yang belum ter-cache SEDIKIT (<= autoMax),
 * langsung fetch tanpa tanya. Kalau BANYAK, tampilkan estimasi waktu +
 * tombol konfirmasi — supaya tidak diam-diam lambat/kena rate limit, tapi
 * tetap MUNGKIN dilakukan kalau user mau menunggu (bukan diblokir keras).
 *
 * Cara pakai:
 *   import { fetchWithConfirm } from '../../shared/expensive-fetch.js'
 *   await fetchWithConfirm({
 *     missingDates: [...],
 *     statusEl: document.getElementById('status'),
 *     fetchFn: async (batch) => { ...fetch & simpan tiap tanggal di batch... },
 *     onComplete: () => _renderUlang()
 *   })
 */

export async function fetchWithConfirm({
  missingDates,
  statusEl,
  autoMax = 40,
  batchSize = 5,
  batchDelay = 400,
  fetchFn,
  onComplete
}) {
  if (!missingDates.length) { statusEl.textContent = ''; onComplete?.(); return }

  async function _runBatched(dates) {
    const batches = []
    for (let i = 0; i < dates.length; i += batchSize) batches.push(dates.slice(i, i + batchSize))
    for (const batch of batches) {
      await fetchFn(batch)
      if (batches.length > 1) await new Promise(r => setTimeout(r, batchDelay))
    }
  }

  if (missingDates.length <= autoMax) {
    statusEl.textContent = `Memuat ${missingDates.length} hari...`
    await _runBatched(missingDates)
    statusEl.textContent = ''
    onComplete?.()
    return
  }

  // Rentang besar — jangan diam-diam fetch ratusan/ribuan request, minta
  // konfirmasi dulu dengan estimasi waktu.
  const estSec = Math.ceil(missingDates.length / batchSize) * (batchDelay / 1000)
  const estTxt = estSec >= 60 ? `~${Math.ceil(estSec / 60)} menit` : `~${estSec} detik`
  statusEl.innerHTML = `${missingDates.length} hari belum ter-cache (${estTxt}, sekali saja). ` +
    `<button class="btn btn-sm btn-primary" data-role="fetch-confirm">Mulai Fetch</button>`

  statusEl.querySelector('[data-role="fetch-confirm"]').addEventListener('click', async () => {
    statusEl.textContent = 'Memuat...'
    await _runBatched(missingDates)
    statusEl.textContent = ''
    onComplete?.()
  })
}

/**
 * shared/features.js
 * ==================
 * Manifest tunggal semua fitur ihsg-suite.
 * Landing page (index.html) render daftar card dari sini — tidak ada
 * card yang ditulis manual di HTML. Tambah fitur baru = tambah 1 object
 * di array ini, tidak perlu sentuh apapun di index.html.
 *
 * @typedef {Object} Feature
 * @property {string} id     - slug, sama dengan nama folder di features/<id>/
 * @property {string} name   - nama tampil
 * @property {string} desc   - deskripsi 1 baris
 * @property {string[]} tags - kata kunci untuk search (selain name & desc)
 * @property {'ready'|'soon'} status - 'ready' = bisa diklik, 'soon' = belum bisa
 */

export const FEATURES = [
  {
    id:     'haka',
    name:   'HAKA & HAKI',
    desc:   'Monitor transaksi agresif real-time — BUY (HAKA) dan SELL (HAKI) di atas threshold.',
    tags:   ['running trade', 'akumulasi', 'distribusi', 'alert', 'monitor'],
    status: 'ready'
  },
  {
    id:     'iep-scanner',
    name:   'IEP Scanner',
    desc:   'Pindai harga & volume pre-opening (08:45–08:59) lintas saham, deteksi lonjakan volume.',
    tags:   ['pre-opening', 'pre market', 'auction', 'volume surge', 'scanner'],
    status: 'soon'
  },
  {
    id:     'lpm',
    name:   'LPM',
    desc:   'Liquidity Pressure Model — belum dispesifikasikan.',
    tags:   ['liquidity', 'likuiditas', 'pressure', 'order book'],
    status: 'soon'
  },
  {
    id:     'defence-tracker',
    name:   'Defence Tracker',
    desc:   'Catat thesis, entry, target, dan stop loss untuk posisi conviction jangka panjang.',
    tags:   ['watchlist', 'posisi', 'thesis', 'conviction', 'jangka panjang'],
    status: 'soon'
  },
  {
    id:     'cacing-watchlist',
    name:   'Cacing Watchlist',
    desc:   'Pantau saham small-cap dengan potensi katalis — backdoor listing, turnaround, akuisisi.',
    tags:   ['small cap', 'catalyst', 'naga', 'screening'],
    status: 'soon'
  },
  {
    id:     'absorption',
    name:   'Absorption',
    desc:   'Net order flow per menit dari trade book — lihat siapa menyerap di harga berapa.',
    tags:   ['order flow', 'trade book', 'net buy', 'net sell', 'intraday'],
    status: 'soon'
  },
  {
    id:     'win-rate',
    name:   'Win Rate Scanner',
    desc:   'Backtest probabilitas 27 kondisi entry pagi terhadap 9 titik exit sepanjang hari.',
    tags:   ['backtest', 'probabilitas', 'scalping', 'kondisi entry'],
    status: 'soon'
  }
]

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
    id:     'intraday-trading',
    name:   'Intraday Trading',
    desc:   'Monitor real-time IEP → ORB → Exit untuk RAJA dan MBMA — checklist per emiten dengan parameter formula tervalidasi dan alert suara.',
    tags:   ['intraday', 'ORB', 'IEP', 'alert', 'monitor', 'raja', 'mbma', 'real-time', 'sinyal'],
    status: 'ready'
  },
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
    id:     'chart',
    name:   'Chart',
    desc:   'Candlestick harian dengan indikator pilihan — MA, RSI, MACD, Bollinger, Volume, LPM.',
    tags:   ['candlestick', 'indikator', 'teknikal', 'ma', 'rsi', 'macd', 'bollinger', 'lpm', 'liquidity pressure'],
    status: 'ready'
  },
  {
    id:     'broker-analyzer',
    name:   'Broker Analyzer',
    desc:   'Bandingkan pergerakan net akumulasi beberapa broker sekaligus — pilih dari top 10 buyer/seller.',
    tags:   ['broker', 'akumulasi', 'distribusi', 'top buyer', 'top seller', 'kumulatif'],
    status: 'ready'
  },
  {
    id:     'analisa-scalping',
    name:   'Analisa Scalping',
    desc:   'Backtest intraday ORB — konfigurasi filter IEP, volume, RSI, trend, entry/exit timing. Return/tahun compounded setelah fee.',
    tags:   ['backtest', 'scalping', 'orb', 'iep', 'volume', 'probabilitas', 'intraday'],
    status: 'ready'
  },
  {
    id:     'ranking-emiten',
    name:   'Ranking Emiten',
    desc:   'Ranking saham berdasarkan win rate terbaik — 16 kondisi (IEP surge, gap, RSI, IHSG, dst) x 9 exit time.',
    tags:   ['ranking', 'win rate', 'backtest', 'ihsg', 'iep surge', 'scalping'],
    status: 'ready'
  },
  {
    id:     'data-collector',
    name:   'Data Collector',
    desc:   'Kumpulkan OHLC, RSI, MACD, MA, Volume, Broker, dan LPM 1 emiten dalam 1 file untuk dianalisa.',
    tags:   ['export', 'data', 'analisa', 'broker', 'lpm', 'rsi', 'macd', 'moving average'],
    status: 'ready'
  },
  {
    id:     'fokus-emiten',
    name:   'Fokus Emiten',
    desc:   'Chart dengan indikator BUY/SELL hasil formula tervalidasi per emiten — dimulai dari Kunci RAJA.',
    tags:   ['chart', 'indikator', 'sinyal', 'entry', 'exit', 'raja', 'formula'],
    status: 'ready'
  }
]


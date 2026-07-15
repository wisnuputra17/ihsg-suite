// features/intraday-trading/config.js
// ============================================================
// Konfigurasi emiten untuk scalping pagi
// Edit file ini untuk tambah/ubah emiten — tidak perlu edit index.html
// ============================================================

// Fee per round-trip (%):
//   DAY_TRADE = Mirae Day Trade (0.08 beli + 0.18 jual) — HANYA LQ-45 & intraday
//   REGULER   = akun reguler (0.15 + 0.25) — untuk overnight (BSJP) / non-LQ45
export const FEE_DAY_TRADE = 0.26
export const FEE_REGULER   = 0.40

export const EMITEN_CONFIG = [
  {
    sym: 'RAJA',
    name: 'Rukun Raharja',
    gap_threshold: 0.5,
    orb_deadline: '09:15',
    exit_up: '10:00',
    exit_down: '09:15',
    exit_avoid: '09:15',
    sl_up: 0.5,    // stop loss 0.5% untuk GAP UP
    sl_down: 0.3,  // stop loss 0.3% untuk GAP DOWN
    ret_yr: '+237.8%',
    mdd: '5.3%',
    stats: {
      up:   { wlb: '72.7%', avg: '+2.83%', win: '85.4%', exit: '10:00' },
      down: { wlb: '78.5%', avg: '+2.80%', win: '100%',  exit: '09:15' },
    }
  },
  {
    sym: 'MBMA',
    name: 'Merdeka Battery Materials',
    gap_threshold: 1.5,
    orb_deadline: '09:31',
    exit_up: '09:30',
    exit_down: '09:30',
    exit_avoid: '09:15',
    sl_up: 0.3,    // stop loss 0.3% — tanpa SL return -10.2%, dengan SL +133.3%
    sl_down: 0.3,
    ret_yr: '+133.3%',
    mdd: '32.5%',
    stats: {
      up:   { wlb: '68.5%', avg: '+2.59%', win: '85.7%', exit: '09:30' },
      down: { wlb: '75.7%', avg: '+2.29%', win: '100%',  exit: '09:30' },
    }
  },
  {
    sym: 'TPIA',
    name: 'Chandra Asri Pacific',
    mode: 'trailing',       // mode khusus — tanpa filter gap
    entry_mode: 'iep',      // entry di harga IEP (08:45-08:59), bukan open 09:00
    gap_threshold: 0,       // semua gap masuk
    orb_deadline: '09:31',  // deadline ORB
    exit_avoid: '09:31',    // tidak ada ORB → exit jam 09:31
    exit_orb: '15:50',      // ada ORB → hold sampai 15:50 atau trailing
    trail_pct: 10,          // trailing stop 10% dari highest
    ret_yr: '+192.5%',
    mdd: '7.1%',
    stats: {
      all: { wlb: '–', win: '83%', avg: '+6.22%', exit: '15:50', trail: '10%', note: 'n=12, 24hr observasi' }
    }
  }
]

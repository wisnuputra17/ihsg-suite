/**
 * shared/monitor.js
 * =================
 * Module generik untuk monitor intraday per emiten.
 * Config-driven — satu implementasi untuk semua emiten.
 *
 * Cara pakai:
 *   import { EmitenMonitor, playAlert } from '../../shared/monitor.js'
 *
 *   const monitor = new EmitenMonitor({
 *     sym:           'RAJA',
 *     gap_threshold: 0.5,    // ±0.5%
 *     orb_deadline:  '09:15',
 *     exit_up:       '10:00',
 *     exit_down:     '09:15',
 *     exit_avoid:    '09:15',
 *     onData:  (data) => renderCard(data),   // callback saat data tersedia
 *     onAlert: (type) => playAlert(type),    // callback saat ada alert
 *   })
 *
 *   monitor.start()   // mulai polling
 *   monitor.stop()    // hentikan polling
 *   monitor.fetch()   // fetch sekali manual
 *
 * @module monitor
 */

import { TOKEN }                    from './store.js'
import { fetchIntraday, fetchDaily } from './api.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Waktu WIB sekarang dalam format HH:MM */
export function wibTime() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(11, 16)
}

/** Apakah sekarang dalam jam bursa (08:45–16:00 WIB, hari kerja) */
export function isMarketHours() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000)
  const day = wib.getUTCDay()
  if (day === 0 || day === 6) return false
  const tot = wib.getUTCHours() * 60 + wib.getUTCMinutes()
  return tot >= 8 * 60 + 45 && tot < 16 * 60
}

/** Apakah perlu fetch setelah pasar tutup (setelah deadline ORB, hari kerja) */
export function shouldFetchAfterMarket(orb_deadline = '09:15') {
  const wib = new Date(Date.now() + 7 * 3600 * 1000)
  const day = wib.getUTCDay()
  if (day === 0 || day === 6) return false
  const t = wibTime()
  // Ambil jam:menit dari deadline, hitung dalam menit
  const [dh, dm] = orb_deadline.split(':').map(Number)
  const tot = wib.getUTCHours() * 60 + wib.getUTCMinutes()
  return tot >= dh * 60 + dm
}

// ── Alert Suara ───────────────────────────────────────────────────────────────

/**
 * Mainkan alert suara.
 * @param {'iep_confirmed'|'orb_up'|'avoid'} type
 */
export function playAlert(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const patterns = {
      iep_confirmed: [{ f: 520, d: 0.12, t: 0 }, { f: 650, d: 0.15, t: 0.15 }],
      orb_up:        [{ f: 440, d: 0.12, t: 0 }, { f: 550, d: 0.12, t: 0.14 }, { f: 660, d: 0.22, t: 0.28 }],
      avoid:         [{ f: 440, d: 0.18, t: 0 }, { f: 330, d: 0.28, t: 0.20 }],
    }
    ;(patterns[type] || []).forEach(({ f, d, t }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = f
      osc.type = type === 'avoid' ? 'sawtooth' : 'sine'
      gain.gain.setValueAtTime(0, ctx.currentTime + t)
      gain.gain.linearRampToValueAtTime(0.20, ctx.currentTime + t + 0.01)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + t + d)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + d + 0.05)
    })
  } catch (e) { /* AudioContext tidak tersedia */ }
}

// ── EmitenMonitor ─────────────────────────────────────────────────────────────

// ── Render Generik ────────────────────────────────────────────────────────────

/**
 * Render card monitor intraday ke DOM.
 * Semua ID elemen menggunakan prefix yang diberikan.
 *
 * Skema ID yang dipakai (prefix = 'raja' → ID = 'raja-iep-price', dll):
 *   {prefix}-iep-price, {prefix}-iep-gap, {prefix}-iep-vol
 *   {prefix}-open-price, {prefix}-orb-high, {prefix}-orb-low
 *   {prefix}-step-iep, {prefix}-step-entry, {prefix}-step-orb, {prefix}-step-exit
 *   {prefix}-icon-iep, {prefix}-icon-entry, {prefix}-icon-orb, {prefix}-icon-exit
 *   {prefix}-signal-box, {prefix}-signal-box-title, {prefix}-signal-box-sub
 *   {prefix}-exit-title, {prefix}-exit-msg
 *   {prefix}-step-result, {prefix}-step-result-divider
 *   {prefix}-result-entry, {prefix}-result-exit, {prefix}-result-ret, {prefix}-result-type, {prefix}-icon-result
 *   {prefix}-refresh-time
 *   {prefix}-enter-btn (opsional)
 *
 * @param {string} prefix - Prefix ID elemen, misal 'raja' atau 'mbma'
 * @param {object|null} d - Data dari EmitenMonitor._compute(), atau null
 */
export function renderMonitorCard(prefix, d) {
  const $ = id => document.getElementById(`${prefix}-${id}`)
  const $v = (id, val) => { const el = $(id); if (el) el.textContent = val ?? '–' }
  const fmt    = v => v ? v.toLocaleString('id-ID') : '–'
  const fmtVol = v => v ? (v >= 1e6 ? (v/1e6).toFixed(1)+'jt' : (v/1000).toFixed(0)+'rb') : '–'

  function setStep(id, state, icon) {
    const el = $(`step-${id}`)
    if (el) el.className = 'checklist-step ' + state
    const ic = $(`icon-${id}`)
    if (ic) ic.textContent = icon
  }

  function setSignalBox(type, title, sub) {
    const box = $('signal-box')
    if (!box) return
    if (!type) { box.style.display = 'none'; return }
    box.style.display = ''
    box.className = 'signal-box ' + type
    $v('signal-box-title', title)
    $v('signal-box-sub', sub)
  }

  const refreshEl = $('refresh-time')
  const enterBtn  = $('enter-btn')

  if (!d) {
    ;['iep','entry','orb','exit'].forEach(s => setStep(s, 'pending', '○'))
    setSignalBox(null)
    if (refreshEl) refreshEl.textContent = 'Menunggu token...'
    return
  }

  if (refreshEl) refreshEl.textContent = 'Update: ' + d.timeNow + ' WIB'

  // Isi data IEP & ORB
  $v('iep-price', fmt(d.iepPrice))
  $v('iep-vol',   fmtVol(d.iepVol))
  $v('open-price',fmt(d.openPrice))
  $v('orb-high',  fmt(d.orbHigh))
  $v('orb-low',   fmt(d.orbLow))

  // Gap label
  const gapEl = $('iep-gap')
  if (gapEl && d.gapPct != null) {
    const sign  = d.gapPct >= 0 ? '+' : ''
    let label   = sign + d.gapPct.toFixed(2) + '%'
    if      (d.gapCat === 'UP')   label += ' 🟢 GAP UP'
    else if (d.gapCat === 'DOWN') label += ' 🔵 GAP DOWN'
    else                          label += ' 🟡 STABIL'
    gapEl.textContent = label
    gapEl.className = 'monitor-val ' + (d.gapCat==='UP' ? 'up' : d.gapCat==='DOWN' ? 'warn' : '')
  }

  const exitTitle = $('exit-title')
  const exitMsg   = $('exit-msg')
  const s = d.orbStatus
  const { gap_threshold, orb_deadline } = d.cfg

  if (s === 'skip') {
    setStep('iep','avoid','⚪'); setStep('entry','pending','○')
    setStep('orb','pending','○'); setStep('exit','pending','○')
    if (exitTitle) exitTitle.textContent = 'SKIP — IEP Stabil'
    if (exitMsg)   exitMsg.innerHTML = `<span style="color:var(--ghost)">Gap ±${gap_threshold}% — tidak trading hari ini</span>`
    if (enterBtn)  enterBtn.classList.add('hidden')
    setSignalBox(null)

  } else if (s === 'pre_iep') {
    ;['iep','entry','orb','exit'].forEach(s => setStep(s,'pending','○'))
    if (exitTitle) exitTitle.textContent = 'Exit'
    if (exitMsg)   exitMsg.textContent = '–'
    if (enterBtn)  enterBtn.classList.add('hidden')
    setSignalBox(null)

  } else if (s === 'iep_confirmed') {
    setStep('iep','active','🔔'); setStep('entry','pending','○')
    setStep('orb','pending','○'); setStep('exit','pending','○')
    const gl = d.gapCat==='UP' ? '🟢 GAP UP' : '🔵 GAP DOWN'
    if (exitTitle) exitTitle.textContent = 'Siapkan ENTRY 09:00'
    if (exitMsg)   exitMsg.innerHTML = `<span style="color:var(--live)">IEP final — ${gl} → ENTRY di Open 09:00</span>`
    if (enterBtn)  enterBtn.classList.add('hidden')
    setSignalBox('orb-wait',
      `🔔 IEP FINAL — ${gl}`,
      `Gap ${d.gapPct!=null?(d.gapPct>=0?'+':'')+d.gapPct.toFixed(2)+'%':''} → ENTRY 09:00, monitor ORB hingga ${orb_deadline}`)

  } else if (s === 'orb_forming') {
    setStep('iep','done','✓'); setStep('entry','active','⏰')
    setStep('orb','pending','○'); setStep('exit','pending','○')
    if (exitTitle) exitTitle.textContent = 'Exit'
    if (exitMsg)   exitMsg.textContent = 'ORB 09:00–09:04 terbentuk...'
    if (enterBtn)  enterBtn.classList.add('hidden')
    setSignalBox(null)

  } else if (s === 'waiting') {
    setStep('iep','done','✓'); setStep('entry','done','✓')
    setStep('orb','active','👁'); setStep('exit','pending','○')
    if (exitTitle) exitTitle.textContent = 'Menunggu ORB'
    if (exitMsg)   exitMsg.textContent = `Deadline ${orb_deadline} · belum ada breakout`
    if (enterBtn)  enterBtn.classList.add('hidden')
    setSignalBox('waiting-signal','⏳ MENUNGGU KONFIRMASI ORB',`Monitor hingga ${orb_deadline} — belum ada breakout di atas ORB High`)

  } else if (s === 'broken_up') {
    setStep('iep','done','✓'); setStep('entry','done','✓')
    setStep('orb','done','✓'); setStep('exit','active','🎯')
    const gl = d.gapCat==='UP' ? '🟢 GAP UP' : '🔵 GAP DOWN'
    if (exitTitle) exitTitle.textContent = `EXIT ${d.exitOrbTime} — ORB UP ✓`
    if (exitMsg)   exitMsg.innerHTML = `<span style="color:var(--live)">HOLD posisi · exit ${d.exitOrbTime}</span>`
    if (enterBtn)  { enterBtn.classList.remove('hidden'); enterBtn.href = `../../features/fokus-emiten/?gap=${d.gapCat}` }
    setSignalBox('orb-confirmed',`✓ ORB UP CONFIRMED — ${gl}`,`HOLD posisi · Exit jam ${d.exitOrbTime}`)

  } else if (s === 'done_avoid') {
    setStep('iep','done','✓'); setStep('entry','done','✓')
    setStep('orb','avoid','✗'); setStep('exit','avoid','⚠')
    if (exitTitle) exitTitle.textContent = `EXIT AVOID ${d.exitAvoidTime}`
    if (exitMsg)   exitMsg.innerHTML = `<span style="color:var(--down)">Tidak ada ORB breakout</span>`
    if (enterBtn)  enterBtn.classList.add('hidden')
    setSignalBox('avoid-signal','✗ AVOID — Tidak ada ORB Breakout',`EXIT di ${d.exitAvoidTime}`)
    _showResult(prefix, d, false)

  } else if (s === 'done_orb') {
    setStep('iep','done','✓'); setStep('entry','done','✓')
    setStep('orb','done','✓'); setStep('exit','done','✓')
    if (exitTitle) exitTitle.textContent = `SELESAI — Exit ${d.exitOrbTime}`
    if (exitMsg)   exitMsg.textContent = 'ORB UP terkonfirmasi'
    if (enterBtn)  enterBtn.classList.add('hidden')
    setSignalBox(null)
    _showResult(prefix, d, true)
  }
}

function _showResult(prefix, d, isOrb) {
  const $ = id => document.getElementById(`${prefix}-${id}`)
  const fmt = v => v ? v.toLocaleString('id-ID') : '–'
  const sr = $('step-result')
  const dr = $('step-result-divider')
  if (sr) sr.style.display = ''
  if (dr) dr.style.display = ''
  if (d.tradeReturn != null) {
    const sign = d.tradeReturn >= 0 ? '+' : ''
    const col  = d.tradeReturn >= 0 ? 'var(--live)' : 'var(--down)'
    const icon = d.tradeReturn >= 0 ? '📈' : '📉'
    const ic = $('icon-result'); if (ic) ic.textContent = icon
    const rt = $('result-title'); if (rt) rt.textContent = 'Hasil Trade Hari Ini'
    const re = $('result-entry'); if (re) re.textContent = fmt(d.openPrice)
    const rx = $('result-exit');  if (rx) rx.textContent = fmt(d.exitPrice)
    const rr = $('result-ret');
    if (rr) { rr.textContent = sign + d.tradeReturn.toFixed(2) + '%'; rr.style.color = col }
    const ry = $('result-type');
    if (ry) ry.textContent = isOrb ? `ORB UP → exit ${d.exitOrbTime}` : `AVOID → exit ${d.exitAvoidTime}`
  }
}

/**
 * @typedef {Object} MonitorConfig
 * @property {string}   sym           - Kode saham, misal 'RAJA'
 * @property {number}   gap_threshold - Threshold gap IEP (%), misal 0.5
 * @property {string}   orb_deadline  - Deadline ORB breakout, misal '09:15'
 * @property {string}   exit_up       - Jam exit kalau GAP UP, misal '10:00'
 * @property {string}   exit_down     - Jam exit kalau GAP DOWN, misal '09:15'
 * @property {string}   exit_avoid    - Jam exit kalau tidak ada ORB, misal '09:15'
 * @property {function} [onData]      - Callback saat data selesai dihitung (data | null)
 * @property {function} [onAlert]     - Callback saat ada alert (type: string)
 */

export class EmitenMonitor {
  /** @param {MonitorConfig} cfg */
  constructor(cfg) {
    this.cfg         = cfg
    this._timer      = null
    this._alertedKeys = {}
    this._lastData   = null
  }

  /** Mulai polling — tiap 1 menit saat jam bursa, sekali fetch setelah deadline */
  start() {
    this.stop()
    const { orb_deadline } = this.cfg

    const tick = () => {
      if (isMarketHours()) {
        this.fetch()
      } else if (shouldFetchAfterMarket(orb_deadline)) {
        this.fetch()
        // Setelah pasar tutup tidak perlu polling terus — stop timer
        this.stop()
      }
    }

    tick()
    this._timer = setInterval(tick, 60 * 1000)
  }

  /** Hentikan polling */
  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }

  /** Fetch data sekali dan panggil onData callback */
  async fetch() {
    if (!TOKEN.isSet()) {
      this.cfg.onData?.(null)
      return
    }
    try {
      const data = await this._compute()
      this._lastData = data
      this._triggerAlerts(data)
      this.cfg.onData?.(data)
    } catch (e) {
      console.warn(`[monitor:${this.cfg.sym}]`, e.message)
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  async _compute() {
    const { sym, gap_threshold, orb_deadline, exit_up, exit_down, exit_avoid } = this.cfg
    const now    = Date.now()
    const wib    = new Date(now + 7 * 3600 * 1000)
    const dateStr = wib.toISOString().slice(0, 10)
    const toTs   = Math.floor(now / 1000)
    const fromTs = Math.floor(new Date(dateStr + 'T01:00:00Z').getTime() / 1000)

    const raw = await fetchIntraday(sym, toTs, fromTs, 1)
    if (!raw || raw.length === 0) return null

    const sort = [...raw].sort((a, b) => a.unix - b.unix)

    // IEP 08:45-08:59
    const iepC     = sort.filter(c => { const t = (c.datetime||'').slice(11,16); return t >= '08:45' && t <= '08:59' })
    const iepPrice = iepC.length ? iepC[iepC.length - 1].close : null
    const iepVol   = iepC.reduce((s, c) => s + (c.volume || 0), 0)

    // Open price candle 09:00
    const open9     = sort.filter(c => (c.datetime||'').slice(11,16) === '09:00')
    const openPrice = open9.length ? open9[0].open : null

    // ORB 09:00-09:04
    const orbC    = sort.filter(c => { const t = (c.datetime||'').slice(11,16); return t >= '09:00' && t <= '09:04' })
    const orbHigh = orbC.length ? Math.max(...orbC.map(c => c.high)) : null
    const orbLow  = orbC.length ? Math.min(...orbC.map(c => c.low))  : null

    // ORB breakout — 09:05 sampai sebelum deadline
    const postOrb  = sort.filter(c => { const t = (c.datetime||'').slice(11,16); return t >= '09:05' && t < orb_deadline })
    const brokenUp = orbHigh != null && postOrb.some(c => c.close > orbHigh)

    // Prev close dari daily kemarin
    let prevClose = null
    try {
      const yesterday = new Date(wib.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
      const daily = await fetchDaily(sym, yesterday, yesterday)
      if (daily && daily.length) prevClose = daily[daily.length - 1].close
    } catch (e2) { /* tidak kritis */ }

    // Gap classification
    let gapCat = 'STABIL', gapPct = null
    if (iepPrice && prevClose) {
      gapPct = (iepPrice - prevClose) / prevClose * 100
      if      (gapPct >  gap_threshold) gapCat = 'UP'
      else if (gapPct < -gap_threshold) gapCat = 'DOWN'
    }

    // Exit time per kondisi
    const exitOrbTime   = gapCat === 'DOWN' ? exit_down : exit_up
    const exitAvoidTime = exit_avoid
    const timeNow       = wibTime()

    // State machine orbStatus
    let orbStatus, exitPrice = null, tradeReturn = null

    if (gapCat === 'STABIL' && timeNow < '09:00') {
      orbStatus = 'skip'
    } else if (timeNow < '08:58') {
      orbStatus = 'pre_iep'
    } else if (timeNow < '09:00') {
      orbStatus = gapCat === 'STABIL' ? 'skip' : 'iep_confirmed'
    } else if (timeNow < '09:05') {
      orbStatus = gapCat === 'STABIL' ? 'skip' : 'orb_forming'
    } else if (brokenUp) {
      if (timeNow >= exitOrbTime) {
        const ec = sort.filter(c => (c.datetime||'').slice(11,16) <= exitOrbTime)
        exitPrice = ec.length ? ec[ec.length - 1].close : null
        if (openPrice && exitPrice) tradeReturn = (exitPrice - openPrice) / openPrice * 100
        orbStatus = 'done_orb'
      } else {
        orbStatus = 'broken_up'
      }
    } else if (timeNow < orb_deadline) {
      orbStatus = gapCat === 'STABIL' ? 'skip' : 'waiting'
    } else {
      // Setelah deadline: done_avoid
      const ec = sort.filter(c => (c.datetime||'').slice(11,16) <= exitAvoidTime)
      exitPrice = ec.length ? ec[ec.length - 1].close : null
      if (openPrice && exitPrice) tradeReturn = (exitPrice - openPrice) / openPrice * 100
      orbStatus = 'done_avoid'
    }

    return {
      sym, dateStr, timeNow,
      iepPrice, iepVol, openPrice, prevClose,
      gapCat, gapPct, orbHigh, orbLow,
      orbStatus, brokenUp, exitOrbTime, exitAvoidTime,
      exitPrice, tradeReturn,
      cfg: this.cfg,
    }
  }

  _triggerAlerts(data) {
    if (!data) return
    const key = `${data.dateStr}_${data.sym}_${data.orbStatus}`
    if (this._alertedKeys[key]) return
    this._alertedKeys[key] = true
    if (data.orbStatus === 'iep_confirmed' && data.gapCat !== 'STABIL') this.cfg.onAlert?.('iep_confirmed')
    if (data.orbStatus === 'broken_up')  this.cfg.onAlert?.('orb_up')
    if (data.orbStatus === 'done_avoid') this.cfg.onAlert?.('avoid')
  }
}

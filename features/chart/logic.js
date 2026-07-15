// features/chart/logic.js

  import { TOKEN, has, setEmitenInfo } from '../../shared/store.js'
  import { fetchDaily, fetchAbsorption, fetchMarketStatus, fetchEmitenJson, fetchIntraday } from '../../shared/api.js'
  import { renderHeader, refreshTokenStatus, openTokenPopover, whenTokenReady } from '../../shared/header.js'
import { onReady } from '../../shared/token.js'
  import { bindSymSearch } from '../../shared/symsearch.js'
  import { fmtRp, fmtVol } from '../../shared/format.js'
  import { fetchWithConfirm } from '../../shared/expensive-fetch.js'
  import { calcSMA, calcEMA, calcRSI, calcMACD, calcBollinger, calcATR, calcSupertrend, resampleWeekly, resampleMonthly } from '../../shared/indicators.js'
  import { DB, savePrefs, loadPrefs, loadDrawings, addDrawing, removeDrawing, loadLpmCacheForSym, appendLpmCache, clearLpmCacheForSym } from './db.js'

  let _loading = false
  let chart = null
  let candleSeries = null
  let _dateToIndex = {}

  // ── TIMEFRAME STATE ──
  let _activeTf = '1D'
  const TF_CONFIG = {
    '5m':  { type:'intraday', mult:5,  batchH:7,   batches:5  },
    '15m': { type:'intraday', mult:15, batchH:7,   batches:10 },
    '30m': { type:'intraday', mult:30, batchH:720, batches:1  },
    '1h':  { type:'intraday', mult:60, batchH:720, batches:1  },
    '1D':  { type:'daily'  },
    '1W':  { type:'weekly' },
    '1M':  { type:'monthly'},
  }

  async function _fetchForTf(sym, tf) {
    const cfg = TF_CONFIG[tf]
    if (cfg.type === 'intraday') {
      const batchMs = cfg.batchH * 3600 * 1000
      const now = Date.now()
      const all = []; const seen = new Set()
      for (let b = 0; b < cfg.batches; b++) {
        const toTs   = Math.floor((now - b*batchMs)/1000)
        const fromTs = Math.floor((now - (b+1)*batchMs)/1000)
        try {
          const c = await fetchIntraday(sym, toTs, fromTs, cfg.mult)
          c.forEach(x => { if (!seen.has(x.unix)) { seen.add(x.unix); all.push(x) } })
        } catch(e) { if (e.code==='EMPTY_RESPONSE') break; throw e }
      }
      return { candles: all.sort((a,b)=>a.unix-b.unix), isIntraday: true }
    }
    const raw = await fetchDaily(sym)
    const daily = [...raw].sort((a,b) => a.date<b.date?-1:a.date>b.date?1:0)
    DB.daily = daily   // selalu simpan harian asli untuk indikator
    if (cfg.type==='weekly')  return { candles: resampleWeekly(daily),  isIntraday: false }
    if (cfg.type==='monthly') return { candles: resampleMonthly(daily), isIntraday: false }
    return { candles: daily, isIntraday: false }
  }

  // Registry indikator aktif (single-instance) — {key: {series:[], overlay:bool, legend:fn}}
  const ACTIVE = {}
  const PANE_ORDER = ['volume', 'rsi', 'macd', 'atr', 'lpm']

  // MA multi-periode — beda dari ACTIVE karena bisa lebih dari 1 sekaligus
  const MA_COLORS = ['#ece7de', '#60a5fa', '#4ade80', '#d98e2b', '#f0635c', '#a78bfa', '#fb923c', '#34d399']
  let _maPeriods = []            // [5, 10, 20, ...] urut menaik
  const _maSeries = {}           // {period: {series, values}} — dibangun ulang tiap rebuild chart
  const _maPeriodSettings = {}   // {period: {source, color}} — PERSIST lintas ganti saham (beda dari _maSeries)

  // LPM — data fetch dibagi (cache bersama), tapi render terpisah: bar (panel) & overlay (garis %)
  let _lpmBarSeries     = null // mode bar + delta on -> 1 bar (HAKA-HAKI)
  let _lpmHakaSeries    = null // mode bar + delta off -> bar HAKA (hijau, naik)
  let _lpmHakiSeries    = null // mode bar + delta off -> bar HAKI (merah, turun)
  let _lpmOverlaySeries = null // mode garis -> selalu 1 garis dominasi %

  // ============================================================
  // SETTING INDIKATOR — Length/Source/dst, gaya TradingView (1 panel,
  // tanpa tab Style/Visibility — discoped fokus ke parameter inti)
  // ============================================================
  const _indSettings = {
    ema:        { length: 20, source: 'close' },
    bollinger:  { length: 20, stddev: 2, source: 'close' },
    supertrend: { atrLength: 10, multiplier: 3 },
    rsi:        { length: 14 },
    macd:       { fast: 12, slow: 26, signal: 9 },
    atr:        { length: 14 },
    lpm:        { mode: 'bar', delta: false }
  }

  const SOURCE_OPTIONS = [
    ['close', 'Close'], ['open', 'Open'], ['high', 'High'], ['low', 'Low'],
    ['hl2', 'HL2'], ['hlc3', 'HLC3'], ['ohlc4', 'OHLC4']
  ]

  const SETTINGS_FIELDS = {
    ma:         [{ key: 'source', label: 'Source', type: 'select', options: SOURCE_OPTIONS }, { key: 'color', label: 'Warna', type: 'color' }],
    ema:        [{ key: 'length', label: 'Length', type: 'number' }, { key: 'source', label: 'Source', type: 'select', options: SOURCE_OPTIONS }],
    bollinger:  [{ key: 'length', label: 'Length', type: 'number' }, { key: 'stddev', label: 'StdDev', type: 'number', step: '0.1' }, { key: 'source', label: 'Source', type: 'select', options: SOURCE_OPTIONS }],
    supertrend: [{ key: 'atrLength', label: 'ATR Length', type: 'number' }, { key: 'multiplier', label: 'Multiplier', type: 'number', step: '0.1' }],
    rsi:        [{ key: 'length', label: 'Length', type: 'number' }],
    macd:       [{ key: 'fast', label: 'Fast', type: 'number' }, { key: 'slow', label: 'Slow', type: 'number' }, { key: 'signal', label: 'Signal', type: 'number' }],
    atr:        [{ key: 'length', label: 'Length', type: 'number' }],
    lpm:        [
      { key: 'mode',  label: 'Bentuk', type: 'select', options: [['bar', 'Bar (panel)'], ['line', 'Garis Kumulatif (overlay)']] },
      { key: 'delta', label: 'Delta (1 bar = HAKA − HAKI hari itu)', type: 'checkbox' }
    ]
  }
  const SETTINGS_LABELS = { ma: 'Moving Average', ema: 'EMA', bollinger: 'Bollinger Bands', supertrend: 'Supertrend', rsi: 'RSI', macd: 'MACD', atr: 'ATR', lpm: 'LPM' }

  let _settingsTarget = null // {type, period?} — period hanya relevan utk type='ma'

  /** Ambil array harga sesuai source terpilih (close/open/high/low/hl2/hlc3/ohlc4). */
  function _sourceArray(days, source) {
    switch (source) {
      case 'open':  return days.map(d => d.open)
      case 'high':  return days.map(d => d.high)
      case 'low':   return days.map(d => d.low)
      case 'hl2':   return days.map(d => (d.high + d.low) / 2)
      case 'hlc3':  return days.map(d => (d.high + d.low + d.close) / 3)
      case 'ohlc4': return days.map(d => (d.open + d.high + d.low + d.close) / 4)
      default:      return days.map(d => d.close)
    }
  }

  // Drawing tools state
  let _drawMode = 'cursor'         // 'cursor' | 'trendline'
  let _pendingPoint = null         // titik pertama saat menggambar trend line {time, price}
  let _selectedDrawingId = null    // id drawing yang sedang dipilih (untuk tombol hapus)
  const _drawingSeries = {}        // {drawingId: seriesObject} — referensi series native chart

  // ============================================================
  // SEKSI 1: INIT
  // ============================================================
  function init() {
    renderHeader(document.getElementById('app-header'), [
      { label: 'IHSG Suite', href: '../../index.html' },
      { label: 'Chart' }
    ])
    onReady(() => {
      if (!DB.sym) { document.getElementById('sym-input').value = 'IHSG'; _loadSym() }
    })

    // Bind timeframe buttons
    document.querySelectorAll('#tf-bar .tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tf = btn.dataset.tf
        if (tf === _activeTf) return
        _activeTf = tf
        document.querySelectorAll('#tf-bar .tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === tf))
        if (DB.sym) _loadSym()
      })
    })

    _bindDropdowns()
    _bindSettingsModal()
    _bindControls()
    _bindSymSearch()
    _bindDrawToolbar()
    _applyPrefs(loadPrefs())
    _renderMaChips()
    window.addEventListener('resize', () => { _scalePanesOnResize(); _repositionDeleteBtn() })
    _loadEmitenInfo()
    loadDrawings().then(() => { if (DB.sym) _renderDrawingsForSym() })

    // Default IHSG ditangani oleh onReady di atas
  }

  async function _loadEmitenInfo() {
    if (has.emitenInfo()) return
    try {
      const raw = await fetchEmitenJson()
      setEmitenInfo(raw)
    } catch (e) {
      console.warn('[chart] gagal load emiten.json:', e.message)
    }
  }

  function _applyPrefs(p) {
    if (Array.isArray(p.maPeriods)) _maPeriods = [...p.maPeriods].sort((a, b) => a - b)
    if (p.maPeriodSettings) Object.assign(_maPeriodSettings, p.maPeriodSettings)
    if (p.indSettings) {
      Object.keys(p.indSettings).forEach(k => { if (_indSettings[k]) Object.assign(_indSettings[k], p.indSettings[k]) })
    }
    if (p.ema)         document.getElementById('ind-ema').checked = true
    if (p.bollinger)   document.getElementById('ind-bollinger').checked = true
    if (p.supertrend)  document.getElementById('ind-supertrend').checked = true
    if (p.lpm)         document.getElementById('ind-lpm').checked = true
    if (p.volume !== undefined) document.getElementById('ind-volume').checked = p.volume
    if (p.rsi)         document.getElementById('ind-rsi').checked = true
    if (p.macd)        document.getElementById('ind-macd').checked = true
    if (p.atr)         document.getElementById('ind-atr').checked = true
  }

  function _savePrefsNow() {
    savePrefs({
      maPeriods: _maPeriods,
      maPeriodSettings: _maPeriodSettings,
      indSettings: _indSettings,
      ema: document.getElementById('ind-ema').checked,
      bollinger: document.getElementById('ind-bollinger').checked,
      supertrend: document.getElementById('ind-supertrend').checked,
      volume: document.getElementById('ind-volume').checked,
      rsi: document.getElementById('ind-rsi').checked,
      macd: document.getElementById('ind-macd').checked,
      atr: document.getElementById('ind-atr').checked,
      lpm: document.getElementById('ind-lpm').checked
    })
  }

  // ============================================================
  // SEKSI 3: DROPDOWN INDICATORS — buka/tutup, klik luar menutup
  // ============================================================
  function _bindDropdowns() {
    const btn   = document.getElementById('btn-indicators')
    const panel = document.getElementById('ind-dropdown')
    btn.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('hidden') })
    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && e.target !== btn) panel.classList.add('hidden')
    })
  }

  // ============================================================
  // SEKSI 3c: MODAL SETTING INDIKATOR
  // ============================================================
  function _bindSettingsModal() {
    document.querySelectorAll('.ind-gear[data-settings]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); _openSettings(btn.dataset.settings) })
    })
    document.getElementById('ind-settings-close').addEventListener('click', _closeSettings)
    document.getElementById('ind-settings-cancel').addEventListener('click', _closeSettings)
    document.getElementById('ind-settings-ok').addEventListener('click', _applySettings)
    document.getElementById('ind-settings-overlay').addEventListener('click', e => {
      if (e.target.id === 'ind-settings-overlay') _closeSettings()
    })
  }

  /** Buka modal setting untuk 1 indikator. period hanya dipakai utk type='ma'. */
  function _openSettings(type, period) {
    _settingsTarget = { type, period }
    const fields  = SETTINGS_FIELDS[type]
    const current = type === 'ma' ? (_maPeriodSettings[period] || {}) : _indSettings[type]

    document.getElementById('ind-settings-title').textContent =
      type === 'ma' ? `Moving Average — MA${period}` : SETTINGS_LABELS[type]

    document.getElementById('ind-settings-body').innerHTML = fields.map(f => {
      const val = current[f.key] ?? ''
      if (f.type === 'select') {
        return `<div class="ind-settings-field"><label>${f.label}</label>
          <select id="set-${f.key}">${f.options.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>`
      }
      if (f.type === 'color') {
        return `<div class="ind-settings-field"><label>${f.label}</label><input type="color" id="set-${f.key}" value="${val || '#d98e2b'}"></div>`
      }
      if (f.type === 'checkbox') {
        return `<div class="ind-settings-field" style="flex-direction:row; align-items:center; gap:8px;">
          <input type="checkbox" id="set-${f.key}" ${val ? 'checked' : ''} style="width:auto;"><label style="text-transform:none; font-size:11px;">${f.label}</label>
        </div>`
      }
      return `<div class="ind-settings-field"><label>${f.label}</label><input type="number" id="set-${f.key}" value="${val}" step="${f.step || 1}"></div>`
    }).join('')

    document.getElementById('ind-settings-overlay').classList.remove('hidden')
  }

  function _closeSettings() {
    document.getElementById('ind-settings-overlay').classList.add('hidden')
    _settingsTarget = null
  }

  /** Terapkan setting dari modal — update state, simpan prefs, render ulang kalau sedang aktif. */
  function _applySettings() {
    if (!_settingsTarget) return
    const { type, period } = _settingsTarget
    const fields = SETTINGS_FIELDS[type]
    const values = {}
    fields.forEach(f => {
      const el = document.getElementById(`set-${f.key}`)
      if (f.type === 'checkbox')   values[f.key] = el.checked
      else if (f.type === 'number') values[f.key] = parseFloat(el.value)
      else                          values[f.key] = el.value
    })

    if (type === 'ma') {
      _maPeriodSettings[period] = { ..._maPeriodSettings[period], ...values }
      _savePrefsNow()
      _closeSettings()
      if (_maSeries[period]) { try { chart.removeSeries(_maSeries[period].series) } catch (_) {} delete _maSeries[period] }
      if (DB.daily.length) _createMaSeries(period)
      _renderMaChips()
    } else if (type === 'lpm') {
      // LPM bukan bagian registry ACTIVE — render manual, bukan lewat _addIndicator/_removeIndicator
      Object.assign(_indSettings.lpm, values)
      _savePrefsNow()
      _closeSettings()
      _renderLpmFromCache()
    } else {
      Object.assign(_indSettings[type], values)
      _savePrefsNow()
      _closeSettings()
      if (ACTIVE[type]) { _removeIndicator(type); _addIndicator(type) }
    }
  }

  // ============================================================
  // SEKSI 3b: SEARCH SAHAM — dropdown saran, scrollable, tetap bisa mengetik
  // ============================================================
  function _bindSymSearch() {
    bindSymSearch(
      document.getElementById('sym-input'),
      document.getElementById('sym-dropdown'),
      () => _loadSym()
    )
  }

  // ============================================================
  // SEKSI 4: CONTROLS
  // ============================================================
  function _bindControls() {
    // MA — multi periode, tambah via input+tombol, hapus via × di chip
    document.getElementById('ma-add-btn').addEventListener('click', () => {
      const period = parseInt(document.getElementById('ma-period-input').value)
      if (!period || period < 2) return
      _addMA(period)
    })
    document.getElementById('ma-period-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('ma-add-btn').click()
    })

    document.getElementById('ind-ema').addEventListener('change', e => _toggleIndicator('ema', e.target.checked))
    document.getElementById('ind-bollinger').addEventListener('change', e => _toggleIndicator('bollinger', e.target.checked))
    document.getElementById('ind-supertrend').addEventListener('change', e => _toggleIndicator('supertrend', e.target.checked))
    document.getElementById('ind-volume').addEventListener('change', e => _toggleIndicator('volume', e.target.checked))
    document.getElementById('ind-rsi').addEventListener('change', e => _toggleIndicator('rsi', e.target.checked))
    document.getElementById('ind-macd').addEventListener('change', e => _toggleIndicator('macd', e.target.checked))
    document.getElementById('ind-atr').addEventListener('change', e => _toggleIndicator('atr', e.target.checked))

    // LPM — 1 checkbox, mode (bar/garis) & delta diatur lewat gear settings
    document.getElementById('ind-lpm').addEventListener('change', () => { _savePrefsNow(); _updateLpmForVisibleRange() })

    document.getElementById('ind-orb').addEventListener('change', e => {
      if (e.target.checked) {
        _loadOrb()
      } else {
        _removeOrbLines()
        document.getElementById('orb-status').textContent = ''
      }
    })
  }

  function _toggleIndicator(key, checked) {
    _savePrefsNow()
    if (!DB.daily.length) return
    if (checked) _addIndicator(key)
    else         _removeIndicator(key)
  }

  // ============================================================
  // SEKSI 4b: MA MULTI-PERIODE
  // ============================================================

  function _maColorFor(period) {
    if (_maPeriodSettings[period]?.color) return _maPeriodSettings[period].color
    const idx = _maPeriods.indexOf(period)
    return MA_COLORS[idx >= 0 ? idx % MA_COLORS.length : 0]
  }

  function _addMA(period) {
    _maPeriods = _maPeriods.filter(p => p !== period)
    _maPeriods.push(period)
    _maPeriods.sort((a, b) => a - b)
    if (!_maPeriodSettings[period]) _maPeriodSettings[period] = { source: 'close', color: _maColorFor(period) }
    _savePrefsNow()
    _renderMaChips()
    if (DB.daily.length) _createMaSeries(period)
  }

  function _removeMA(period) {
    _maPeriods = _maPeriods.filter(p => p !== period)
    delete _maPeriodSettings[period]
    const entry = _maSeries[period]
    if (entry) { try { chart.removeSeries(entry.series) } catch (_) {} delete _maSeries[period] }
    _savePrefsNow()
    _renderMaChips()
  }

  function _createMaSeries(period) {
    if (_maSeries[period] || !chart) return
    const settings = _maPeriodSettings[period] || { source: 'close', color: _maColorFor(period) }
    const src = _sourceArray(DB.daily, settings.source)
    const ma  = calcSMA(src, period)
    const s = chart.addSeries(LightweightCharts.LineSeries, {
      color: settings.color, lineWidth: 1.5, priceLineVisible: true, lastValueVisible: true, title: 'MA' + period
    })
    s.setData(_align(DB.daily, ma))
    _maSeries[period] = { series: s, values: ma }
    _renderMaChips()
  }

  function _renderMaChips() {
    const row = document.getElementById('ma-chip-row')
    row.innerHTML = _maPeriods.map(p => {
      const color = _maColorFor(p)
      return `<span class="chip" style="border-color:${color}66; color:${color}">MA${p}
        <button class="ma-chip-gear" data-period="${p}" title="Setting">⚙</button>
        <button class="chip-remove" data-period="${p}">×</button>
      </span>`
    }).join('')
    row.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', () => _removeMA(parseInt(btn.dataset.period)))
    })
    row.querySelectorAll('.ma-chip-gear').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); _openSettings('ma', parseInt(btn.dataset.period)) })
    })
  }

  // ============================================================
  // SEKSI 5: LOAD DAILY
  // ============================================================
  async function _loadSym() {
    if (_loading) return
    const sym = document.getElementById('sym-input').value.trim().toUpperCase()
    const status = document.getElementById('status')
    if (!sym) return
    await whenTokenReady()
    if (!TOKEN.isSet()) { openTokenPopover(); return }

    _loading = true
    status.textContent = 'Memuat...'

    try {
      const { candles, isIntraday } = await _fetchForTf(sym, _activeTf)
      DB.sym = sym
      if (!isIntraday) DB.daily = candles  // hanya update DB.daily jika bukan intraday resampled
      DB.candles = candles
      DB.lpmCache = {}
      status.textContent = ''
      document.getElementById('sym-input').value = sym
      _rebuildChart()
      if (_activeTf === '1D') {
        loadLpmCacheForSym(sym).then(() => { if (DB.sym === sym) _updateLpmForVisibleRange() })
        if (document.getElementById('ind-orb').checked) _loadOrb()
      }
    } catch (e) {
      status.textContent = e.code === 'TOKEN_EXPIRED' ? 'Token expired' : 'Error: ' + e.message
      if (e.code === 'TOKEN_EXPIRED') { TOKEN.clear(); refreshTokenStatus() }
    } finally {
      _loading = false
    }
  }

  // ============================================================
  // SEKSI 6: CHART — 1 instance, banyak pane
  // ============================================================
  function _rebuildChart() {
    if (chart) { chart.remove(); chart = null }
    Object.keys(ACTIVE).forEach(k => delete ACTIVE[k])
    _lastContainerH = null

    const candles = DB.candles || DB.daily
    const isIntraday = TF_CONFIG[_activeTf]?.type === 'intraday'
    _dateToIndex = {}
    candles.forEach((d, i) => { _dateToIndex[isIntraday ? d.unix : d.date] = i })

    chart = LightweightCharts.createChart(document.getElementById('chart-main'), {
      autoSize: true,
      layout:    { background: { color: '#0a0908' }, textColor: '#6b6557' },
      grid:      { vertLines: { color: '#1a1815' }, horzLines: { color: '#1a1815' } },
      timeScale: { timeVisible: isIntraday, rightOffset: 4 }
    })

    candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: '#4ade80', downColor: '#f0635c', borderVisible: false,
      wickUpColor: '#4ade80', wickDownColor: '#f0635c'
    })
    candleSeries.setData(candles.map(d => ({
      time:  isIntraday ? d.unix : d.date,
      open: d.open, high: d.high, low: d.low, close: d.close
    })))
    ACTIVE._candle = { series: [candleSeries], overlay: true }

    // MA dan indikator lain hanya untuk Daily TF
    Object.keys(_maSeries).forEach(k => delete _maSeries[k])
    if (!isIntraday) _maPeriods.forEach(p => _createMaSeries(p))

    // Restore indikator single-instance — hanya Daily
    ;['ema','bollinger','supertrend','volume','rsi','macd','atr'].forEach(key => {
      if (document.getElementById(`ind-${key}`).checked) _addIndicator(key)
    })

    _lpmBarSeries = null
    _lpmOverlaySeries = null
    if (_activeTf === '1D') chart.timeScale().subscribeVisibleLogicalRangeChange(_debouncedLpmUpdate)

    chart.timeScale().fitContent()

    chart.subscribeCrosshairMove(param => {
      if (_pendingPoint) { _updatePreviewLine(param); return }
      const candles = DB.candles || DB.daily
      const isIntra = TF_CONFIG[_activeTf]?.type === 'intraday'
      const key = isIntra ? param.time : param.time
      const idx = key != null ? _dateToIndex[key] : candles.length - 1
      _updateInfoAndLegend(idx !== undefined ? idx : candles.length - 1)
    })

    // Klik chart → tempatkan titik trend line (mode 'trendline') atau pilih garis (mode 'cursor')
    chart.subscribeClick(param => _onChartClick(param))

    // Pan/zoom → garis trend sendiri otomatis ikut (series native chart, bukan canvas
    // manual), HANYA tombol hapus (elemen HTML terpisah) yang perlu direposisi.
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => _repositionDeleteBtn())

    // Render ulang trend line milik saham ini sebagai series native baru
    Object.keys(_drawingSeries).forEach(k => delete _drawingSeries[k]) // chart lama sudah di-remove() di atas
    _selectedDrawingId = null
    _pendingPoint = null
    document.getElementById('draw-preview-line').setAttribute('visibility', 'hidden')
    _renderDrawingsForSym()

    _updateInfoAndLegend((DB.candles || DB.daily).length - 1)
  }

  function _isSubpaneActive(key) {
    if (key === 'lpm') return document.getElementById('ind-lpm').checked && _indSettings.lpm.mode === 'bar'
    return !!ACTIVE[key]
  }

  /** Slot pane TETAP per indikator — bukan dihitung dinamis, supaya tidak konflik
   *  kalau user menyalakan indikator tidak berurutan (misal RSI dulu baru Volume). */
  function _paneIndexFor(key) {
    return PANE_ORDER.indexOf(key) + 1
  }

  function _addIndicator(key) {
    if (ACTIVE[key]) return
    const days   = DB.daily
    const closes = days.map(d => d.close)

    if (key === 'ema') {
      const { length, source } = _indSettings.ema
      const src = _sourceArray(days, source)
      const ema = calcEMA(src, length)
      const s = chart.addSeries(LightweightCharts.LineSeries, { color: '#60a5fa', lineWidth: 1.5, priceLineVisible: true, lastValueVisible: true, title: 'EMA' + length })
      s.setData(_align(days, ema))
      ACTIVE.ema = { series: [s], overlay: true, legend: idx => [{ label: 'EMA' + length, color: '#60a5fa', value: ema[idx], fmt: 'price' }] }
    }

    else if (key === 'bollinger') {
      const { length, stddev, source } = _indSettings.bollinger
      const src = _sourceArray(days, source)
      const { upper, middle, lower } = calcBollinger(src, length, stddev)
      const mid = chart.addSeries(LightweightCharts.LineSeries, { color: 'rgba(217,142,43,0.8)', lineWidth: 1, priceLineVisible: true, lastValueVisible: true, title: 'BB' })
      const up  = chart.addSeries(LightweightCharts.LineSeries, { color: 'rgba(217,142,43,0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      const lo  = chart.addSeries(LightweightCharts.LineSeries, { color: 'rgba(217,142,43,0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      mid.setData(_align(days, middle)); up.setData(_align(days, upper)); lo.setData(_align(days, lower))
      ACTIVE.bollinger = { series: [mid, up, lo], overlay: true, legend: idx => [{ label: `BB(${length},${stddev})`, color: 'rgba(217,142,43,0.8)', value: middle[idx], fmt: 'price' }] }
    }

    else if (key === 'supertrend') {
      const { atrLength, multiplier } = _indSettings.supertrend
      const { value, direction } = calcSupertrend(days, atrLength, multiplier)
      // 2 series terpisah (naik/turun) supaya warna beda per arah — gap di mana tidak relevan
      const upPts = days.map((d, i) => direction[i] === 'up'   ? { time: d.date, value: value[i] } : null).filter(Boolean)
      const dnPts = days.map((d, i) => direction[i] === 'down' ? { time: d.date, value: value[i] } : null).filter(Boolean)
      const sUp = chart.addSeries(LightweightCharts.LineSeries, { color: '#4ade80', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, title: 'ST' })
      const sDn = chart.addSeries(LightweightCharts.LineSeries, { color: '#f0635c', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false })
      sUp.setData(upPts); sDn.setData(dnPts)
      ACTIVE.supertrend = { series: [sUp, sDn], overlay: true, legend: idx => [{ label: 'Supertrend', color: direction[idx] === 'down' ? '#f0635c' : '#4ade80', value: value[idx], fmt: 'price' }] }
    }

    else if (key === 'volume') {
      const pIdx = _paneIndexFor('volume')
      const s = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: true, title: 'Vol' }, pIdx)
      s.setData(days.map(d => ({ time: d.date, value: d.volume, color: d.close >= d.open ? 'rgba(74,222,128,0.5)' : 'rgba(240,99,92,0.5)' })))
      ACTIVE.volume = { series: [s], overlay: false, legend: idx => [{ label: 'Vol', color: '#9aa0a6', value: days[idx]?.volume, fmt: 'vol' }] }
    }

    else if (key === 'rsi') {
      const { length } = _indSettings.rsi
      const pIdx = _paneIndexFor('rsi')
      const rsi = calcRSI(closes, length)
      const s = chart.addSeries(LightweightCharts.LineSeries, { color: '#ece7de', lineWidth: 1.5, priceLineVisible: true, lastValueVisible: true, title: 'RSI' }, pIdx)
      s.setData(_align(days, rsi))
      ACTIVE.rsi = { series: [s], overlay: false, legend: idx => [{ label: `RSI(${length})`, color: '#ece7de', value: rsi[idx], fmt: 'num1' }] }
    }

    else if (key === 'macd') {
      const { fast, slow, signal } = _indSettings.macd
      const pIdx = _paneIndexFor('macd')
      const { macd, signal: sig, hist } = calcMACD(closes, fast, slow, signal)
      const macdLine = chart.addSeries(LightweightCharts.LineSeries, { color: '#60a5fa', lineWidth: 1, priceLineVisible: true, lastValueVisible: true, title: 'MACD' }, pIdx)
      const sigLine  = chart.addSeries(LightweightCharts.LineSeries, { color: '#d98e2b', lineWidth: 1, priceLineVisible: true, lastValueVisible: true }, pIdx)
      const histS    = chart.addSeries(LightweightCharts.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pIdx)
      macdLine.setData(_align(days, macd)); sigLine.setData(_align(days, sig))
      histS.setData(days.map((d, i) => hist[i] !== null ? { time: d.date, value: hist[i], color: hist[i] >= 0 ? 'rgba(74,222,128,0.5)' : 'rgba(240,99,92,0.5)' } : null).filter(Boolean))
      ACTIVE.macd = { series: [macdLine, sigLine, histS], overlay: false, legend: idx => [
        { label: 'MACD', color: '#60a5fa', value: macd[idx], fmt: 'price2' },
        { label: 'Signal', color: '#d98e2b', value: sig[idx], fmt: 'price2' }
      ]}
    }

    else if (key === 'atr') {
      const { length } = _indSettings.atr
      const pIdx = _paneIndexFor('atr')
      const atr = calcATR(days, length)
      const s = chart.addSeries(LightweightCharts.LineSeries, { color: '#a78bfa', lineWidth: 1.5, priceLineVisible: true, lastValueVisible: true, title: 'ATR' }, pIdx)
      s.setData(_align(days, atr))
      ACTIVE.atr = { series: [s], overlay: false, legend: idx => [{ label: `ATR(${length})`, color: '#a78bfa', value: atr[idx], fmt: 'price2' }] }
    }

    _setPaneActiveHeight(key, true)
    if (chart) _updateInfoAndLegend((DB.candles || DB.daily).length - 1)
  }

  function _removeIndicator(key) {
    const ind = ACTIVE[key]
    if (!ind) return
    ind.series.forEach(s => { try { chart.removeSeries(s) } catch (_) {} })
    delete ACTIVE[key]
    _setPaneActiveHeight(key, false)
    if (chart && DB.daily.length) _updateInfoAndLegend(DB.daily.length - 1)
  }

  function _align(days, arr) {
    return days.map((d, i) => arr[i] !== null && arr[i] !== undefined ? { time: d.date, value: arr[i] } : null).filter(Boolean)
  }

  /**
   * Atur tinggi tiap pane. Slot pane TETAP (lihat _paneIndexFor) — pane yang
   * sedang tidak aktif diberi tinggi 0 (bukan dihapus), supaya tidak perlu
   * pindah-pindah series antar pane saat indikator dinyalakan tidak berurutan.
   */
  /**
   * Setup PROPORSI AWAL semua pane — HANYA dipanggil sekali saat chart baru
   * dibangun (_rebuildChart, ganti saham). TIDAK dipanggil ulang tiap toggle
   * indikator atau resize window — supaya kalau kamu geser manual border antar
   * pane (fitur asli lightweight-charts), itu tidak ke-reset terus.
   */
  function _layoutPanes() {
    if (!chart) return
    const panes = chart.panes()
    const containerH = document.getElementById('chart-main').clientHeight
    if (!containerH) return

    const activeKeys = PANE_ORDER.filter(_isSubpaneActive)
    const nActive = activeKeys.length
    const candleH = nActive > 0 ? Math.floor(containerH * 0.6) : containerH
    const indH    = nActive > 0 ? Math.floor((containerH - candleH) / nActive) : 0

    try { panes[0].setHeight(candleH) } catch (_) {}
    PANE_ORDER.forEach((key, i) => {
      const paneIdx = i + 1
      if (paneIdx >= panes.length) return // pane belum pernah dipakai sama sekali
      try { panes[paneIdx].setHeight(_isSubpaneActive(key) ? indH : 0) } catch (_) {}
    })
  }

  /**
   * Atur tinggi SATU pane saja — dipanggil saat 1 indikator di-toggle on/off,
   * TIDAK menyentuh pane lain (jadi tidak merusak penyesuaian manual yang
   * sudah kamu lakukan di pane lain dengan menggeser border).
   */
  function _setPaneActiveHeight(key, active) {
    if (!chart) return
    const panes = chart.panes()
    const paneIdx = PANE_ORDER.indexOf(key) + 1
    if (paneIdx < 1 || paneIdx >= panes.length) return
    if (active) {
      let current = 0
      try { current = panes[paneIdx].getHeight() } catch (_) {}
      if (!current) {
        const containerH = document.getElementById('chart-main').clientHeight || 600
        try { panes[paneIdx].setHeight(Math.floor(containerH * 0.2)) } catch (_) {}
      }
    } else {
      try { panes[paneIdx].setHeight(0) } catch (_) {}
    }
  }

  let _lastContainerH = null
  /** Saat window di-resize, skala SEMUA pane proporsional — bukan reset ke 60/40 lagi. */
  function _scalePanesOnResize() {
    if (!chart) return
    const containerH = document.getElementById('chart-main').clientHeight
    if (!containerH) return
    if (!_lastContainerH) { _lastContainerH = containerH; return }
    const ratio = containerH / _lastContainerH
    if (ratio !== 1) {
      chart.panes().forEach(p => {
        try { const h = p.getHeight(); p.setHeight(Math.round(h * ratio)) } catch (_) {}
      })
    }
    _lastContainerH = containerH
  }

  // ============================================================
  // SEKSI 6b: DRAWING TOOLS — Trend Line
  // ============================================================
  // Pendekatan (dipelajari dari implementasi lama yang sudah terbukti efisien):
  // trend line = SERIES NATIVE chart (chart.addSeries(LineSeries) dengan 2 titik
  // data), BUKAN canvas overlay yang digambar manual. Keuntungan: library urus
  // reposisi/scaling otomatis saat pan/zoom — kita tidak perlu redraw apapun.
  //
  // Hit-testing (klik untuk pilih garis) tetap pakai konversi koordinat manual
  // (timeToCoordinate/priceToCoordinate) karena LineSeries 2-titik tidak punya
  // data di tiap hari yang dilewati garisnya — jadi param.seriesData tidak bisa
  // diandalkan untuk deteksi klik di sembarang titik sepanjang garis.

  function _bindDrawToolbar() {
    document.querySelectorAll('.draw-tool[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        _drawMode = btn.dataset.tool
        _pendingPoint = null
        document.getElementById('draw-preview-line').setAttribute('visibility', 'hidden')
        document.querySelectorAll('.draw-tool[data-tool]').forEach(b => b.classList.toggle('active', b === btn))
      })
    })

    document.getElementById('draw-clear-all').addEventListener('click', () => {
      if (!DB.sym) return
      if (!confirm(`Hapus semua garis di ${DB.sym}?`)) return
      DB.drawings.filter(d => d.sym === DB.sym).forEach(d => _deleteDrawing(d.id))
    })

    document.getElementById('draw-delete-btn').addEventListener('click', () => {
      if (_selectedDrawingId) _deleteDrawing(_selectedDrawingId)
    })
  }

  /**
   * Update garis preview SVG agar ujungnya ikut posisi kursor — dipanggil tiap
   * crosshair bergerak. SENGAJA cuma setAttribute (super ringan), TIDAK sentuh
   * series/data chart sama sekali — itu yang dulu bikin lag & klik tidak terdeteksi
   * (setData() di chart asli tiap gerakan mouse terlalu berat, bikin browser
   * kewalahan sampai event klik pun salah terbaca sebagai drag).
   */
  function _updatePreviewLine(param) {
    if (!_pendingPoint || !param.point) return
    const line = document.getElementById('draw-preview-line')
    line.setAttribute('x2', param.point.x)
    line.setAttribute('y2', param.point.y)
  }

  /** Buat series native chart untuk semua drawing milik DB.sym saat ini. */
  function _renderDrawingsForSym() {
    DB.drawings.filter(d => d.sym === DB.sym).forEach(d => _createLineSeriesFor(d))
  }

  /** Buat 1 series LineSeries 2-titik untuk 1 drawing, simpan referensinya. */
  function _createLineSeriesFor(d) {
    const s = chart.addSeries(LightweightCharts.LineSeries, {
      color: '#d98e2b', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: () => null // garis trend tidak pernah pengaruhi skala harga
    })
    // Urutkan titik berdasarkan waktu — LineSeries butuh data terurut menaik
    const pts = d.t1 <= d.t2
      ? [{ time: d.t1, value: d.p1 }, { time: d.t2, value: d.p2 }]
      : [{ time: d.t2, value: d.p2 }, { time: d.t1, value: d.p1 }]
    s.setData(pts)
    _drawingSeries[d.id] = s
  }

  /** Hapus 1 drawing — dari chart (series native) + dari data (Sheets). */
  function _deleteDrawing(id) {
    const s = _drawingSeries[id]
    if (s) { try { chart.removeSeries(s) } catch (_) {} delete _drawingSeries[id] }
    removeDrawing(id)
    if (_selectedDrawingId === id) { _selectedDrawingId = null; _repositionDeleteBtn() }
  }

  /**
   * Tangani klik di chart — tergantung mode aktif:
   *   'trendline' → klik 1: simpan titik pertama. klik 2: buat garis + simpan.
   *   'cursor'    → hit-test ke garis yang ada (jarak titik-ke-segmen), pilih kalau dekat.
   */
  function _onChartClick(param) {
    if (!candleSeries || !param.point) return

    if (_drawMode === 'trendline') {
      if (!param.time) return // klik di luar area data, tidak valid
      const price = candleSeries.coordinateToPrice(param.point.y)
      if (price === null) return

      if (!_pendingPoint) {
        _pendingPoint = { time: param.time, price }
        // Tampilkan garis preview SVG — titik awal tetap (x1,y1), titik akhir
        // (x2,y2) ikut kursor langsung dari param.point (sudah pixel, tanpa konversi)
        const x1 = chart.timeScale().timeToCoordinate(param.time)
        const y1 = candleSeries.priceToCoordinate(price)
        const line = document.getElementById('draw-preview-line')
        line.setAttribute('x1', x1); line.setAttribute('y1', y1)
        line.setAttribute('x2', x1); line.setAttribute('y2', y1)
        line.setAttribute('visibility', 'visible')
        return
      }
      // Titik kedua — buat drawing baru, sembunyikan preview
      const drawing = {
        id:  Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        sym: DB.sym,
        type: 'trendline',
        t1: _pendingPoint.time, p1: _pendingPoint.price,
        t2: param.time,         p2: price
      }
      document.getElementById('draw-preview-line').setAttribute('visibility', 'hidden')
      addDrawing(drawing)           // simpan data + sinkron Sheets (1x saja, bukan per-frame)
      _createLineSeriesFor(drawing) // render permanen (1x saja, bukan per-frame)
      _pendingPoint = null

      // Balik ke mode cursor otomatis setelah selesai 1 garis
      _drawMode = 'cursor'
      document.querySelectorAll('.draw-tool[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'cursor'))
      return
    }

    // Mode cursor — hit-test pilih garis terdekat
    const mine = DB.drawings.filter(d => d.sym === DB.sym)
    let closest = null, closestDist = 8 // px toleransi klik

    mine.forEach(d => {
      const x1 = chart.timeScale().timeToCoordinate(d.t1)
      const y1 = candleSeries.priceToCoordinate(d.p1)
      const x2 = chart.timeScale().timeToCoordinate(d.t2)
      const y2 = candleSeries.priceToCoordinate(d.p2)
      if (x1 === null || y1 === null || x2 === null || y2 === null) return
      const dist = _distToSegment(param.point.x, param.point.y, x1, y1, x2, y2)
      if (dist < closestDist) { closestDist = dist; closest = d.id }
    })

    _setSelectedDrawing(closest)
  }

  /** Pilih/batalkan pilih 1 drawing — ubah warna series-nya jadi terang, posisikan tombol hapus. */
  function _setSelectedDrawing(id) {
    // Kembalikan warna default ke selection lama (kalau ada)
    if (_selectedDrawingId && _drawingSeries[_selectedDrawingId]) {
      try { _drawingSeries[_selectedDrawingId].applyOptions({ color: '#d98e2b', lineWidth: 1.5 }) } catch (_) {}
    }
    _selectedDrawingId = id
    if (id && _drawingSeries[id]) {
      try { _drawingSeries[id].applyOptions({ color: '#ece7de', lineWidth: 2 }) } catch (_) {}
    }
    _repositionDeleteBtn()
  }

  /** Jarak titik (px,py) ke segmen garis (x1,y1)-(x2,y2) — untuk hit-test klik. */
  function _distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1
    const lenSq = dx * dx + dy * dy
    let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0
    t = Math.max(0, Math.min(1, t))
    const cx = x1 + t * dx, cy = y1 + t * dy
    return Math.hypot(px - cx, py - cy)
  }

  /**
   * Posisikan ulang tombol hapus (elemen HTML, bukan bagian dari chart) sesuai
   * posisi garis yang sedang dipilih saat ini. Dipanggil setelah memilih, dan
   * tiap pan/zoom (karena posisi pixel garis berubah, walau garisnya sendiri
   * sudah otomatis ikut tanpa kita lakukan apapun).
   */
  function _repositionDeleteBtn() {
    const btn = document.getElementById('draw-delete-btn')
    const d = DB.drawings.find(x => x.id === _selectedDrawingId)
    if (!d || !chart || !candleSeries) { btn.style.display = 'none'; return }

    const x1 = chart.timeScale().timeToCoordinate(d.t1)
    const y1 = candleSeries.priceToCoordinate(d.p1)
    const x2 = chart.timeScale().timeToCoordinate(d.t2)
    const y2 = candleSeries.priceToCoordinate(d.p2)
    if (x1 === null || y1 === null || x2 === null || y2 === null) { btn.style.display = 'none'; return }

    btn.style.display = 'flex'
    btn.style.left = ((x1 + x2) / 2) + 'px'
    btn.style.top  = ((y1 + y2) / 2) + 'px'
  }

  // ============================================================
  // SEKSI 7: LPM
  // ============================================================
  // Net agresif (buy-sell) per HARI dari endpoint trade-book/chart (1 request =
  // 1 tanggal, tidak bisa banyak hari sekaligus seperti fetchDaily). Data di-cache
  // di DB.lpmCache (dibagi bersama), tapi punya 2 cara tampil INDEPENDEN:
  //   - Bar (panel)   → histogram di sub-pane sendiri, seperti Volume
  //   - Garis % (overlay) → menempel di chart utama dgn skala terpisah, seperti MA

  // Di bawah ini = auto-fetch langsung (cepat, tidak perlu konfirmasi).
  // Di atasnya = tampilkan estimasi waktu + tombol konfirmasi (5 tahun ≈ 1250
  // hari TETAP mungkin, tinggal mau nunggu — dan berkat persist ke Sheets,
  // biaya ini cuma dibayar SEKALI per saham, sesi berikutnya instan).
  const LPM_AUTO_FETCH_MAX = 40
  const LPM_BATCH_SIZE     = 5
  const LPM_BATCH_DELAY    = 400

  function _lpmNeeded() {
    // LPM hanya bermakna di timeframe 1D: cache per-tanggal (string date),
    // sedangkan candle intraday pakai unix time & weekly/monthly tanggalnya
    // tidak 1:1 dengan hari — mismatch skala waktu bikin render kacau.
    return _activeTf === '1D' && document.getElementById('ind-lpm').checked
  }

  let _lpmDebounceTimer = null
  function _debouncedLpmUpdate() {
    clearTimeout(_lpmDebounceTimer)
    _lpmDebounceTimer = setTimeout(_updateLpmForVisibleRange, 300)
    // tombol refetch hanya relevan saat LPM aktif di 1D
    const btn = document.getElementById('lpm-refetch')
    if (btn) btn.style.display = _lpmNeeded() ? '' : 'none'
  }

  // ↻ LPM — hapus cache simbol ini & fetch ulang visible range.
  // Untuk menyembuhkan cache tercemar dari masa bug elemen-terakhir-bukan-sum:
  // entri lama berisi buy/sell ≈ 0 dan tidak pernah difetch ulang karena
  // dianggap "sudah dicek".
  document.getElementById('lpm-refetch')?.addEventListener('click', async () => {
    const btn = document.getElementById('lpm-refetch')
    if (!confirm(`Hapus cache LPM ${DB.sym} dan fetch ulang?\nCache lama bisa berisi nilai salah dari bug lama (nilai nyaris nol).`)) return
    btn.disabled = true; btn.textContent = '…'
    try {
      await clearLpmCacheForSym(DB.sym)
      _renderLpmFromCache()          // kosongkan tampilan dulu
      await _updateLpmForVisibleRange() // fetch ulang bersih
    } catch (e) {
      console.warn('[chart] refetch LPM gagal:', e.message)
    }
    btn.disabled = false; btn.textContent = '↻ LPM'
  })

  async function _updateLpmForVisibleRange() {
    if (!chart || !DB.daily.length || !_lpmNeeded()) {
      _renderLpmFromCache()
      return
    }
    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range) return
    const fromIdx = Math.max(0, Math.floor(range.from))
    const toIdx   = Math.min(DB.daily.length - 1, Math.ceil(range.to))
    if (fromIdx > toIdx) return

    const visibleDates = DB.daily.slice(fromIdx, toIdx + 1).map(d => d.date)
    const missing = visibleDates.filter(d => !(d in DB.lpmCache))
    _renderLpmFromCache() // tampilkan yang sudah ada di cache duluan

    await fetchWithConfirm({
      missingDates: missing,
      statusEl: document.getElementById('lpm-status'),
      autoMax: LPM_AUTO_FETCH_MAX,
      batchSize: LPM_BATCH_SIZE,
      batchDelay: LPM_BATCH_DELAY,
      fetchFn: _fetchLpmDateBatch,
      onComplete: _renderLpmFromCache
    })
  }

  /** Fetch 1 batch tanggal LPM — dipanggil oleh fetchWithConfirm, sudah dibagi batch otomatis. */
  async function _fetchLpmDateBatch(batch) {
    const newlyFetched = []
    const noDataDates  = []
    await Promise.allSettled(batch.map(async date => {
      try {
        const data = await fetchAbsorption(DB.sym, date)
        const hasData = data.buy.length > 0 || data.sell.length > 0

        if (!hasData) {
          // API memang tidak punya data utk tanggal ini (BUKAN error, BUKAN net=0
          // sungguhan) — tandai null supaya tidak dihitung di kumulatif/bar, tapi
          // tetap dicatat "sudah dicek" supaya tidak fetch ulang tiap sesi.
          DB.lpmCache[date] = null
          noDataDates.push(date)
          return
        }

        // buyTotal/sellTotal = TOTAL tekanan beli/jual SEPANJANG HARI -- data.buy
        // sudah dikonversi jadi delta per-menit oleh fetchAbsorption() (lihat
        // toDelta() di shared/api.js), jadi harus di-SUM semua elemen, BUKAN
        // ambil elemen terakhir saja (itu cuma volume 1 menit TERAKHIR hari itu,
        // sering 0/kecil -- bug yang sempat ketemu, dikonfirmasi via Console:
        // BULL 2026-06-22 sum=17.230.439.400 vs elemen terakhir=0).
        const buyTotal  = data.buy.reduce((s, x) => s + x.value, 0)
        const sellTotal = data.sell.reduce((s, x) => s + x.value, 0)
        const entry = { buy: buyTotal, sell: sellTotal, net: buyTotal - sellTotal }
        DB.lpmCache[date] = entry
        newlyFetched.push({ date, ...entry })
      } catch (err) {
        // PENTING: exception (network/CORS/Apps Script error) BEDA dari "API
        // genuinely tidak punya data" -- console.warn eksplisit di sini supaya
        // kalau ada fetch yang gagal diam-diam (pola yang pernah ketemu di
        // win-rate/ranking-emiten), langsung kelihatan merah di Console, bukan
        // ke-treat sama persis dgn hari yang memang kosong transaksinya.
        console.warn(`[chart] LPM fetch GAGAL utk ${DB.sym} ${date} (BUKAN data kosong, ini error):`, err.message || err)
        DB.lpmCache[date] = null
      }
    }))
    // Simpan permanen ke Sheets — data valid (append biasa) + tanggal "tidak ada
    // data" (sentinel buy=-1, supaya tidak fetch ulang lagi di sesi/device lain)
    appendLpmCache(DB.sym, newlyFetched)
    if (noDataDates.length) {
      appendLpmCache(DB.sym, noDataDates.map(date => ({ date, buy: -1, sell: -1, net: 0 })))
    }
  }

  /**
   * Render LPM — SATU fungsi, mode (bar/line) & delta diatur via _indSettings.lpm.
   *
   * Mode Bar + Tanpa Delta → 2 bar berdampingan per hari: HAKA (hijau, naik)
   *   dan HAKI (merah, turun) — KEDUANYA tampil utuh, tidak dikurangi.
   * Mode Bar + Delta        → 1 bar = HAKA − HAKI di HARI YANG SAMA.
   * Mode Garis               → garis KUMULATIF net (Σ HAKA−HAKI), overlay pane 0
   *   skala sendiri. CATATAN: hanya menjumlah tanggal yang ADA di cache — kalau
   *   cache bolong, garis melompati hari (refetch penuh via tombol ↻ menyembuhkan).
   *   Delta tidak berlaku di mode ini (konsepnya cuma relevan utk Bar).
   */
  function _renderLpmFromCache() {
    ;[_lpmBarSeries, _lpmHakaSeries, _lpmHakiSeries, _lpmOverlaySeries].forEach(s => {
      if (s) { try { chart.removeSeries(s) } catch (_) {} }
    })
    _lpmBarSeries = _lpmHakaSeries = _lpmHakiSeries = _lpmOverlaySeries = null

    if (!chart || !_lpmNeeded()) {
      _setPaneActiveHeight('lpm', false)
      if (DB.daily.length) _updateInfoAndLegend(DB.daily.length - 1)
      return
    }

    const { mode, delta } = _indSettings.lpm

    if (mode === 'bar' && delta) {
      // 1 bar — HAKA minus HAKI, hari yang sama
      const pIdx = _paneIndexFor('lpm')
      const points = DB.daily.map(d => {
        const v = DB.lpmCache[d.date]
        return v ? { time: d.date, value: v.net, color: v.net >= 0 ? '#4ade80' : '#f0635c' } : null
      }).filter(Boolean)
      const s = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, title: 'ΔLPM' }, pIdx)
      s.setData(points)
      _lpmBarSeries = s
      _setPaneActiveHeight('lpm', true)
    }

    else if (mode === 'bar' && !delta) {
      // 2 bar berdampingan — HAKA (positif, hijau) & HAKI (negatif, merah)
      const pIdx = _paneIndexFor('lpm')
      const hakaPts = []
      const hakiPts = []
      DB.daily.forEach(d => {
        const v = DB.lpmCache[d.date]
        if (!v) return
        hakaPts.push({ time: d.date, value: v.buy,  color: '#4ade80' })
        hakiPts.push({ time: d.date, value: -v.sell, color: '#f0635c' }) // dinegatifkan supaya turun ke bawah
      })
      const sHaka = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, title: 'HAKA' }, pIdx)
      const sHaki = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, title: 'HAKI' }, pIdx)
      sHaka.setData(hakaPts)
      sHaki.setData(hakiPts)
      _lpmHakaSeries = sHaka
      _lpmHakiSeries = sHaki
      _setPaneActiveHeight('lpm', true)
    }

    else {
      // mode === 'line' — garis KUMULATIF (net tiap hari ditambah terus-menerus),
      // bergerak naik-turun bebas seperti harga/MA — bukan persen terbatas 0-100.
      // Delta tidak berlaku di mode ini (sama seperti sebelumnya).
      let cum = 0
      const points = []
      DB.daily.forEach(d => {
        const v = DB.lpmCache[d.date]
        if (!v) return
        cum += v.net
        points.push({ time: d.date, value: cum })
      })
      const s = chart.addSeries(LightweightCharts.LineSeries, {
        color: '#d98e2b', lineWidth: 1.5, title: 'LPM Kum.',
        priceScaleId: 'lpm-cum-scale' // skala sendiri, TIDAK ikut skala harga candle
      }, 0) // pane 0 = overlay bareng candle
      s.setData(points)
      try { s.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.05 } }) } catch (_) {}
      _lpmOverlaySeries = s
      _setPaneActiveHeight('lpm', false) // pastikan slot panel tetap 0 saat mode garis
    }
    if (DB.daily.length) _updateInfoAndLegend(DB.daily.length - 1)
  }

  // ============================================================
  // SEKSI 8: OHLC BAR + LEGEND OVERLAY
  // ============================================================
  function _updateInfoAndLegend(idx) {
    const candles = DB.candles || DB.daily
    const isIntraday = TF_CONFIG[_activeTf]?.type === 'intraday'
    if (!candles.length || idx === undefined || idx < 0 || idx >= candles.length) return
    const d = candles[idx]
    const prevClose = idx > 0 ? candles[idx - 1].close : d.open
    const chg = d.close - prevClose
    const chgPct = prevClose > 0 ? (chg / prevClose) * 100 : 0
    const up = chg >= 0
    const timeLabel = isIntraday ? (d.datetime || '') : d.date

    document.getElementById('ohlc-bar').innerHTML = `
      <span class="ohlc-sym">${DB.sym}</span>
      <span class="ohlc-tf">· ${_activeTf}</span>
      <span class="ohlc-val">O <b>${_fmtVal(d.open,'price')}</b></span>
      <span class="ohlc-val">H <b>${_fmtVal(d.high,'price')}</b></span>
      <span class="ohlc-val">L <b>${_fmtVal(d.low,'price')}</b></span>
      <span class="ohlc-val">C <b>${_fmtVal(d.close,'price')}</b></span>
      <span class="ohlc-chg ${up ? 'up' : 'down'}">${up?'+':''}${_fmtVal(chg,'price')} (${up?'+':''}${chgPct.toFixed(2)}%)</span>
      <span class="ohlc-tf">${timeLabel}</span>
    `

    const rows = []

    // MA multi-periode
    _maPeriods.forEach(p => {
      const entry = _maSeries[p]
      if (!entry) return
      rows.push({ label: 'MA' + p, color: _maColorFor(p), value: entry.values[idx], fmt: 'price' })
    })

    // Indikator single-instance (EMA, Bollinger, Supertrend, Volume, RSI, MACD, ATR)
    Object.keys(ACTIVE).forEach(key => {
      if (key === '_candle') return
      const ind = ACTIVE[key]
      if (!ind.legend) return
      rows.push(...ind.legend(idx))
    })

    // LPM — bentuk legend ikut mode & delta dari gear settings
    const lpmVal = DB.lpmCache[d.date]
    if (document.getElementById('ind-lpm').checked && lpmVal) {
      const { mode, delta } = _indSettings.lpm
      if (mode === 'bar' && delta) {
        rows.push({ label: 'ΔLPM', color: '#d98e2b', value: lpmVal.net, fmt: 'rp' })
      } else if (mode === 'bar' && !delta) {
        rows.push({ label: 'HAKA', color: '#4ade80', value: lpmVal.buy, fmt: 'rp' })
        rows.push({ label: 'HAKI', color: '#f0635c', value: lpmVal.sell, fmt: 'rp' })
      } else {
        // Garis kumulatif — jumlahkan net dari hari PERTAMA sampai idx (hari yang dihover)
        let cum = 0
        for (let i = 0; i <= idx; i++) {
          const v = DB.lpmCache[DB.daily[i].date]
          if (v) cum += v.net
        }
        rows.push({ label: 'LPM Kum.', color: '#d98e2b', value: cum, fmt: 'rp' })
      }
    }

    document.getElementById('chart-legend').innerHTML = rows.map(r => `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${r.color}"></span>
        <span class="legend-name">${r.label}</span>
        <span class="legend-value" style="color:${r.color}">${_fmtVal(r.value, r.fmt)}</span>
      </div>
    `).join('')
  }

  function _fmtVal(v, fmt) {
    if (v === null || v === undefined || isNaN(v)) return '–'
    if (fmt === 'vol')    return fmtVol(v)
    if (fmt === 'rp')     return fmtRp(v)
    if (fmt === 'pct')    return v.toFixed(1) + '%'
    if (fmt === 'num1')   return v.toFixed(1)
    if (fmt === 'price2') return v.toFixed(2)
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)
  }

  // ============================================================
  // ORB (Opening Range Breakout) + IEP Volume Surge
  // ============================================================
  // Hasil analisa statistik dari 239 hari intraday RAJA (2025-2026):
  // - TANPA ORB breakout UP jam 09:05: WLB_avoid 90.9% (hampir pasti turun)
  // - DENGAN ORB breakout UP, exit jam 12:00: WLB 64.4%, avg +1.88%
  // - Konsisten di split temporal EARLY (90.6%) dan LATE (83.1%)
  //
  // Cara kerja:
  // 1. Fetch data intraday 1m hari ini untuk dapatkan candle 09:00-09:04
  // 2. Hitung ORB high = max(high) dan ORB low = min(low) dari 09:00-09:04
  // 3. Plot garis horizontal ORB high (hijau) dan ORB low (merah) di chart
  // 4. Monitor apakah ada candle yang close > ORB high setelah 09:05
  // 5. Tampilkan status di toolbar: ORB BROKEN / WAITING / NO SIGNAL

  let _orbHighLine = null
  let _orbLowLine  = null
  let _orbStatus   = null   // 'broken_up' | 'waiting' | 'no_signal' | null

  async function _loadOrb() {
    const sym = DB.sym
    if (!sym || !chart) return

    const now = new Date()
    // Pakai WIB: offset +7 jam dari UTC
    const wib = new Date(now.getTime() + 7*3600*1000)
    const dateStr = wib.toISOString().slice(0, 10)
    const dayOfWeek = wib.getUTCDay()  // 0=Sun, 6=Sat

    // Hapus garis lama
    _removeOrbLines()

    // Hanya tampilkan di hari bursa dan TF Daily (ORB adalah sinyal harian)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      _setOrbStatus('weekend')
      return
    }
    if (_activeTf !== '1D') {
      _setOrbStatus('non-daily-tf')
      return
    }

    try {
      document.getElementById('orb-status').textContent = '⏳ Memuat ORB...'

      // Fetch intraday 1m hari ini (toTs=sekarang, fromTs=08:00 WIB hari ini)
      const todayMidnight = new Date(dateStr + 'T00:00:00+07:00')
      const fromTs = Math.floor((todayMidnight.getTime() + 8*3600*1000) / 1000)  // 08:00 WIB
      const toTs   = Math.floor(now.getTime() / 1000)

      const intraday = await fetchIntraday(sym, toTs, fromTs, 1)  // mult=1 -> 1m
      if (!intraday || intraday.length === 0) {
        _setOrbStatus('no_data')
        return
      }

      // Hitung IEP volume (08:45-08:59)
      const iepCandles = intraday.filter(c => {
        const dt = c.datetime || ''
        const t  = dt.slice(11, 16)
        return t >= '08:45' && t <= '08:59'
      })
      const iepVol = iepCandles.reduce((s, c) => s + (c.volume || 0), 0)

      // ORB range: candle 09:00-09:04
      const orbCandles = intraday.filter(c => {
        const t = (c.datetime || '').slice(11, 16)
        return t >= '09:00' && t <= '09:04'
      })
      if (orbCandles.length === 0) {
        _setOrbStatus('pre_market')
        return
      }

      const orbHigh = Math.max(...orbCandles.map(c => c.high))
      const orbLow  = Math.min(...orbCandles.map(c => c.low))

      // Cek breakout: ada candle setelah 09:05 yang close > orbHigh?
      const postOrb = intraday.filter(c => {
        const t = (c.datetime || '').slice(11, 16)
        return t >= '09:05'
      })
      const brokenUp   = postOrb.some(c => c.close > orbHigh)
      const brokenDown = postOrb.some(c => c.close < orbLow)
      const currentTime = wib.toISOString().slice(11, 16)

      // Plot garis di chart (hanya jika ada DB.daily dengan tanggal hari ini)
      const todayBar = DB.daily.find(d => d.date === dateStr)
      if (todayBar && chart) {
        _orbHighLine = candleSeries.createPriceLine({
          price: orbHigh,
          color: brokenUp ? '#4ade80' : '#6ee7b7',
          lineWidth: 1,
          lineStyle: 2,  // dashed
          axisLabelVisible: true,
          title: `ORB High ${orbHigh}`,
        })
        _orbLowLine = candleSeries.createPriceLine({
          price: orbLow,
          color: brokenDown ? '#f0635c' : '#fca5a5',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `ORB Low ${orbLow}`,
        })
      }

      // Tentukan status
      if (currentTime < '09:05') {
        _setOrbStatus('forming', { iepVol, orbHigh, orbLow })
      } else if (brokenUp) {
        _setOrbStatus('broken_up', { iepVol, orbHigh, orbLow })
      } else if (currentTime < '09:30') {
        _setOrbStatus('waiting', { iepVol, orbHigh, orbLow })
      } else {
        _setOrbStatus('no_signal', { iepVol, orbHigh, orbLow })
      }
    } catch(e) {
      console.warn('[ORB] gagal:', e.message)
      document.getElementById('orb-status').textContent = ''
    }
  }

  function _removeOrbLines() {
    try { if (_orbHighLine) { candleSeries.removePriceLine(_orbHighLine); _orbHighLine = null } } catch(_) {}
    try { if (_orbLowLine)  { candleSeries.removePriceLine(_orbLowLine);  _orbLowLine  = null } } catch(_) {}
  }

  function _setOrbStatus(status, info = {}) {
    _orbStatus = status
    const el = document.getElementById('orb-status')
    if (!el) return
    const { iepVol, orbHigh, orbLow } = info
    const fmtVol = v => v != null ? (v/1e6).toFixed(1)+'jt lot' : ''
    switch(status) {
      case 'broken_up':
        el.innerHTML = `<span style="color:#4ade80">✓ ORB BROKEN UP</span> · H=${orbHigh?.toLocaleString('id-ID')} L=${orbLow?.toLocaleString('id-ID')} · IEP ${fmtVol(iepVol)} <span style="color:#6b6557;font-size:10px">→ sinyal LONG (WLB 64.4%, exit 12:00)</span>`
        break
      case 'no_signal':
        el.innerHTML = `<span style="color:#f0635c">✗ NO ORB BREAKOUT</span> · H=${orbHigh?.toLocaleString('id-ID')} L=${orbLow?.toLocaleString('id-ID')} · IEP ${fmtVol(iepVol)} <span style="color:#6b6557;font-size:10px">→ AVOID hari ini (WLB avoid 90.9%)</span>`
        break
      case 'waiting':
        el.innerHTML = `<span style="color:#fbbf24">⏳ ORB BELUM BREAK</span> · H=${orbHigh?.toLocaleString('id-ID')} L=${orbLow?.toLocaleString('id-ID')} · IEP ${fmtVol(iepVol)}`
        break
      case 'forming':
        el.innerHTML = `<span style="color:#9aa0a6">🔔 ORB FORMING</span> · IEP ${fmtVol(iepVol)}`
        break
      case 'pre_market':
        el.innerHTML = `<span style="color:#6b6557">Pasar belum buka</span>`
        break
      case 'no_data':
        el.innerHTML = `<span style="color:#6b6557">Tidak ada data intraday hari ini</span>`
        break
      case 'weekend':
      case 'non-daily-tf':
        el.textContent = ''
        break
      default:
        el.textContent = ''
    }
  }

  init()
  window._chart = { DB, chart: () => chart, ACTIVE }

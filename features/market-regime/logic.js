// features/market-regime/logic.js
import { renderHeader } from '../../shared/header.js'
import { onReady } from '../../shared/token.js'
import { fetchDaily } from '../../shared/api.js'
import { classifyTrend, momentum, relativeStrength, regimeScore, regimeLabel,
         SECTOR_MAP, SECTOR_INDICES } from '../../shared/regime.js'

renderHeader(document.getElementById('app-header'), [
  { label: 'IHSG Suite', href: '../../index.html' },
  { label: 'Market Regime' },
])

const $ = id => document.getElementById(id)
const status = msg => { $('status').textContent = msg }

function fmtTrend(t) {
  if (t === 'UPTREND')   return '<span class="up">▲ UPTREND</span>'
  if (t === 'DOWNTREND') return '<span class="down">▼ DOWNTREND</span>'
  return '<span class="flat">► SIDEWAYS</span>'
}

// Ambil closes ascending dari fetchDaily (yang return descending)
async function closesOf(sym) {
  const to = new Date(Date.now() + 7*3600*1000).toISOString().slice(0, 10)
  const from = new Date(Date.now() - 120*86400*1000).toISOString().slice(0, 10)
  const daily = await fetchDaily(sym, from, to)   // descending
  if (!daily || !daily.length) throw new Error(`EMPTY ${sym}`)
  return [...daily].reverse().map(d => d.close)   // ascending
}

async function run() {
  const focus = $('focus-sym').value
  const sectorSym = focus ? (SECTOR_MAP[focus] || null) : null
  status('Memuat IHSG…')
  try {
    const ihsg = await closesOf('IHSG')
    const ihsgTrend = classifyTrend(ihsg)
    const ihsgMom = momentum(ihsg, 20)

    let sectorTrend = null, rs = null, sectorName = '—'
    if (sectorSym) {
      status(`Memuat ${sectorSym}…`)
      const sector = await closesOf(sectorSym)
      sectorTrend = classifyTrend(sector)
      rs = relativeStrength(sector, ihsg, 20)
      sectorName = (SECTOR_INDICES.find(s => s[0] === sectorSym) || [,sectorSym])[1]
    }

    // Skor gabungan
    const score = regimeScore(ihsgTrend, sectorTrend, rs?.rs)
    const lab = regimeLabel(score)
    $('hero').style.display = 'block'
    $('cards').style.display = 'grid'
    $('score').textContent = score
    $('score').className = 'regime-score ' + (lab.color === 'live' ? 'up' : lab.color === 'down' ? 'down' : 'flat')
    $('band').innerHTML = `${lab.emoji} ${lab.label}`
    $('hero-sub').textContent = focus
      ? `Konteks untuk ${focus} · IHSG ${ihsgTrend} · sektor ${sectorName} ${sectorTrend||''}`
      : `IHSG ${ihsgTrend}`

    $('ihsg-trend').innerHTML = fmtTrend(ihsgTrend)
    $('ihsg-sub').textContent = `Momentum 20d: ${ihsgMom>=0?'+':''}${ihsgMom?.toFixed(1)}%`

    if (sectorSym) {
      $('sector-label').textContent = `Sektor · ${sectorName}`
      $('sector-trend').innerHTML = fmtTrend(sectorTrend)
      $('sector-sub').textContent = sectorSym
      $('rs-val').innerHTML = rs
        ? (rs.rs === 'OUTPERFORM' ? '<span class="up">OUTPERFORM</span>'
           : rs.rs === 'UNDERPERFORM' ? '<span class="down">UNDERPERFORM</span>'
           : '<span class="flat">INLINE</span>')
        : '–'
      $('rs-sub').textContent = rs ? `${rs.ratio>=0?'+':''}${rs.ratio}% vs IHSG` : ''
    } else {
      $('sector-label').textContent = 'Sektor'
      $('sector-trend').textContent = '—'
      $('sector-sub').textContent = 'pilih emiten'
      $('rs-val').textContent = '—'
      $('rs-sub').textContent = ''
    }

    // Heatmap semua sektor
    status('Memuat 11 sektor…')
    $('sector-table').style.display = 'table'
    const body = $('sector-body')
    body.innerHTML = ''
    const results = []
    for (const [sym, name] of SECTOR_INDICES) {
      try {
        const cl = await closesOf(sym)
        const t = classifyTrend(cl)
        const mom = momentum(cl, 20)
        const ma20 = cl.slice(-20).reduce((a,b)=>a+b,0)/20
        const c = cl[cl.length-1]
        results.push({ sym, name, c, ma20, mom, t })
      } catch(e) { /* skip */ }
    }
    results.sort((a,b) => (b.mom||-999) - (a.mom||-999))
    for (const r of results) {
      const vsMA = ((r.c - r.ma20)/r.ma20*100)
      const tr = document.createElement('tr')
      tr.innerHTML = `<td>${r.name}</td>`
        + `<td>${r.c.toFixed(1)}</td>`
        + `<td class="${vsMA>=0?'up':'down'}">${vsMA>=0?'+':''}${vsMA.toFixed(1)}%</td>`
        + `<td class="${r.mom>=0?'up':'down'}">${r.mom>=0?'+':''}${r.mom.toFixed(1)}%</td>`
        + `<td>${fmtTrend(r.t)}</td>`
      body.appendChild(tr)
    }
    status(`Terakhir diperbarui: ${new Date().toLocaleTimeString('id-ID')}`)
  } catch(e) {
    status(`Gagal memuat: ${e.message}. Cek token Stockbit.`)
  }
}

$('btn-refresh').addEventListener('click', run)
$('focus-sym').addEventListener('change', run)
onReady(run)

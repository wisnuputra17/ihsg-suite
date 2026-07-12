// features/analisa-scalping/logic.js

import { renderHeader, whenTokenReady, openTokenPopover } from '../../shared/header.js'
import { onReady }        from '../../shared/token.js'
import { TOKEN }          from '../../shared/store.js'
import { fetchIntraday, fetchDaily } from '../../shared/api.js'
import { calcRSI, calcSMA }          from '../../shared/indicators.js'

const FEE = 0.26

// Default periode 1 tahun terakhir
const today = new Date()
const yearAgo = new Date(today); yearAgo.setFullYear(today.getFullYear()-1)
document.getElementById('date-to').value   = today.toISOString().slice(0,10)
document.getElementById('date-from').value = yearAgo.toISOString().slice(0,10)

// ── Toggle sub-conditions ──
const subs = {
  'c-vol-iep':'s-vol-iep','c-rsi':'s-rsi','c-trend':'s-trend',
  'c-orb-range':'s-orb-range','c-vol-orb':'s-vol-orb',
}
Object.entries(subs).forEach(([cb,sub]) => {
  const el = document.getElementById(cb)
  const sd = document.getElementById(sub)
  el.addEventListener('change', () => { sd.style.display = el.checked?'flex':'none'; recalc() })
})

// gap threshold row visibility (hide when "all")
document.querySelectorAll('input[name=gap]').forEach(r =>
  r.addEventListener('change', () => {
    document.getElementById('gap-th-row').style.display =
      document.querySelector('input[name=gap]:checked').value==='all'?'none':'flex'
    recalc()
  })
)

// ORB toggle
document.getElementById('use-orb').addEventListener('change', () => {
  const on = document.getElementById('use-orb').checked
  document.getElementById('orb-cfg').style.display = on?'':'none'
  document.getElementById('exit-sec').style.display = on?'none':''
  recalc()
})

// Uppercase sym
document.getElementById('sym').addEventListener('input', e =>
  e.target.value = e.target.value.toUpperCase()
)

// Recalc on any change
const watchIds = [
  'gap-th','vol-iep-x','rsi-lo','rsi-hi','ma-n',
  'orb-range-pct','vol-orb-x','orb-dl','exit-orb','exit-av',
]
watchIds.forEach(id => document.getElementById(id)?.addEventListener('change', recalc))
document.querySelectorAll('input[name=rsi-dir],input[name=tr-dir]').forEach(r=>r.addEventListener('change',recalc))
document.querySelectorAll('#entry-times-grid input, #exit-times-grid input').forEach(cb=>cb.addEventListener('change',recalc))

// ── State ──
let _S = null  // { dates, byDate, prevCloseMap, dailyMap, avgOrb5, avgIep5, iepPcts, sym, dateFrom, dateTo }

// ── Helpers ──
function wlb(w,n,z=1.96){
  if(!n)return 0
  const p=w/n,dd=1+z*z/n,cc=p+z*z/(2*n)
  return(cc-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/dd
}
function gp(cs,t){
  const ec=cs.filter(c=>c.datetime.slice(11,16)<=t)
  return ec.length?ec[ec.length-1].close:null
}
function sp(v){document.getElementById('prog').style.width=v+'%'}
function fp(v,d=2){return(v>=0?'+':'')+v.toFixed(d)+'%'}

// ── FETCH ──
async function fetchData(){
  const sym=document.getElementById('sym').value.trim().toUpperCase()
  const df=document.getElementById('date-from').value
  const dt=document.getElementById('date-to').value
  if(!sym||!df||!dt){alert('Lengkapi emiten dan periode');return}
  await whenTokenReady()
  if(!TOKEN.isSet()){openTokenPopover();return}

  const btn=document.getElementById('fetch-btn')
  const stEl=document.getElementById('status')
  btn.disabled=true; btn.textContent='⏳ Fetching...'
  stEl.className='status'; stEl.textContent='Mengambil data...'
  sp(5); _S=null
  document.getElementById('rbody').innerHTML=`<div class="empty"><div style="font-size:28px">⏳</div><div>Mengambil data ${sym}...</div></div>`

  try{
    const nowTs=Math.floor(Date.now()/1000)
    const toTs=Math.min(Math.floor(new Date(dt+'T09:00:00Z').getTime()/1000)+7*3600,nowTs)
    const fromTs=Math.floor(new Date(df+'T02:00:00Z').getTime()/1000)
    const bMs=7*24*3600*1000
    const nB=Math.ceil((toTs-fromTs)*1000/bMs)
    const all=[]; const seen=new Set()
    for(let b=0;b<nB;b++){
      const bTo=toTs-b*bMs/1000
      const bFrom=Math.max(fromTs,toTs-(b+1)*bMs/1000)
      if(bFrom>=bTo)break
      sp(5+Math.round(b/nB*45))
      btn.textContent=`⏳ Batch ${b+1}/${nB}...`
      try{
        const cs=await fetchIntraday(sym,bTo,bFrom,1)
        for(const c of cs){if(!seen.has(c.unix)){seen.add(c.unix);all.push(c)}}
      }catch(e){if(e.code==='EMPTY_RESPONSE')break;throw e}
    }
    all.sort((a,b)=>a.unix-b.unix)
    sp(55)

    btn.textContent='⏳ Daily...'
    const dAll=await fetchDaily(sym)
    const dSorted=[...dAll].sort((a,b)=>a.date<b.date?-1:1)
    const cls=dSorted.map(d=>d.close)
    const rsiA=calcRSI(cls,14),ma20A=calcSMA(cls,20),ma50A=calcSMA(cls,50)
    dSorted.forEach((d,i)=>{d._rsi=rsiA[i];d._ma20=ma20A[i];d._ma50=ma50A[i]})
    const dMap={}; dSorted.forEach(d=>dMap[d.date]=d)
    sp(70)

    const byDate={}
    for(const c of all){const dt2=c.datetime.slice(0,10);if(!byDate[dt2])byDate[dt2]=[];byDate[dt2].push(c)}
    const dates=Object.keys(byDate).sort()

    const prevCM={}
    for(let i=1;i<dates.length;i++){
      const d=dates[i],p=dates[i-1]
      const reg=byDate[p].filter(c=>c.datetime.slice(11,16)>='09:00'&&c.datetime.slice(11,16)<='15:50').sort((a,b)=>a.unix-b.unix)
      if(reg.length)prevCM[d]=reg[reg.length-1].close
    }

    const avgOrb5={},avgIep5={}
    for(let i=5;i<dates.length;i++){
      const p5=dates.slice(i-5,i),ov=[],iv=[]
      for(const pd of p5){
        const o=byDate[pd].filter(c=>c.datetime.slice(11,16)>='09:00'&&c.datetime.slice(11,16)<='09:04')
        const ie=byDate[pd].filter(c=>c.datetime.slice(11,16)>='08:45'&&c.datetime.slice(11,16)<='08:59')
        if(o.length)ov.push(o.reduce((s,c)=>s+c.volume,0))
        if(ie.length)iv.push(ie.reduce((s,c)=>s+c.volume,0))
      }
      if(ov.length)avgOrb5[dates[i]]=ov.reduce((s,v)=>s+v,0)/ov.length
      if(iv.length)avgIep5[dates[i]]=iv.reduce((s,v)=>s+v,0)/iv.length
    }

    const iepPcts=dates.map(d=>{
      const ie=byDate[d].filter(c=>c.datetime.slice(11,16)>='08:45'&&c.datetime.slice(11,16)<='08:59')
      return ie.reduce((s,c)=>s+c.volume,0)
    }).filter(v=>v>0).sort((a,b)=>a-b)

    sp(100)
    _S={dates,byDate,prevCM,dMap,avgOrb5,avgIep5,iepPcts,sym,dateFrom:df,dateTo:dt}
    const totalDays=dates.filter(d=>d>=df&&d<=dt&&prevCM[d]).length
    stEl.className='status ok'
    stEl.textContent=`✓ ${sym} · ${totalDays} hari · ${all.length.toLocaleString()} candle`
    recalc()
  }catch(e){
    stEl.className='status err'; stEl.textContent='✗ '+(e.message||'Gagal')
    document.getElementById('rbody').innerHTML=`<div class="empty"><div>❌</div><div>${e.message}</div></div>`
    if(e.code==='TOKEN_EXPIRED')openTokenPopover()
  }finally{
    btn.disabled=false; btn.textContent='▶ FETCH DATA'
    setTimeout(()=>sp(0),600)
  }
}

// ── RECALC (real-time) ──
function recalc(){
  if(!_S)return
  const{dates,byDate,prevCM,dMap,avgOrb5,avgIep5,iepPcts,sym,dateFrom,dateTo}=_S

  // Baca config
  const gapMode  = document.querySelector('input[name=gap]:checked').value
  const gapTh    = parseFloat(document.getElementById('gap-th').value)||0.5
  const cVolIep  = document.getElementById('c-vol-iep').checked
  const volIepX  = parseFloat(document.getElementById('vol-iep-x').value)||1.5
  const cRsi     = document.getElementById('c-rsi').checked
  const rsiDir   = document.querySelector('input[name=rsi-dir]:checked')?.value||'le'
  const rsiLo    = parseFloat(document.getElementById('rsi-lo').value)||40
  const rsiHi    = parseFloat(document.getElementById('rsi-hi').value)||60
  const cTrend   = document.getElementById('c-trend').checked
  const trDir    = document.querySelector('input[name=tr-dir]:checked')?.value||'above'
  const maN      = parseInt(document.getElementById('ma-n').value)||20
  const cOrbR    = document.getElementById('c-orb-range').checked
  const orbRPct  = parseFloat(document.getElementById('orb-range-pct').value)||1.0
  const cVolOrb  = document.getElementById('c-vol-orb').checked
  const volOrbX  = parseFloat(document.getElementById('vol-orb-x').value)||2.0
  const useOrb   = document.getElementById('use-orb').checked
  const orbDl    = document.getElementById('orb-dl').value
  const exitOrbT = document.getElementById('exit-orb').value
  const exitAvT  = document.getElementById('exit-av').value

  const entryTimes=[...(document.querySelectorAll('#entry-times-grid input:checked'))].map(c=>c.value)
  const exitTimes =useOrb?[]:
    [...(document.querySelectorAll('#exit-times-grid input:checked'))].map(c=>c.value)

  if(!entryTimes.length||((!useOrb)&&!exitTimes.length)){
    document.getElementById('rbody').innerHTML=
      `<div class="empty"><div>⚠️</div><div>Pilih minimal 1 entry time dan 1 exit time</div></div>`
    return
  }

  // Hasil: key = "entry|exit"
  const buckets={}

  for(const date of dates){
    if(date<dateFrom||date>dateTo)continue
    if(!prevCM[date])continue

    const day=byDate[date].sort((a,b)=>a.unix-b.unix)
    const iepC=day.filter(c=>c.datetime.slice(11,16)>='08:45'&&c.datetime.slice(11,16)<='08:59')
    if(!iepC.length)continue

    const iepPrice=iepC[iepC.length-1].close
    const iepVol  =iepC.reduce((s,c)=>s+c.volume,0)
    const prevClose=prevCM[date]
    const gapPct=(iepPrice-prevClose)/prevClose*100

    // Gap condition
    if(gapMode==='up'   &&gapPct<= gapTh)continue
    if(gapMode==='down' &&gapPct>=-gapTh)continue
    if(gapMode==='both' &&Math.abs(gapPct)<=gapTh)continue
    // 'all' = tidak filter gap

    // Additional conditions
    if(cVolIep&&avgIep5[date]&&iepVol/avgIep5[date]<volIepX)continue

    const orbC=day.filter(c=>c.datetime.slice(11,16)>='09:00'&&c.datetime.slice(11,16)<='09:04')
    if(!orbC.length)continue
    const orbHigh=Math.max(...orbC.map(c=>c.high))
    const orbLow =Math.min(...orbC.map(c=>c.low))
    const orbVol =orbC.reduce((s,c)=>s+c.volume,0)

    if(cOrbR&&(orbHigh-orbLow)/prevClose*100<orbRPct)continue
    if(cVolOrb&&avgOrb5[date]&&orbVol/avgOrb5[date]<volOrbX)continue

    const prevIdx=dates.indexOf(date)-1
    const pd=prevIdx>=0?dMap[dates[prevIdx]]:null
    if(cRsi&&pd?._rsi!=null){
      if(rsiDir==='le'&&pd._rsi>rsiLo)continue
      if(rsiDir==='ge'&&pd._rsi<rsiHi)continue
    }
    if(cTrend&&pd){
      const maV=maN===20?pd._ma20:pd._ma50
      if(maV==null)continue
      if(trDir==='above'&&iepPrice<=maV)continue
      if(trDir==='below'&&iepPrice>=maV)continue
    }

    // ORB breakout check (shared)
    const postOrb=day.filter(c=>{const t=c.datetime.slice(11,16);return t>='09:05'&&t<orbDl})
    const orbBroken=postOrb.some(c=>c.close>orbHigh)

    // Loop entry times
    for(const et of entryTimes){
      // Entry price = open candle pada jam entry
      const ec=day.filter(c=>c.datetime.slice(11,16)===et)
      const entryPrice=ec.length?ec[0].open:gp(day,et)
      if(!entryPrice)continue

      if(useOrb){
        const key=`${et}|${orbBroken?`ORB→${exitOrbT}`:`AV→${exitAvT}`}`
        if(!buckets[key])buckets[key]=[]
        const xp=gp(day,orbBroken?exitOrbT:exitAvT)
        if(xp)buckets[key].push({ret:(xp-entryPrice)/entryPrice*100,type:orbBroken?'orb':'av',date})
      } else {
        for(const xt of exitTimes){
          if(xt<=et)continue  // exit harus setelah entry
          const key=`${et}|${xt}`
          if(!buckets[key])buckets[key]=[]
          const xp=gp(day,xt)
          if(xp)buckets[key].push({ret:(xp-entryPrice)/entryPrice*100,type:'fixed',date})
        }
      }
    }
  }

  const totalDays=dates.filter(d=>d>=dateFrom&&d<=dateTo&&prevCM[d]).length

  // Stats
  const rows=[]
  for(const[key,trades]of Object.entries(buckets)){
    const[et,xt]=key.split('|')
    const rets=trades.map(t=>t.ret)
    const w=rets.filter(r=>r>0).length
    const wins=rets.filter(r=>r>0),loss=rets.filter(r=>r<=0)
    const wlbV=wlb(w,rets.length)
    const avgG=rets.reduce((s,r)=>s+r,0)/rets.length
    const avgW=wins.length?wins.reduce((s,r)=>s+r,0)/wins.length:0
    const avgL=loss.length?loss.reduce((s,r)=>s+r,0)/loss.length:0
    const rr=loss.length&&avgL?Math.abs(avgW/avgL):null
    let eq=100,peak=100,mdd=0
    for(const r of rets){eq*=(1+(r-FEE)/100);peak=Math.max(peak,eq);mdd=Math.max(mdd,(peak-eq)/peak*100)}
    rows.push({
      et,xt,n:rets.length,totalDays,
      winPct:w/rets.length*100,wlbV:wlbV*100,
      avgG,avgW,avgL,rr,ret:eq-100,mdd,
      type:trades[0].type,
      nOrb:trades.filter(t=>t.type==='orb').length,
      nAv:trades.filter(t=>t.type==='av').length,
    })
  }
  rows.sort((a,b)=>b.ret-a.ret)

  const infoEl=document.getElementById('rinfo')
  const bodyEl=document.getElementById('rbody')

  if(!rows.length){
    infoEl.innerHTML=''
    bodyEl.innerHTML=`<div class="empty"><div>⚠️</div><div>Tidak ada trade dengan kondisi ini</div></div>`
    return
  }

  infoEl.innerHTML=`<b>${sym}</b> · ${dateFrom}–${dateTo} · <b>${totalDays}</b> hari · fee <b>${FEE}%</b>/RT · <b>${rows.length}</b> kombinasi`

  const isOrb=useOrb
  let html=`<table class="rt"><thead><tr>`
  html+=`<th>Entry</th><th>Exit</th><th>n/hari</th>`
  if(isOrb)html+=`<th>ORB</th><th>AV</th>`
  html+=`<th>Win%</th><th>WLB%</th><th>Avg</th><th>AvgWIN</th><th>AvgLOS</th><th>R/R</th><th>MDD</th><th>Return/thn</th>`
  html+=`</tr></thead><tbody>`

  for(const r of rows){
    const rc=r.ret>=0?'up':'dn'
    const ac=r.avgG>=0?'up':'dn'
    const wc=r.wlbV>=65?'ws':r.wlbV>=55?'wd':''
    const wm=r.wlbV>=65?'★':r.wlbV>=55?'·':''
    let xtCell=r.xt
    if(r.type==='orb')xtCell+=`<span class="badge borb">ORB</span>`
    if(r.type==='av') xtCell+=`<span class="badge bav">AV</span>`
    html+=`<tr>`
    html+=`<td>${r.et}</td><td>${xtCell}</td><td>${r.n}/${r.totalDays}</td>`
    if(isOrb)html+=`<td>${r.nOrb||'–'}</td><td>${r.nAv||'–'}</td>`
    html+=`<td>${r.winPct.toFixed(1)}%</td>`
    html+=`<td class="${wc}">${r.wlbV.toFixed(1)}%${wm}</td>`
    html+=`<td class="${ac}">${fp(r.avgG)}</td>`
    html+=`<td class="up">${fp(r.avgW)}</td>`
    html+=`<td class="dn">${fp(r.avgL)}</td>`
    html+=`<td>${r.rr!=null?r.rr.toFixed(2)+'x':'–'}</td>`
    html+=`<td class="dn">${r.mdd.toFixed(1)}%</td>`
    html+=`<td class="${rc}" style="font-weight:700">${fp(r.ret,1)}</td>`
    html+=`</tr>`
  }
  html+=`</tbody></table>`
  bodyEl.innerHTML=html
}

document.getElementById('fetch-btn').addEventListener('click', fetchData)

renderHeader(document.getElementById('app-header'), [
  { label: 'IHSG Suite', href: '../../index.html' },
  { label: 'Analisa Scalping' }
])
onReady(()=>{})

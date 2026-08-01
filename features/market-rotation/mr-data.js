/**
 * Data layer Market Rotation — dipakai bersama oleh halaman MR dan preload
 * dashboard, supaya logika cache+fetch identik (tak ada duplikasi/drift).
 *
 * Cache di IndexedDB (SATU baris '__ALL__' berisi {sym: daily[]}), TIDAK terhapus
 * oleh hard refresh. Preload dashboard mengisi cache di latar; halaman MR baca
 * cache → tampil instan, lalu segarkan yg basi.
 */
import { fetchDaily, fetchEmitenJson } from '../../shared/api.js'
import { gsLoad, gsSave } from '../../shared/indexeddb.js'

const CACHE_SHEET = 'mr-daily-cache'
export function todayWIB(){ return new Date(Date.now()+7*3600*1000).toISOString().slice(0,10) }

/** Muat cache dari disk → Map(sym→daily). Return {cache, fetchedAt}. */
export async function loadCache(){
  const cache = new Map()
  try{
    const rows = await gsLoad(CACHE_SHEET)
    const row = (rows||[]).find(r => r && r.sym === '__ALL__')
    if(row && row.payload){
      for(const [sym, daily] of Object.entries(row.payload)) if(daily) cache.set(sym, daily)
      return { cache, fetchedAt: row.fetchedAt || null }
    }
  }catch(e){}
  return { cache, fetchedAt: null }
}

/** Simpan seluruh cache sbg 1 baris, segera. */
export async function saveCache(cache){
  try{
    const payload = {}
    for(const [sym, daily] of cache.entries()) payload[sym] = daily
    await gsSave(CACHE_SHEET, [{ sym:'__ALL__', payload, fetchedAt: todayWIB() }])
    return true
  }catch(e){ console.warn('[mr-data] gagal simpan cache:', e.message); return false }
}

/** Fetch daily 1 emiten (45 hari), ascending. */
export async function fetchOne(sym){
  const to = new Date(Date.now()+7*3600*1000).toISOString().slice(0,10)
  const from = new Date(Date.now()-45*86400*1000).toISOString().slice(0,10)
  const daily = await fetchDaily(sym, to, from)
  return [...daily].sort((a,b)=>a.date<b.date?-1:1)
}

/** Daftar semua kode emiten dari emiten.json. */
export async function allSymbols(){
  const raw = await fetchEmitenJson()
  return { list: raw.emiten || [], raw }
}

/**
 * Isi cache utk daftar simbol. Fetch hanya yg belum ada / bila stale.
 * onProgress(done, total) opsional. Menyimpan ke disk di akhir.
 * Return cache Map terisi.
 */
export async function warmCache(symbols, { cache, fetchedAt, force=false, onProgress, delay=120, signal } = {}){
  cache = cache || new Map()
  const fresh = fetchedAt === todayWIB() && !force
  const need = symbols.filter(s => force || !cache.has(s) || !fresh)
  if(fresh && !need.length) return { cache, changed:false }
  let done=0
  for(const s of need){
    if(signal && signal.aborted) break
    try{ cache.set(s, await fetchOne(s)) }catch(e){}
    done++
    if(onProgress) onProgress(done, need.length)
    if(delay) await new Promise(r=>setTimeout(r, delay))
  }
  await saveCache(cache)
  return { cache, changed:true }
}

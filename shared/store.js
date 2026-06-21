/**
 * shared/store.js
 * ===============
 * Fondasi global seluruh ihsg-suite.
 * Aturan ketat:
 *   - HANYA simpan state & konstanta
 *   - TIDAK boleh fetch, render, atau kalkulasi
 *   - Semua modul import dari sini
 *
 * 3 Kategori data:
 *   1. TOKEN          → localStorage (satu-satunya)
 *   2. KONSTANTA      → derived dari emiten.json saat loadEmitenInfo()
 *   3. UNIVERSAL      → in-memory, di-load lazy oleh modul yang pertama butuh
 */

// ============================================================
// SEKSI 1: TOKEN
// ============================================================

export const TOKEN = {
  get: () => {
    const raw = localStorage.getItem('ihsglab_token') || ''
    return raw.replace(/[^\x00-\x7F]/g, '') // sanitize non-ASCII wajib
  },
  set: (v) => {
    localStorage.setItem('ihsglab_token', v.replace(/[^\x00-\x7F]/g, ''))
    localStorage.setItem('ihsglab_token_set_at', String(Date.now()))
  },
  clear: () => {
    localStorage.removeItem('ihsglab_token')
    localStorage.removeItem('ihsglab_token_set_at')
  },
  isSet: () => !!localStorage.getItem('ihsglab_token'),
  /** Sudah berapa lama sejak token diset (ms). null kalau tidak ada timestamp (token lama). */
  elapsedMs: () => {
    const t = localStorage.getItem('ihsglab_token_set_at')
    return t ? Date.now() - parseInt(t) : null
  }
}

// ============================================================
// SEKSI 2: KONSTANTA — derived dari emiten.json
// Di-populate oleh loadEmitenInfo(), tidak hardcoded
// ============================================================

export let SYMS    = []         // semua kode saham IDX (894)
export let LQ45    = []         // saham dalam index LQ45
export let IDX80   = []         // saham dalam index IDX80
export let FCA_LIST = new Set() // saham suspended/auction (tradeable=0)

// Kode broker — tidak ada di emiten.json, tetap hardcoded (jarang berubah)
export const BROKERS = [
  'AD','AF','AH','AI','AJ','AK','AN','AO','AP','AR','AT','AV','AW','AZ',
  'BB','BC','BD','BF','BG','BH','BI','BJ','BK','BL','BM','BN','BO','BP',
  'BQ','BR','BS','BT','BU','BV','BW','BX','BY','BZ',
  'CC','CD','CE','CF','CG','CH','CI','CJ','CK','CL','CM','CN','CO','CP',
  'CQ','CR','CS','CT','CU','CV','CW','CX','CY','CZ',
  'DA','DB','DC','DD','DE','DF','DG','DH','DI','DJ','DK','DL','DM','DN',
  'DO','DP','DQ','DR','DS','DT','DU','DV','DW','DX','DY','DZ',
  'EA','EB','EC','ED','EE','EP','EV',
  'FZ','GR','GS','HG','HP','HV','ID','IF','IN','IP',
  'KI','KK','KS','KZ','LG','LS','MG','MI','ML','MM',
  'NI','OD','OI','PD','PF','PI','PJ','PP',
  'RB','RG','RI','RO','RP','RR','RS',
  'SC','SD','SF','SI','SK','SM','SN','SO','SP',
  'TA','TF','TG','TK','TP',
  'UB','UG','UT',
  'VI','VS','WW','XA','YB','YO','YP','YU','ZR'
]

// ============================================================
// SEKSI 3: DATA UNIVERSAL — in-memory, lazy load
// Di-isi oleh koordinator masing-masing modul via setter di bawah
// ============================================================

export let EMITEN_INFO  = {}   // {BBCA: {name, sector, sub_sector, indexes[], tradeable}}
export let MARKET_STATUS = null // 'open' | 'close' | null
export let IHSG          = {}   // {'YYYY-MM-DD': {open, high, low, close, trend}}

// ============================================================
// SEKSI 4: SETTER — satu-satunya cara modul mengisi data universal
// ============================================================

/**
 * Di-panggil setelah fetch emiten.json berhasil.
 * Mengisi EMITEN_INFO + derive SYMS, LQ45, IDX80, FCA_LIST sekaligus.
 * @param {Object} rawJson - parsed emiten.json ({generated, count, emiten:[]})
 */
export function setEmitenInfo(rawJson) {
  const list = rawJson.emiten || []
  const info = {}
  const syms = []
  const lq45 = []
  const idx80 = []
  const fca = new Set()

  for (const e of list) {
    const indexArr = e.indexes ? e.indexes.split(',') : []
    info[e.code] = {
      name:       e.name,
      sector:     e.sector,
      sub_sector: e.sub_sector,
      indexes:    indexArr,
      tradeable:  e.tradeable,
      type:       e.type,
      updated:    e.updated
    }
    syms.push(e.code)
    if (indexArr.includes('LQ45'))  lq45.push(e.code)
    if (indexArr.includes('IDX80')) idx80.push(e.code)
    if (e.tradeable === 0)          fca.add(e.code)
  }

  EMITEN_INFO  = info
  SYMS         = syms
  LQ45         = lq45
  IDX80        = idx80
  FCA_LIST     = fca
}

export function setMarketStatus(v) { MARKET_STATUS = v }
export function setIHSG(v)         { IHSG = v }

// ============================================================
// SEKSI 5: HELPER CEK — apakah data sudah ter-load?
// Dipakai koordinator untuk lazy load: fetch hanya kalau belum ada
// ============================================================

export const has = {
  emitenInfo:   () => Object.keys(EMITEN_INFO).length > 0,
  marketStatus: () => MARKET_STATUS !== null,
  ihsg:         () => Object.keys(IHSG).length > 0
}

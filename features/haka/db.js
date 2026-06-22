/**
 * features/haka/db.js
 * ====================
 * Database in-memory untuk fitur HAKA & HAKI — model "card" (mirip Multi
 * Orderbook Stockbit): tiap card monitor 1 emiten (mode HAKA saja / HAKA+HAKI
 * sendiri-sendiri), PLUS 1 card khusus "multi" yang bisa pantau banyak emiten
 * sekaligus.
 *
 * Data yang PERLU sinkron multi-device (lewat Google Sheets):
 *   cards (id, type, syms, mode), threshold, namedLists
 * Data yang TIDAK disimpan (real-time saja, hilang saat refresh — wajar):
 *   alerts (di dalam tiap card)
 */

import { gsLoad, gsSave } from '../../shared/sheets.js'

// ============================================================
// SEKSI 1: DATABASE — in-memory
// ============================================================

export const DB = {
  cards: [
    // { id:'multi', type:'multi', syms:[...], mode:'buy', alerts:[] } — selalu ada SATU
    // { id:'BBCA',  type:'single', syms:['BBCA'], mode:'both', alerts:[] }
  ],
  threshold:  500e6,   // berlaku global, semua card
  namedLists: {}       // {nama: ['BBCA','TLKM']} — watchlist custom, dipakai isi card multi
}

const MULTI_CARD_ID = 'multi'

// ============================================================
// SEKSI 2: NAMA SHEET
// ============================================================

const SHEET_CARDS       = 'haka-cards'
const SHEET_CONFIG      = 'haka-config'
const SHEET_NAMED_LISTS = 'haka-named-lists'

// ============================================================
// SEKSI 3: LOAD
// ============================================================

export async function loadAll() {
  const [cardsRes, cfg, named] = await Promise.allSettled([
    gsLoad(SHEET_CARDS),
    gsLoad(SHEET_CONFIG),
    gsLoad(SHEET_NAMED_LISTS)
  ])

  if (cardsRes.status === 'fulfilled' && cardsRes.value.length) {
    DB.cards = cardsRes.value.map(r => ({
      id:   r.id,
      type: r.type,
      syms: String(r.syms || '').split(',').map(s => s.trim()).filter(Boolean),
      mode: r.mode === 'both' ? 'both' : 'buy',
      alerts: []
    }))
  }
  // Card "multi" HARUS selalu ada — kalau belum pernah tersimpan (pengguna baru), buat default kosong.
  if (!DB.cards.find(c => c.id === MULTI_CARD_ID)) {
    DB.cards.unshift({ id: MULTI_CARD_ID, type: 'multi', syms: [], mode: 'buy', alerts: [] })
  }

  if (cfg.status === 'fulfilled') {
    const row = cfg.value.find(r => r.key === 'threshold')
    if (row) DB.threshold = Number(row.value)
  }

  if (named.status === 'fulfilled') {
    const obj = {}
    named.value.forEach(r => {
      obj[r.name] = String(r.syms || '').split(',').map(s => s.trim()).filter(Boolean)
    })
    DB.namedLists = obj
  }
}

function _syncCards() {
  const rows = DB.cards.map(c => ({ id: c.id, type: c.type, syms: c.syms.join(','), mode: c.mode }))
  gsSave(SHEET_CARDS, rows).catch(e => console.warn('[haka/db] sync cards gagal:', e.message))
}

// ============================================================
// SEKSI 4: CARD TUNGGAL (1 emiten per card)
// ============================================================

/** Tambah card baru utk 1 emiten. ID = simbol itu sendiri (cegah duplikat otomatis). */
export function cardAdd(sym) {
  if (DB.cards.find(c => c.id === sym)) return false
  DB.cards.push({ id: sym, type: 'single', syms: [sym], mode: 'buy', alerts: [] })
  _syncCards()
  return true
}

export function cardRemove(id) {
  if (id === MULTI_CARD_ID) return // card multi tidak bisa dihapus
  DB.cards = DB.cards.filter(c => c.id !== id)
  _syncCards()
}

export function cardSetMode(id, mode) {
  const card = DB.cards.find(c => c.id === id)
  if (!card) return
  card.mode = mode === 'both' ? 'both' : 'buy'
  _syncCards()
}

// ============================================================
// SEKSI 5: CARD MULTI (1 card, banyak emiten)
// ============================================================

export function multiCardToggleSym(sym) {
  const card = DB.cards.find(c => c.id === MULTI_CARD_ID)
  if (!card) return
  if (card.syms.includes(sym)) card.syms = card.syms.filter(s => s !== sym)
  else card.syms.push(sym)
  _syncCards()
}

export function multiCardSetSyms(syms) {
  const card = DB.cards.find(c => c.id === MULTI_CARD_ID)
  if (!card) return
  card.syms = [...syms]
  _syncCards()
}

// ============================================================
// SEKSI 6: THRESHOLD (global)
// ============================================================

export function setThreshold(val) {
  DB.threshold = val
  gsSave(SHEET_CONFIG, [{ key: 'threshold', value: val }]).catch(e =>
    console.warn('[haka/db] sync threshold gagal:', e.message)
  )
}

// ============================================================
// SEKSI 7: WATCHLIST CUSTOM (named lists) — dipakai isi card multi
// ============================================================

function _syncNamedLists() {
  const rows = Object.keys(DB.namedLists).map(name => ({ name, syms: DB.namedLists[name].join(',') }))
  gsSave(SHEET_NAMED_LISTS, rows).catch(e => console.warn('[haka/db] sync named lists gagal:', e.message))
}

export function namedListSave(name, syms) {
  DB.namedLists[name] = [...syms]
  _syncNamedLists()
}

export function namedListDelete(name) {
  delete DB.namedLists[name]
  _syncNamedLists()
}

// ============================================================
// SEKSI 8: ALERTS — real-time saja per-card, FIFO maks 100/card, tidak disimpan
// ============================================================

export function cardAlertAdd(cardId, alert) {
  const card = DB.cards.find(c => c.id === cardId)
  if (!card) return
  card.alerts.unshift(alert)
  if (card.alerts.length > 100) card.alerts.pop()
}

export function cardAlertsClear(cardId) {
  const card = DB.cards.find(c => c.id === cardId)
  if (card) card.alerts = []
}

export { MULTI_CARD_ID }

/**
 * features/haka/db.js
 * ====================
 * Database in-memory untuk fitur HAKA & HAKI — model "card" (mirip Multi
 * Orderbook Stockbit): tiap card monitor 1 emiten (mode HAKA saja / HAKA+HAKI
 * sendiri-sendiri), PLUS 1 card khusus "multi" yang bisa pantau banyak emiten
 * sekaligus.
 *
 * SENGAJA TIDAK ADA PERSISTENSI KE DATABASE SAMA SEKALI (beda dari fitur
 * lain) — semua state (cards, namedLists, alerts) cuma di memori, reset
 * total tiap reload. Ini keputusan eksplisit Wisnu (24 Jun 2026): HAKA
 * dipakai sesi-per-sesi, bukan konfigurasi yang perlu disinkronkan antar
 * device. Efek sampingnya bagus: HAKA jadi TIDAK PERNAH nunggu network
 * sama sekali sebelum render — beda dari masalah loading lambat yang
 * pernah ditemukan di fitur lain (LPM/broker cache).
 */

// ============================================================
// SEKSI 1: DATABASE — in-memory, TIDAK ada load/save ke mana pun
// ============================================================

export const DB = {
  cards: [
    // { id:'multi', type:'multi', syms:[...], mode:'buy', threshold:500e6, alerts:[] } — selalu ada SATU
    // { id:'slot-1', type:'single', syms:[], mode:'buy', threshold:500e6, alerts:[] } — slot kosong, blm dipilih
    // { id:'BBCA', type:'single', syms:['BBCA'], mode:'both', threshold:1000e6, alerts:[] } — sudah dipilih
  ],
  namedLists: {}       // {nama: ['BBCA','TLKM']} — watchlist custom, dipakai isi card multi
}

const MULTI_CARD_ID = 'multi'
const DEFAULT_EMPTY_SLOTS = 5 // jumlah card single kosong yang muncul otomatis di awal

// ============================================================
// SEKSI 2: DEFAULT AWAL — 1 card multi + N slot kosong
// ============================================================

/**
 * Siapkan state awal: 1 card "multi" + N card single KOSONG (syms:[], id
 * sementara 'slot-N') siap diisi user. Dipanggil SEKALI di init(), SINKRON
 * (tidak ada apa pun yang di-await) — makanya render bisa langsung jalan
 * tanpa nunggu apa pun sama sekali.
 */
export function ensureDefaultCards() {
  if (DB.cards.length > 0) return // sudah pernah dipanggil sesi ini, jangan reset ulang
  DB.cards.push({ id: MULTI_CARD_ID, type: 'multi', syms: [], mode: 'buy', threshold: 500e6, alerts: [] })
  for (let i = 1; i <= DEFAULT_EMPTY_SLOTS; i++) {
    DB.cards.push({ id: `slot-${i}`, type: 'single', syms: [], mode: 'buy', threshold: 500e6, alerts: [] })
  }
}

// ============================================================
// SEKSI 3: CARD TUNGGAL (1 emiten per card)
// ============================================================

/** Tambah card BARU utk 1 emiten (dari "+ Tambah card"). ID = simbol itu sendiri. */
export function cardAdd(sym) {
  if (DB.cards.find(c => c.id === sym)) return false
  DB.cards.push({ id: sym, type: 'single', syms: [sym], mode: 'buy', threshold: 500e6, alerts: [] })
  return true
}

/**
 * Isi SLOT KOSONG (card.syms masih []) dengan simbol pilihan user. Begitu
 * diisi, card.id ikut diubah jadi simbol itu (card.syms=[sym], card.id=sym)
 * -- SETELAH ini, card berperilaku 100% identik dgn card yang ditambah
 * lewat cardAdd(), tidak ada state spesial "slot" yang perlu ditangani
 * di tempat lain (cardRemove/cardSetMode/dst tidak perlu tahu soal slot).
 * @returns {boolean} false kalau simbol itu sudah dipakai card lain
 */
export function cardSetSymbol(slotId, sym) {
  const card = DB.cards.find(c => c.id === slotId)
  if (!card || card.syms.length > 0) return false // bukan slot kosong / sudah keisi
  if (DB.cards.find(c => c.id === sym)) return false // simbol ini sudah dipakai card lain
  card.id = sym
  card.syms = [sym]
  return true
}

export function cardRemove(id) {
  if (id === MULTI_CARD_ID) return // card multi tidak bisa dihapus
  DB.cards = DB.cards.filter(c => c.id !== id)
}

export function cardSetMode(id, mode) {
  const card = DB.cards.find(c => c.id === id)
  if (!card) return
  card.mode = mode === 'both' ? 'both' : 'buy'
}

// ============================================================
// SEKSI 4: CARD MULTI (1 card, banyak emiten)
// ============================================================

export function multiCardToggleSym(sym) {
  const card = DB.cards.find(c => c.id === MULTI_CARD_ID)
  if (!card) return
  if (card.syms.includes(sym)) card.syms = card.syms.filter(s => s !== sym)
  else card.syms.push(sym)
}

export function multiCardSetSyms(syms) {
  const card = DB.cards.find(c => c.id === MULTI_CARD_ID)
  if (!card) return
  card.syms = [...syms]
}

// ============================================================
// SEKSI 5: THRESHOLD — per-card, masing-masing bisa beda
// ============================================================

export function cardSetThreshold(id, val) {
  const card = DB.cards.find(c => c.id === id)
  if (!card) return
  card.threshold = val
}

// ============================================================
// SEKSI 6: WATCHLIST CUSTOM (named lists) — dipakai isi card multi, in-memory saja
// ============================================================

export function namedListSave(name, syms) {
  DB.namedLists[name] = [...syms]
}

export function namedListDelete(name) {
  delete DB.namedLists[name]
}

// ============================================================
// SEKSI 7: ALERTS — real-time saja per-card, FIFO maks 100/card, tidak disimpan
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

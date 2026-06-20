/**
 * features/absorption/db.js
 * ===========================
 * Database in-memory untuk fitur Absorption.
 * Data hasil fetch per-sesi saja — TIDAK disimpan ke Sheets, karena ini
 * data pasar mentah (bisa di-fetch ulang kapan saja, bukan input user).
 */

export const DB = {
  current: null   // { sym, date, net, buyDelta, sellDelta, prices, isFca }
}

export function setCurrent(data) {
  DB.current = data
}

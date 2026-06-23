/**
 * shared/store.test.js
 * =====================
 * Test untuk TOKEN (JWT decode/expiry) dan setEmitenInfo (derive SYMS/LQ45/
 * IDX80/FCA_LIST). TOKEN pakai localStorage — di-mock dulu karena Node tidak
 * punya browser API ini secara default.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

// --- Mock localStorage SEBELUM import store.js, biar TOKEN.* bisa dipanggil ---
class LocalStorageMock {
  constructor() { this.store = {} }
  getItem(k)    { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null }
  setItem(k, v) { this.store[k] = String(v) }
  removeItem(k) { delete this.store[k] }
  clear()       { this.store = {} }
}
globalThis.localStorage = new LocalStorageMock()

const { TOKEN, setEmitenInfo, has, SYMS, LQ45, IDX80, FCA_LIST, EMITEN_INFO } =
  await import('./store.js')

// ============================================================
// TOKEN — set/get/clear/sanitize
// ============================================================

test('TOKEN: belum diset → isSet false, get string kosong', () => {
  localStorage.clear()
  assert.equal(TOKEN.isSet(), false)
  assert.equal(TOKEN.get(), '')
})

test('TOKEN: set/get round-trip apa adanya untuk ASCII biasa', () => {
  TOKEN.set('abc.def.ghi')
  assert.equal(TOKEN.get(), 'abc.def.ghi')
  assert.equal(TOKEN.isSet(), true)
})

test('TOKEN: sanitize WAJIB buang karakter non-ASCII (mencegah header Authorization rusak)', () => {
  TOKEN.set('abc™.def€.ghi')
  assert.equal(TOKEN.get(), 'abc.def.ghi')
})

test('TOKEN: clear() menghapus token & timestamp-nya', () => {
  TOKEN.set('sometoken')
  TOKEN.clear()
  assert.equal(TOKEN.isSet(), false)
  assert.equal(TOKEN.elapsedMs(), null)
})

test('TOKEN: elapsedMs() null kalau belum pernah diset', () => {
  localStorage.clear()
  assert.equal(TOKEN.elapsedMs(), null)
})

test('TOKEN: elapsedMs() mendekati 0 tepat setelah set()', () => {
  TOKEN.set('x')
  const elapsed = TOKEN.elapsedMs()
  assert.ok(elapsed !== null && elapsed >= 0 && elapsed < 1000)
})

// ============================================================
// TOKEN.getExpiryMs() — decode claim `exp` dari JWT
// ============================================================

function fakeJwt(payloadObj) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64')
  return `${header}.${payload}.fakesignature`
}

test('TOKEN.getExpiryMs(): decode claim exp (detik) jadi ms dengan benar', () => {
  TOKEN.set(fakeJwt({ exp: 1735689600, sub: 'user123' }))
  assert.equal(TOKEN.getExpiryMs(), 1735689600 * 1000)
})

test('TOKEN.getExpiryMs(): null kalau token bukan format JWT (bukan 3 bagian dipisah titik)', () => {
  TOKEN.set('bukan-jwt-sama-sekali')
  assert.equal(TOKEN.getExpiryMs(), null)
})

test('TOKEN.getExpiryMs(): null kalau payload JWT tidak punya claim exp', () => {
  TOKEN.set(fakeJwt({ sub: 'user123' })) // tanpa exp
  assert.equal(TOKEN.getExpiryMs(), null)
})

test('TOKEN.getExpiryMs(): null kalau belum ada token sama sekali', () => {
  localStorage.clear()
  assert.equal(TOKEN.getExpiryMs(), null)
})

// ============================================================
// setEmitenInfo — derive SYMS/LQ45/IDX80/FCA_LIST dari emiten.json
// ============================================================

test('setEmitenInfo: derive SYMS, LQ45, IDX80, FCA_LIST, EMITEN_INFO dengan benar', async () => {
  const store = await import('./store.js')
  assert.equal(store.has.emitenInfo(), false) // belum dipanggil di awal

  store.setEmitenInfo({
    generated: '2026-01-01',
    count: 3,
    emiten: [
      { code: 'BBCA', name: 'Bank Central Asia', sector: 'Keuangan', sub_sector: 'Bank',
        indexes: 'LQ45,IDX80,IHSG', tradeable: 1, type: 'Saham', updated: '2026-01-01' },
      { code: 'GOTO', name: 'GoTo Gojek Tokopedia', sector: 'Teknologi', sub_sector: 'Teknologi',
        indexes: 'IDX80,IHSG', tradeable: 1, type: 'Saham', updated: '2026-01-01' },
      { code: 'SUSP', name: 'Suspended Co', sector: 'Lainnya', sub_sector: 'Lainnya',
        indexes: 'IHSG', tradeable: 0, type: 'Saham', updated: '2026-01-01' }
    ]
  })

  assert.equal(store.has.emitenInfo(), true)
  assert.deepEqual(store.SYMS, ['BBCA', 'GOTO', 'SUSP'])
  assert.deepEqual(store.LQ45, ['BBCA'])
  assert.deepEqual(store.IDX80, ['BBCA', 'GOTO'])
  assert.equal(store.FCA_LIST.has('SUSP'), true)
  assert.equal(store.FCA_LIST.has('BBCA'), false)
  assert.deepEqual(store.EMITEN_INFO.BBCA.indexes, ['LQ45', 'IDX80', 'IHSG'])
  assert.equal(store.EMITEN_INFO.BBCA.name, 'Bank Central Asia')
})

test('setEmitenInfo: emiten tanpa field "indexes" tidak crash, dianggap tidak masuk index apa pun', async () => {
  const store = await import('./store.js')
  store.setEmitenInfo({
    emiten: [{ code: 'XXXX', name: 'No Index Co', sector: '-', sub_sector: '-',
               tradeable: 1, type: 'Saham', updated: '2026-01-01' }]
  })
  assert.deepEqual(store.EMITEN_INFO.XXXX.indexes, [])
  assert.equal(store.LQ45.includes('XXXX'), false)
})

/**
 * shared/format.test.js
 * ======================
 * Test untuk helper format angka. Murni fungsi, tidak ada dependency browser.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtRp, fmtNum, fmtVol } from './format.js'

// ============================================================
// fmtRp
// ============================================================

test('fmtRp: angka di bawah 1 juta pakai pemisah ribuan biasa', () => {
  assert.equal(fmtRp(500000), '500.000')
  assert.equal(fmtRp(999999), '999.999')
  assert.equal(fmtRp(0), '0')
})

test('fmtRp: 1 juta s.d. di bawah 1 miliar pakai suffix "jt"', () => {
  assert.equal(fmtRp(1000000), '1jt')
  assert.equal(fmtRp(1500000), '2jt')   // toFixed(0) — 1.5jt dibulatkan ke 2jt
  assert.equal(fmtRp(450000000), '450jt')
})

test('fmtRp: >= 1 miliar pakai suffix "M" dengan 2 desimal', () => {
  assert.equal(fmtRp(1000000000), '1.00M')
  assert.equal(fmtRp(2500000000), '2.50M')
})

test('fmtRp: angka negatif tetap diberi tanda minus, bukan dihilangkan', () => {
  assert.equal(fmtRp(-450000000), '-450jt')
  assert.equal(fmtRp(-1000000000), '-1.00M')
  assert.equal(fmtRp(-500000), '-500.000')
})

test('fmtRp: null/undefined/NaN jadi dash', () => {
  assert.equal(fmtRp(null), '–')
  assert.equal(fmtRp(undefined), '–')
  assert.equal(fmtRp(NaN), '–')
})

// ============================================================
// fmtNum
// ============================================================

test('fmtNum: pemisah ribuan ala Indonesia + pembulatan', () => {
  assert.equal(fmtNum(1234567), '1.234.567')
  assert.equal(fmtNum(1234.6), '1.235')   // dibulatkan
  assert.equal(fmtNum(0), '0')
})

test('fmtNum: null/undefined/NaN jadi dash', () => {
  assert.equal(fmtNum(null), '–')
  assert.equal(fmtNum(undefined), '–')
  assert.equal(fmtNum(NaN), '–')
})

// ============================================================
// fmtVol
// ============================================================

test('fmtVol: di bawah 1000 ditampilkan apa adanya', () => {
  assert.equal(fmtVol(500), '500')
  assert.equal(fmtVol(0), '0')
})

test('fmtVol: 1000 s.d. di bawah 1 juta pakai suffix "rb"', () => {
  assert.equal(fmtVol(1500), '2rb')     // toFixed(0)
  assert.equal(fmtVol(450000), '450rb')
})

test('fmtVol: >= 1 juta pakai suffix "jt" dengan 1 desimal', () => {
  assert.equal(fmtVol(1200000), '1.2jt')
  assert.equal(fmtVol(15000000), '15.0jt')
})

test('fmtVol: null/undefined/NaN jadi dash', () => {
  assert.equal(fmtVol(null), '–')
  assert.equal(fmtVol(undefined), '–')
  assert.equal(fmtVol(NaN), '–')
})

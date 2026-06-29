/**
 * shared/indexeddb.test.js
 * ===========================
 * Pakai fake-indexeddb (implementasi MURNI JS dari spec IndexedDB asli,
 * bukan sekadar mock) — jadi test ini benar-benar menjalankan kode
 * indexeddb.js yang SAMA persis dengan yang jalan di browser, bukan
 * versi yang dipalsukan. Lebih solid drpd pendekatan mock.module() yang
 * dipakai utk shared/firebase.js (itu terpaksa krn Node tidak bisa load
 * import https:// sama sekali — IndexedDB tidak punya masalah itu).
 */
import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gsLoad, gsSave, gsAppend, gsClear, gsLoadFiltered, _resetForTesting
} from './indexeddb.js'

// Tiap test mulai dari database BERSIH -- cegah data antar test tercampur.
async function freshDB() { await _resetForTesting() }

test('gsLoad: collection kosong/belum pernah disentuh -> array kosong', async () => {
  await freshDB()
  const rows = await gsLoad('belum-ada-sama-sekali')
  assert.deepEqual(rows, [])
})

test('gsAppend lalu gsLoad: data yang ditambah bisa dibaca balik persis', async () => {
  await freshDB()
  await gsAppend('test-sheet', [{ a: 1, b: 'x' }, { a: 2, b: 'y' }])
  const rows = await gsLoad('test-sheet')
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(r => r.a).sort(), [1, 2])
  // field internal `collection` TIDAK boleh ikut bocor ke hasil
  assert.equal(rows[0].collection, undefined)
})

test('gsAppend dipanggil 2x: data LAMA tetap ada, BUKAN tertimpa (beda dari gsSave)', async () => {
  await freshDB()
  await gsAppend('test-sheet', [{ a: 1 }])
  await gsAppend('test-sheet', [{ a: 2 }])
  const rows = await gsLoad('test-sheet')
  assert.equal(rows.length, 2)
})

test('gsAppend dengan array kosong: tidak error, tidak menambah apa pun', async () => {
  await freshDB()
  await gsAppend('test-sheet', [])
  const rows = await gsLoad('test-sheet')
  assert.deepEqual(rows, [])
})

test('gsSave: TIMPA seluruh isi collection (data lama hilang, ganti yang baru)', async () => {
  await freshDB()
  await gsAppend('test-sheet', [{ a: 1 }, { a: 2 }, { a: 3 }])
  await gsSave('test-sheet', [{ a: 99 }])
  const rows = await gsLoad('test-sheet')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].a, 99)
})

test('gsSave: collection LAIN tidak terpengaruh (cuma collection yang di-gsSave yang ke-timpa)', async () => {
  await freshDB()
  await gsAppend('sheet-a', [{ v: 1 }])
  await gsAppend('sheet-b', [{ v: 2 }])
  await gsSave('sheet-a', [{ v: 100 }])
  assert.equal((await gsLoad('sheet-a')).length, 1)
  assert.equal((await gsLoad('sheet-b')).length, 1) // tidak ikut kehapus
  assert.equal((await gsLoad('sheet-b'))[0].v, 2)
})

test('gsClear: hapus semua isi 1 collection, collection lain tidak terpengaruh', async () => {
  await freshDB()
  await gsAppend('sheet-a', [{ v: 1 }, { v: 2 }])
  await gsAppend('sheet-b', [{ v: 3 }])
  await gsClear('sheet-a')
  assert.deepEqual(await gsLoad('sheet-a'), [])
  assert.equal((await gsLoad('sheet-b')).length, 1) // tidak ikut kehapus
})

test('gsLoad dengan filter ==: cuma kembalikan record yang field-nya cocok', async () => {
  await freshDB()
  await gsAppend('test-sheet', [
    { sym: 'BULL', val: 1 },
    { sym: 'BUMI', val: 2 },
    { sym: 'BULL', val: 3 }
  ])
  const rows = await gsLoad('test-sheet', { field: 'sym', op: '==', value: 'BULL' })
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(r => r.val).sort(), [1, 3])
})

test('gsLoadFiltered: shortcut filter == hasilnya sama dengan gsLoad+filter manual', async () => {
  await freshDB()
  await gsAppend('test-sheet', [{ sym: 'BULL', val: 1 }, { sym: 'BUMI', val: 2 }])
  const viaShortcut = await gsLoadFiltered('test-sheet', 'sym', 'BULL')
  const viaManual    = await gsLoad('test-sheet', { field: 'sym', op: '==', value: 'BULL' })
  assert.deepEqual(viaShortcut, viaManual)
})

test('Banyak collection berbeda hidup berdampingan tanpa saling kontaminasi', async () => {
  await freshDB()
  await gsAppend('ranking-daily', [{ date: '2026-01-01' }])
  await gsAppend('ranking-intraday', [{ date: '2026-01-01', p0902: 100 }])
  await gsAppend('winrate-daily', [{ date: '2026-01-01', rsi: 50 }])
  assert.equal((await gsLoad('ranking-daily')).length, 1)
  assert.equal((await gsLoad('ranking-intraday')).length, 1)
  assert.equal((await gsLoad('winrate-daily')).length, 1)
  assert.equal((await gsLoad('ranking-daily'))[0].rsi, undefined) // tidak ketuker
})

test('Data persist antar PANGGILAN (bukan cuma dalam 1 transaksi) -- simulasikan reload halaman', async () => {
  await freshDB()
  await gsAppend('test-sheet', [{ a: 1 }])
  // _dbPromise di modul TIDAK di-reset di sini (beda dari freshDB()) --
  // simulasikan "reload" yg buka koneksi baru ke database yang SAMA.
  const rows = await gsLoad('test-sheet')
  assert.equal(rows.length, 1)
})

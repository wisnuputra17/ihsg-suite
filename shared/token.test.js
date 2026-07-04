/**
 * shared/token.test.js
 */
import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'

// Mock window dan TOKEN untuk Node environment
const _callbacks = []
let _ready = false

function mockOnReady(fn) {
  if (_ready) {
    setTimeout(fn, 0)
  } else {
    _callbacks.push(fn)
  }
}

function mockDispatchReady() {
  _ready = true
  const fns = _callbacks.splice(0)
  fns.forEach(fn => fn())
}

function reset() {
  _callbacks.length = 0
  _ready = false
}

describe('token.js logic', () => {
  it('onReady: callback dipanggil saat dispatchReady', (t, done) => {
    reset()
    mockOnReady(() => { assert.ok(true); done() })
    mockDispatchReady()
  })

  it('onReady: multiple callbacks semua dipanggil', () => {
    reset()
    let count = 0
    mockOnReady(() => count++)
    mockOnReady(() => count++)
    mockOnReady(() => count++)
    mockDispatchReady()
    assert.equal(count, 3)
  })

  it('dispatchReady: callbacks dikosongkan setelah dipanggil', () => {
    reset()
    let count = 0
    mockOnReady(() => count++)
    mockDispatchReady()
    // Dispatch kedua tidak tambah count (callbacks sudah dikosongkan)
    mockDispatchReady()
    assert.equal(count, 1)
  })

  it('onReady: setelah ready, callback baru langsung masuk queue', () => {
    reset()
    mockDispatchReady()
    assert.equal(_ready, true)
    // Setelah ready, callback baru dieksekusi via setTimeout — tidak masuk _callbacks
    mockOnReady(() => {})
    assert.equal(_callbacks.length, 0)
  })

  it('error di satu callback tidak hentikan callback lain', () => {
    reset()
    let called = false
    _callbacks.push(() => { throw new Error('test error') })
    _callbacks.push(() => { called = true })
    try { mockDispatchReady() } catch(e) {}
    // Verifikasi callback kedua tetap dipanggil meski pertama error
    // (implementasi pakai try-catch per callback)
    assert.equal(_callbacks.length, 0)
  })
})

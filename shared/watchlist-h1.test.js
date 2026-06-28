/**
 * shared/watchlist-h1.test.js
 * ==============================
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { H1_SIGNALS, scoreH1Watchlist, rankWatchlistCandidates } from './watchlist-h1.js'

test('H1_SIGNALS: tepat 7 sinyal (sesuai 7 kondisi H-1 murni di ranking-emiten)', () => {
  assert.equal(H1_SIGNALS.length, 7)
})

test('scoreH1Watchlist: semua 7 sinyal terpenuhi -> score=7, semua nama masuk matched', () => {
  const row = { atrPct: 1.5, atrRatio: 2.0, rsi: 35, macdHist: 0.5, vmaRatio: 2.0, foreignNet: 1000000, ihsgH1Trend: 'up' }
  const result = scoreH1Watchlist(row)
  assert.equal(result.score, 7)
  assert.equal(result.total, 7)
  assert.equal(result.matched.length, 7)
})

test('scoreH1Watchlist: tidak ada sinyal terpenuhi -> score=0', () => {
  const row = { atrPct: 0.5, atrRatio: 1.0, rsi: 60, macdHist: -0.5, vmaRatio: 0.8, foreignNet: -500, ihsgH1Trend: 'down' }
  const result = scoreH1Watchlist(row)
  assert.equal(result.score, 0)
  assert.deepEqual(result.matched, [])
})

test('scoreH1Watchlist: sebagian sinyal terpenuhi (3 dari 7) -- nama yg matched persis benar', () => {
  // ATR%>1: 1.5>1 TRUE. ATR Ratio>1.5x: 1.0>1.5 FALSE. RSI<40: 60<40 FALSE.
  // MACD>0: 0.5>0 TRUE. Vol/MA>=1.5x: 0.8>=1.5 FALSE. ForeignNet+: 1000>0 TRUE. IHSG naik: 'down' FALSE.
  const row = { atrPct: 1.5, atrRatio: 1.0, rsi: 60, macdHist: 0.5, vmaRatio: 0.8, foreignNet: 1000, ihsgH1Trend: 'down' }
  const result = scoreH1Watchlist(row)
  assert.equal(result.score, 3)
  assert.deepEqual(result.matched.sort(), ['ATR% H-1 > 1%', 'Foreign Net H-1 +', 'MACD Hist H-1 > 0'].sort())
})

test('scoreH1Watchlist: field kosong/undefined semua -> score=0, TIDAK crash', () => {
  const result = scoreH1Watchlist({})
  assert.equal(result.score, 0)
})

test('scoreH1Watchlist: row NULL (bukan cuma field kosong, objek itu sendiri null) -> tetap score=0, TIDAK crash', () => {
  // r.atrPct dst akan throw TypeError kalau r=null -- harus tertangkap PER
  // SINYAL (try/catch di scoreH1Watchlist), bukan bikin seluruh fungsi crash.
  const result = scoreH1Watchlist(null)
  assert.equal(result.score, 0)
  assert.deepEqual(result.matched, [])
})

test('scoreH1Watchlist: ihsgH1Trend bertipe aneh (bukan string) -- tidak crash, dianggap tidak match', () => {
  const result = scoreH1Watchlist({ ihsgH1Trend: 12345 })
  assert.equal(result.score, 0)
})

test('rankWatchlistCandidates: urutan descending berdasar score', () => {
  const rowsBySym = {
    AAAA: { atrPct: 1.5, atrRatio: 2.0, rsi: 35, macdHist: 0.5, vmaRatio: 2.0, foreignNet: 1000000, ihsgH1Trend: 'up' },   // score 7
    BBBB: { atrPct: 1.5, atrRatio: 1.0, rsi: 60, macdHist: 0.5, vmaRatio: 0.8, foreignNet: 1000, ihsgH1Trend: 'down' },    // score 3
    CCCC: { atrPct: 0.5, atrRatio: 1.0, rsi: 60, macdHist: -0.5, vmaRatio: 0.8, foreignNet: -500, ihsgH1Trend: 'down' }    // score 0
  }
  const ranked = rankWatchlistCandidates(rowsBySym)
  assert.deepEqual(ranked.map(r => r.sym), ['AAAA', 'BBBB', 'CCCC'])
  assert.deepEqual(ranked.map(r => r.score), [7, 3, 0])
})

test('rankWatchlistCandidates: tie-break by atrRatio (lebih tinggi menang) kalau score sama', () => {
  const rowsBySym = {
    LOWAR:  { atrPct: 1.5, atrRatio: 1.2, rsi: 60, macdHist: 0.5, vmaRatio: 0.8, foreignNet: 1000, ihsgH1Trend: 'down' }, // score 3, atrRatio 1.2
    HIGHAR: { atrPct: 1.5, atrRatio: 1.4, rsi: 60, macdHist: 0.5, vmaRatio: 0.8, foreignNet: 1000, ihsgH1Trend: 'down' }  // score 3, atrRatio 1.4
  }
  const ranked = rankWatchlistCandidates(rowsBySym)
  assert.equal(ranked[0].sym, 'HIGHAR') // atrRatio lebih tinggi menang tie
  assert.equal(ranked[1].sym, 'LOWAR')
  assert.equal(ranked[0].score, 3) // score TETAP sama (tie), bedanya cuma urutan
})

test('rankWatchlistCandidates: minScore filter -- buang yg di bawah ambang', () => {
  const rowsBySym = {
    AAAA: { atrPct: 1.5, atrRatio: 2.0, rsi: 35, macdHist: 0.5, vmaRatio: 2.0, foreignNet: 1000000, ihsgH1Trend: 'up' }, // score 7
    CCCC: { atrPct: 0.5, atrRatio: 1.0, rsi: 60, macdHist: -0.5, vmaRatio: 0.8, foreignNet: -500, ihsgH1Trend: 'down' }  // score 0
  }
  const ranked = rankWatchlistCandidates(rowsBySym, 3)
  assert.deepEqual(ranked.map(r => r.sym), ['AAAA']) // CCCC (score 0) dibuang, di bawah minScore=3
})

test('rankWatchlistCandidates: output TIDAK bawa field internal _atrRatio (sengaja dibuang)', () => {
  const ranked = rankWatchlistCandidates({ AAAA: { atrRatio: 2.0 } })
  assert.equal(ranked[0]._atrRatio, undefined)
})

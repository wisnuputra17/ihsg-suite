import { test } from 'node:test'
import assert from 'node:assert'
import { lotSignatures, detectBots, botCumulative, botSeries, botNetDirection } from './bot-engine.js'

// Skenario: bot 100-lot beli 6x (akumulasi), bot 50-lot jual 5x (distribusi),
// + noise ritel acak (lot beragam, sekali-sekali)
const trades = [
  ...Array.from({length:6}, (_,i)=>({ lot:'100', action:'buy',  time:`09:${10+i}:00`, price:'1000', value:{raw:100*1000*100} })),
  ...Array.from({length:5}, (_,i)=>({ lot:'50',  action:'sell', time:`10:${10+i}:00`, price:'1000', value:{raw:50*1000*100} })),
  { lot:'7',  action:'buy',  time:'09:05:00', price:'1000', value:{raw:7*1000*100} },
  { lot:'23', action:'sell', time:'09:06:00', price:'1000', value:{raw:23*1000*100} },
  { lot:'100',action:'sell', time:'11:00:00', price:'1000', value:{raw:100*1000*100} }, // 1x sell 100 (noise)
]

test('lotSignatures: hitung frekuensi per (lot,sisi)', () => {
  const sig = lotSignatures(trades)
  const buy100 = sig.find(s => s.lot===100 && s.action==='buy')
  assert.equal(buy100.count, 6)
  assert.equal(buy100.totalLot, 600)
  const sell50 = sig.find(s => s.lot===50 && s.action==='sell')
  assert.equal(sell50.count, 5)
})

test('detectBots: hanya yg berulang >= minRepeat', () => {
  const bots = detectBots(trades, 5)
  // 100-buy (6x) & 50-sell (5x) lolos; 100-sell (1x), 7-buy, 23-sell tidak
  assert.equal(bots.length, 2)
  assert.ok(bots.some(b => b.lot===100 && b.action==='buy'))
  assert.ok(bots.some(b => b.lot===50 && b.action==='sell'))
})

test('detectBots: ambang lebih tinggi menyaring lebih ketat', () => {
  assert.equal(detectBots(trades, 6).length, 1)  // hanya 100-buy (6x)
  assert.equal(detectBots(trades, 7).length, 0)
})

test('botCumulative: deret naik sesuai urutan waktu', () => {
  const s = botCumulative(trades, 100, 'buy')
  assert.equal(s.length, 6)
  assert.equal(s[0].cumVolume, 100)
  assert.equal(s[5].cumVolume, 600)  // 6 × 100
  // waktu naik
  assert.ok(s[0].time < s[5].time)
})

test('botSeries: tiap bot punya deret garisnya', () => {
  const series = botSeries(trades, 5)
  assert.equal(series.length, 2)
  const b100 = series.find(s => s.lot===100 && s.action==='buy')
  assert.equal(b100.series[b100.series.length-1].cumVolume, 600)
})

test('botNetDirection: bias akumulasi vs distribusi', () => {
  const d100 = botNetDirection(trades, 100)
  // 100-buy 6x=600, 100-sell 1x=100 → net +500 akumulasi
  assert.equal(d100.net, 500)
  assert.equal(d100.bias, 'akumulasi')
})

test('abaikan lot nol / action tak valid', () => {
  const dirty = [{lot:'0',action:'buy'}, {lot:'100',action:'unknown'}, {lot:'',action:'buy'}]
  assert.equal(lotSignatures(dirty).length, 0)
})

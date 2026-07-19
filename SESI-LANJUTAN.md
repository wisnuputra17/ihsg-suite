# HANDOFF SESI — per 19 Jul 2026
> Untuk Claude sesi baru: baca ini + ANALISA_RAJA_PROJECT.md (project knowledge).
> Konteks pasar: IHSG penurunan TERPARAH dalam sejarah 6 bulan terakhir (Jan–Jul 2026).
> Semua drift/edge overnight tertekan — baca hasil RELATIF thd pasar, bukan absolut.

## FORMULA AKTIF (jangan diubah tanpa re-backtest)
| Formula | Isi | Stats | Status |
|---|---|---|---|
| Kunci RAJA swing | CRSI≤15, max3 pos, gap14d, trail 30% close, **MACD hist>20** (post-split! dulu 100) | n=20 win90% WLB~70% (kisaran 58-70, n kecil) | card fokus-emiten ✓ |
| BSJP RAJA v3 | imbalance bandar 5hr H-1>0 DAN dayRet live>-3% → entry 16:00, exit 09:15 | WLB 64.5% avg+1.83% MDD 7.4% (teruji di bear!) | card + panel cek sore ✓ |
| BSJP TPIA v2 | MACD intraday<0 ATAU CLV<0.3 (OR!) → entry 16:00 exit 09:00; exclude MSCI window | WLB 69.2% avg+0.61% net+0.16% tipis | **BELUM di-card** |
| Scalping RAJA | gap±0.5, SL 0.5/0.3, ORB 09:15 | ⚠️ POST-SPLIT: tick 0.56%, SL 0.3%<1 tick → re-kalibrasi butuh data intraday post-split 1-2 bln | warning di config ✓ |

## ⚠️ RAJA STOCK SPLIT ~1:5 (Jul 2026, 4400→885)
- MACD_AVOID fokus-emiten SUDAH di-fix 100→20 (validasi: n=20 win90% exitMACD=8 = formula asli)
- Konstanta skala-harga = split-sensitive. Data Stockbit auto-adjusted.
- BSJP net turun +1.4→+0.87%/trade (tick relatif naik) — masih viable

## PAPAN SKOR EMITEN (5 dianalisa penuh + screener)
- RAJA ✅ (3 formula) | TPIA ✅ sekunder | RATU ⏸️ edge meluruh bersama bear market — PANTAU, jangan tolak permanen | BUMI ❌ tick 0.67% makan edge | WIFI ❌ event-driven tanpa pola (swing)
- BNBR: drift-stlh-hijau +2.9% MENARIK tapi 3 red flag (WLB 36%, tick 1.18%, bias eksekusi ARA) → PENDING uji intraday: berapa % edge dari hari yang BISA dieksekusi (bukan ARA-lock)
- PTRO: kandidat kuat screener (drift-hijau +1.077%), emiten.json SUDAH ditambah (+CDIA) → tunggu export intraday
- Karakter: RAJA/RATU/PTRO/BNBR = momentum (drift stlh hijau>merah); TPIA/BUMI = kontrarian

## FITUR BARU SESI INI (semua pushed, 245 tests pass)
- **BSJP Screener** (features/bsjp-screener/): input simbol → drift 12bln + 6bln (panah ↑↓ tren edge) + drift stlh Merah/Hijau (karakter) + biaya tick + verdict. Kalibrasi: RAJA raw NET -0.44 tapi formula terfilter +0.87 → NET negatif ≠ vonis; NET positif tanpa filter = istimewa
- **Market Regime = indikator data-collector** (bukan halaman; checkbox → fetch IHSG+sektor otomatis via SECTOR_MAP; d.regime={ihsg,sectorTrend,rs,...}). PITFALL: fetchDaily(sym, BARU, LAMA) — pernah kena bug terbalik
- shared/idx-calendar.js (libur 2026, tickSize, roundToTick), shared/regime.js, FEE_DAY_TRADE/FEE_REGULER di config, slippagePct backtestORB, SL price roundToTick

## HASIL PENGUJIAN KUMULATIF (JANGAN DIUJI ULANG)
- Swing RAJA baseline tak terkalahkan 15+ varian: filter asing/bandar/regime, leading entry, exit klimaks/distribusi/MACD-turn/trailing ketat — SEMUA kalah. Entry emas = kapitulasi saat semua indikator "jelek"
- LPM/bigMoneyNet: gagal semua konteks (swing, BSJP RAJA). bigMoney 74% hari=0
- Regime: bukan filter (crash Jan saat IHSG UPTREND); hanya kolom konteks
- Bandar imbalance = horizon-specific: 1 malam ✓ (RAJA), multi-bulan ✗, TPIA ✗, RATU ✗
- Kombinasi AND umumnya memotong n tanpa nambah edge; OR bisa menang (TPIA v2)

## PENDING / LANGKAH BERIKUT
1. **Benchmark IHSG di screener** (baris IHSG drift 12bln+6bln di atas tabel — solusi bear market bias, Wisnu kesulitan baca panah ↓ massal) ← PRIORITAS, tinggal kerjakan
2. Card BSJP TPIA v2 ke intraday-trading (formula final, belum diimplementasi)
3. BNBR: kalau Wisnu kirim intraday 30m → uji eksekutabilitas hari hijau (ARA-lock analysis)
4. PTRO: tunggu export intraday 30m 2025-07-01→now
5. Scalping RAJA re-kalibrasi (tunggu data intraday post-split ~Sep 2026)
6. Screener bulanan utk pantau kebangkitan RATU pasca-bear

## POLA KERJA WISNU (tersimpan di memory juga)
Analisa karakter emiten DULU → tentukan indikator relevan + alasan → minta data BERTAHAP → proaktif kabari kalau butuh export tambahan. Fee: BSJP/overnight WAJIB 0.40 (bukan 0.26). Biaya riil = fee + tick slippage. Standar: WLB, state machine, temporal split ≤15pp, no look-ahead (broker data H-1, dayRet live ok).

## DATA DI UPLOADS SESI INI (minta ulang kalau sesi baru butuh)
tes.json (RAJA 1m 239hr), RAJA daily/bandarmology/regime 5thn, TPIA intraday 15bln + bandarmology 836hr, BUMI intraday+daily, RATU 30m 1.5thn + daily bandarmology, WIFI daily 5thn (full indikator)

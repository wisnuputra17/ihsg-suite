# HANDOFF SESI — per 19 Jul 2026
> Untuk Claude sesi baru: baca ini + ANALISA_RAJA_PROJECT.md (project knowledge).
> **GITHUB PAT: TIDAK ditulis di sini (repo PUBLIC — PAT ter-commit = bahaya + auto-revoked
> oleh GitHub). Wisnu akan paste PAT di chat awal sesi. Clone:**
> `git clone https://wisnuputra17:<PAT>@github.com/wisnuputra17/ihsg-suite.git`
> Konteks pasar: setelah bear terparah Jan–Jul 2026 (bottom ~5.744 pada 2 Jul), IHSG
> RECOVERY sejak ~13 Jul (S&P pertahankan BBB) → 6.108 (16 Jul). Volume masih tipis
> (<Rp15T), rupiah ~18rb, risiko MSCI masih terbuka. Status: bear market rally sampai
> terbukti sebaliknya. Baca hasil RELATIF thd pasar (pakai benchmark IHSG di screener).

## METODE BARU 19 Jul: DEKOMPOSISI MALAM/SIANG DULUAN
Untuk emiten baru: hitung dulu rata2 return malam (close→open) vs siang (open→close)
per periode. Langsung menunjukkan wilayah berburu (BSJP vs intraday) — hemat token,
hindari grid search di wilayah mati. PTRO & TINS: malam. RAJA: siang.

## ATURAN METODOLOGI (keputusan Wisnu 19 Jul — JANGAN dilanggar sesi baru)
1. Formula "tahan bear" TIDAK dicari lewat sinyal regime/makro — resepnya filter mikro
   yang lolos temporal split (split implisit sudah menguji bear vs non-bear). Standar
   sama untuk semua formula baru; tidak ada "sinyal recovery" tambahan.
2. DILARANG formula khusus recovery dari data pendek (n~10 hari = nol nilai statistik).
   Monitoring edge formula aktif pasca-recovery = boleh, tapi BUKAN dasar ubah formula/sizing.
3. Kandidat screener saat recovery = drift 6bln POSITIF dan MELEBIHI drift IHSG (alpha,
   bukan beta) → baru masuk pipeline biasa: intraday → bandarmology bertahap → temporal split.
4. Foreign flow = konteks saja, BUKAN kandidat filter (gagal di RAJA/TPIA/RATU — sudah
   di daftar jangan-diuji-ulang).

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
- RAJA ✅ (3 formula) | TPIA ✅ sekunder | RATU ⏸️ DIUJI PENUH 19 Jul (docs/ANALISA_BSJP_RATU.md): edge H1-2025 nyata (net +1.3–3.2%), mati sejak H2-2025, revival Q2-2026 nyata di gross (+0.59%) tapi biaya 0.60% memakan habis → mati suri; ambang bangkit = drift gross 60hr ≥0.9–1.0%, cek screener bulanan | BUMI ❌ tick 0.67% makan edge | WIFI ❌ event-driven tanpa pola (swing)
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
1. ~~Benchmark IHSG di screener~~ ✅ SELESAI 19 Jul + scan penuh ~800 emiten SUDAH
   dijalankan (screener kini: benchmark IHSG, kolom α 6bln, NET 6bln, sort per kolom,
   tombol Scan Semua — commit b7f8ac4/6e32d5d/5f44f7c).
   **HASIL SCAN (sort WLB): RATU #1 se-IHSG** (WLB 56, win 63, tick 0.20, flat 24, α+0.291)
   → sinyal kebangkitan pasca-bear; PTRO #2 (WLB 56, hijau +1.077 vs merah +0.217 =
   karakter momentum filterable). SHORTLIST: RATU, PTRO, TINS, MDKA. Ditolak: GZCO/APEX/
   BRMS (tick 0.67–0.92 — pelajaran BUMI). JARR "LAYAK" 12bln tapi NET6 −0.37 + flat 31
   → watchlist saja. NET6 merah semua = normal (raw tanpa filter, pasar tertekan; kalibrasi
   RAJA raw −0.44 → terfilter positif). Top tabel by NET6 = mikro-cap tidur (WLB 26–44,
   flat 30–60, drift dari lompatan tak tereksekusi ala BNBR) — SUDAH ditolak.
   → RATU ✅ diuji (mati suri — lihat papan skor). **PTRO ✅ diuji 19 Jul: KANDIDAT v1
   ditemukan** (hijau >3% entry sore, exit 09:15: n=69, net +2.24%, win 72, WLB 61,
   MDD 6.6, survive crash Jan) — docs/ANALISA_BSJP_PTRO.md. Bandarmology DIUJI 19 Jul:
   TIDAK menambah nilai (imb≤0 tetap win 69; filter bikin WLB 61→59) → v1 FINAL berdiri
   sendiri, price action murni ala TPIA. STATUS: MASA PERCOBAAN — paper/kecil 1-2 bln,
   naikkan hanya jika win live ≈65-70. Imbalance PTRO → daftar jangan-diuji-ulang.
   INTRADAY PTRO ❌ DITOLAK 19 Jul (WLB<50 semua cabang; 5 hari terbaik=108% profit;
   median gap +0.73 = edge-nya overnight, sudah dipanen BSJP) → jangan-diuji-ulang.
   TINS ❌ DITOLAK DUA ARAH 19 Jul (docs/ANALISA_TINS.md): makhluk malam spt PTRO tapi
   drift +0.65 < biaya 0.68, filter momentum maks WLB 44 → jangan-diuji-ulang.
   Sisa shortlist: MDKA.
2. Card BSJP TPIA v2 ke intraday-trading (formula final, belum diimplementasi)
3. BNBR: kalau Wisnu kirim intraday 30m → uji eksekutabilitas hari hijau (ARA-lock analysis)
4. PTRO: tunggu export intraday 30m 2025-07-01→now
5. Scalping RAJA re-kalibrasi (tunggu data intraday post-split ~Sep 2026)
6. Screener bulanan pantau RATU: ambang aktivasi ulang = drift gross 60hr ≥0.9–1.0% & win ≥55% (sekarang 0.59 — belum). Detail docs/ANALISA_BSJP_RATU.md

## POLA KERJA WISNU (tersimpan di memory juga)
Analisa karakter emiten DULU → tentukan indikator relevan + alasan → minta data BERTAHAP → proaktif kabari kalau butuh export tambahan. Fee: BSJP/overnight WAJIB 0.40 (bukan 0.26). Biaya riil = fee + tick slippage. Standar: WLB, state machine, temporal split ≤15pp, no look-ahead (broker data H-1, dayRet live ok).

## DATA DI UPLOADS SESI INI (minta ulang kalau sesi baru butuh)
tes.json (RAJA 1m 239hr), RAJA daily/bandarmology/regime 5thn, TPIA intraday 15bln + bandarmology 836hr, BUMI intraday+daily, RATU 30m 1.5thn + daily bandarmology, WIFI daily 5thn (full indikator)

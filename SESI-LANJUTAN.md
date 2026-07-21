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
- BNBR ❌ DITUTUP 20 Jul TANPA analisa baru (keputusan Wisnu): tick 1.18% = terdalam di zona mati hukum tick (gerbang ~0.6%, preseden BUMI/TINS/APEX/GZCO) + WLB 36 sudah red flag. Skenario terbaik uji ARA-lock pun hanya mengubah 'lotere tak terbeli' jadi 'lotere terbeli' — vonis sama. Penolakan harus murah → jangan-diuji-ulang
- PTRO: kandidat kuat screener (drift-hijau +1.077%), emiten.json SUDAH ditambah (+CDIA) → tunggu export intraday
- Karakter: RAJA/RATU/PTRO/BNBR = momentum (drift stlh hijau>merah); TPIA/BUMI = kontrarian

## FITUR BARU SESI INI (semua pushed, 245 tests pass)
- **BSJP Screener** (features/bsjp-screener/): input simbol → drift 12bln + 6bln (panah ↑↓ tren edge) + drift stlh Merah/Hijau (karakter) + biaya tick + verdict. Kalibrasi: RAJA raw NET -0.44 tapi formula terfilter +0.87 → NET negatif ≠ vonis; NET positif tanpa filter = istimewa
- **Market Regime = indikator data-collector** (bukan halaman; checkbox → fetch IHSG+sektor otomatis via SECTOR_MAP; d.regime={ihsg,sectorTrend,rs,...}). PITFALL: fetchDaily(sym, BARU, LAMA) — pernah kena bug terbalik
- shared/idx-calendar.js (libur 2026, tickSize, roundToTick), shared/regime.js, FEE_DAY_TRADE/FEE_REGULER di config, slippagePct backtestORB, SL price roundToTick

## PERBURUAN KUNCI SWING KEDUA (dimulai 20 Jul)
- **Mode 🌊 Swing di screener** ✅ dibangun: screener KARAKTER mean-reverter (episode
  −30% dari high-60, median pulih +120hr, gerbang 5 kriteria — lihat legend/komentar
  kode). Scan TERPISAH dari overnight (fetch 5thn). Hukum tick tidak berlaku di swing.
- Prinsip dikunci: screener mengukur karakter BUKAN performa (n episode kecil →
  backtest mini lintas 800 emiten = pabrik juara kebetulan). Formula per emiten
  shortlist via grid framework (ANALISA_RAJA_PROJECT.md seksi B) + temporal split.
- Keputusan Wisnu 20 Jul (dari diskusi FOMO): Kunci RAJA TIDAK ditambah syarat
  hijau/konfirmasi breakout (varian sudah kalah di 15+ uji; entry emas = kapitulasi).
  Konviksi tanpa sinyal = jalur Defence dgn label jujur, bukan hibrida.
- Scan Swing #1 SELESAI 20 Jul: papan atas = spesies pump (PIPA +600%, KOTA 34 ep —
  gerbang v1 bocor). Kandidat tengah-tabel: INDY (utama), INCO (marginal), MBSS
  (likuiditas tipis), PANI (watchlist). PTRO/TPIA lolos tapi DITUNDA (konsentrasi dgn BSJP).
- **INDY ❌ DITOLAK 20 Jul** (docs/ANALISA_SWING_INDY.md): karakter nyata (episode −30%
  hold 60hr: win 75% avg +25.9%!) tapi n=12 → WLB 46.8 < 50. MACD exit-all merusak
  (DNA ≠ RAJA). Pelajaran: median pulih ≠ konsistensi menang.
- Scan v2 SELESAI: RAJA muncul #8 (win ep 89) = validasi gerbang. Shortlist: BIPI, MEDC, DSNG.
- **BIPI ❌ & DSNG ❌ DITOLAK 20 Jul → PERBURUAN KUNCI KEDUA DITUTUP**
  (docs/ANALISA_SWING_BIPI_DSNG.md): episode bergerombol menggelembungkan n —
  BIPI 13→4 independen (plus sirkularitas horizon-120 & lantai gocap), DSNG 12→5
  (win independen 50% @60/90hr). Kesimpulan: kapitulasi independen langka di mana pun;
  **Kunci RAJA = anomali tunggal (terbukti data)**. MEDC TIDAK dilanjutkan (penyakit
  aritmetika sama hampir pasti). Screener di-patch v2.1: de-cluster ≥60 hari bursa
  (n jujur; diverifikasi harness). Jangan buka ulang perburuan tanpa kandidat lolos
  v2.1 atau hipotesis struktural pra-data.

## LEDGER KELUARGA HIPOTESIS (peta perjalanan panjang — 20 Jul 2026)
Aturan main: ide baru boleh kapan pun, TAPI spek dikunci SEBELUM lihat data, satu
tembakan per hipotesis per emiten, hasil didokumentasikan apa pun vonisnya.
1. Mean-reversion kapitulasi (CRSI/episode −30) — **DITUTUP**: RAJA anomali tunggal
   (INDY/BIPI/DSNG gugur; docs/ANALISA_SWING_*)
2. Momentum overnight (hijau>threshold) — **✓ PTRO v1.1** (masa percobaan)
3. Kontrarian sore (MACD<0 OR CLV<0.3) — **✓ TPIA v2**
4. Imbalance bandar — ✓ horizon 1 malam (kaki RAJA BSJP); horizon swing/multi-bulan
   DILARANG uji ulang (merusak; daftar kumulatif)
5a. Protokol eksplorasi 60/40 (INDY, 20 Jul): ~16 aturan train-only, TIDAK ADA yang
   lolos train → holdout INDY (2024-07-05→) MASIH DISEGEL utk keluarga baru. Temuan
   kunci: ilusi base-rate jejak-kaki (docs/ANALISA_SWING_INDY.md lampiran). INDY
   ditutup utk semua keluarga harga-murni harian.
5. Kontraksi volatilitas (squeeze BB-P20 dlm 5hr → breakout high-20, trail 10-25) —
   spek v1.1 TERKUNCI (amandemen 1x: serentak→berurutan, degenerasi mekanis, diungkap).
   Kontrol mean-reverter: LOLOS (tak ada hadiah palsu; maks WLB 35). TEMUAN: frekuensi
   1-2 sinyal/thn/emiten → per-emiten mustahil n≥30 → satu2nya jalur sah = POOLING
   keranjang pra-daftar (MEDC, BUVA, INCO, +1 pilihan Wisnu; preseden alat:
   runBacktestMulti). Gerbang pool: WLB net ≥50, split ≤15pp, uji konsentrasi
   (tak boleh 1 emiten dominasi kemenangan). STATUS 21 Jul
   (docs/ANALISA_KONTRAKSI_VOL.md): kontrol LOLOS; **MEDC = kandidat genuine pertama
   dari tembakan terkunci** (trail10 WLB 52.3 tapi split 33pp; trail15 split 80/80
   tapi WLB 49.0 — belum sah, tunggu vonis keluarga); **INCO GAGAL** (WLB 17, breakout
   palsu serial; avg positif = ilusi 1 trade Des'25). Aturan dikunci: uji konsentrasi
   pool per-EMITEN dan per-PERISTIWA (Des'25 menang di MEDC & INCO sekaligus =
   1 peristiwa makro). Tunggu: export BUVA + anggota ke-4.
6. Rezim MA / ikut-tren — diuji di INDY (train 60%): whipsaw fatal (cross MA50 win 7%). TERBUKA utk emiten lain berkarakter trending; di INDY tertutup
7. Karakter anti-IHSG / hedge — TERBUKA, belum dispesifikasi
8. Pola teknikal bernama (H&S, cup-handle, triangle) — DITOLAK di gerbang: definisi
   lentur (6-8 derajat bebas), bias belakang, n langka; fenomena intinya diserap
   keluarga #5

## IDE DIPERTIMBANGKAN & TIDAK DILANJUTKAN (jangan usulkan ulang kecuali Wisnu minta)
- "Formula Sambung" BSJP→intraday RAJA (irisan 09:15, hemat fee 0.40 di hari overlap):
  secara teknis valid & aditif, TAPI Wisnu putuskan 20 Jul TIDAK dilanjutkan — terlalu
  ribet operasionalnya. PTRO/TPIA memang haram disambung (intraday PTRO ditolak; TPIA exit 09:00).

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
   APEX ❌ DITOLAK 20 Jul (docs/ANALISA_APEX.md): makhluk malam, gross +0.70 vs biaya
   1.13 (tick 0.73%!), WLB maks 34, split 33/67, tail 147% — struktural, tanpa pantauan,
   export intraday TIDAK direkomendasikan → jangan-diuji-ulang.
   MDKA ❌ GUGUR (analisa Wisnu sendiri, dikonfirmasi 20 Jul — detail tidak di repo).
   GZCO ❌ DITOLAK 20 Jul (docs/ANALISA_GZCO.md): spesies APEX lebih ekstrem — tail
   345%, WLB maks 27, H2-2025 = artefak musim pump. Hukum kristal: tick ≥0.6% = gerbang
   mati BSJP (BUMI/TINS/APEX/GZCO) → screener kolom tick merah = tolak otomatis.
   SHORTLIST TUTUP.
   **MODE EVENT di screener** ✅ dibangun 20 Jul (commit 77a77cc): sinyal hijau>3% +
   vol≥3x avg20, entry close → exit OPEN besok (proxy; 09:15 di pipeline), WLB NET,
   n<15 tak diperingkat, KANDIDAT = WLB≥50 & gap split ≤20pp. Sekaligus: Win/WLB mode
   drift DINETKAN (fix cacat GZCO — win gross menyesatkan di tick mahal).
   → HASIL 20 Jul (docs/ANALISA_MODE_EVENT.md): **NOL KANDIDAT dari ~800 emiten**,
   WLB net maks 39 (ESIP). Papan atas = mikro-cap tick merah semua; NET hijau =
   tail-driven (profil APEX market-wide). HIPOTESIS VOLUME-SURGE DITOLAK PERMANEN
   → jangan-diuji-ulang. Mode tetap dipertahankan sbg pemantau berkala (ekspektasi: kosong). Hasil akhir perburuan scan 800 emiten: 1 formula baru (PTRO v1
   masa percobaan) + 1 pantauan (RATU) + 3 penolakan terdokumentasi (TINS/APEX/MDKA).
1a-obs. OBSERVASI TERBUKA (20 Jul, keputusan: keep dulu): kartu RAJA SKIP sore ini padahal dayRet 15:50 lolos — kemungkinan veto imbalance (sah) ATAU gagal-fetch broker (bug). Belum diverifikasi mana. Jika terulang → cek baris 1 panel precheck: angka negatif = formula benar; 'gagal fetch' = bug, kejar token/endpoint broker
1a. **RAJA card** ikut dipatok 15:50 (20 Jul): dayRet dari sortEntry ≤15:50, fallback daily; label 'SINYAL AKTIF (posisi formula)'. CATATAN: varian 15:50 BELUM divalidasi di data RAJA (ambang −3% = ekor, risiko flip << PTRO) → validasi menumpang re-kalibrasi Sep (data intraday post-split sudah dibutuhkan agenda itu)
1b. **PTRO v1.1** (20 Jul, dari bug report Wisnu): sinyal kartu dipatok harga 15:50 (WLB 60, flip live↔final imaterial 2+3/70) — precheck & final konsisten; CLV TPIA juga dipindah ke intraday ≤15:50 (= spek asli); label kartu dijujurkan 'SINYAL AKTIF (posisi formula)'. Detail di docs/ANALISA_BSJP_PTRO.md
2. ~~Card BSJP TPIA v2~~ ✅ SELESAI 20 Jul: panel OR (MACD intraday via calcMACD 1m + CLV live), SKIP jendela MSCI (DEFINISI=ASUMSI — fungsi TPIA_MSCI; koreksi bila spek asli ketemu), exit 09:00 open, badge net-tipis
5. Scalping RAJA re-kalibrasi (tunggu data intraday post-split ~Sep 2026)
6. Screener bulanan pantau RATU: ambang aktivasi ulang = drift gross 60hr ≥0.9–1.0% & win ≥55% (sekarang 0.59 — belum). Detail docs/ANALISA_BSJP_RATU.md

## POLA KERJA WISNU (tersimpan di memory juga)
Analisa karakter emiten DULU → tentukan indikator relevan + alasan → minta data BERTAHAP → proaktif kabari kalau butuh export tambahan. Fee: BSJP/overnight WAJIB 0.40 (bukan 0.26). Biaya riil = fee + tick slippage. Standar: WLB, state machine, temporal split ≤15pp, no look-ahead (broker data H-1, dayRet live ok).

## DATA DI UPLOADS SESI INI (minta ulang kalau sesi baru butuh)
tes.json (RAJA 1m 239hr), RAJA daily/bandarmology/regime 5thn, TPIA intraday 15bln + bandarmology 836hr, BUMI intraday+daily, RATU 30m 1.5thn + daily bandarmology, WIFI daily 5thn (full indikator)

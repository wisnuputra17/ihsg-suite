# IHSG Suite — Handoff Sesi (23 Jun 2026)

> Update dari versi 22 Jun 2026 (banyak berubah — baca ulang dari awal,
> jangan asumsi masih sama). Baca ini dulu sebelum mulai kerja di sesi
> baru — tidak perlu jelaskan ulang konteks proyek.

---

## 1. Profil & Cara Kerja (tetap sama dari sesi lalu)

- **Wisnu**, Jember. Komunikasi selalu **Bahasa Indonesia**.
- Trading: **Defence** (conviction play), **Cacing/Naga** (small cap catalyst), **Scalping** (matematis/probabilistik).
- **Prinsip kerja yang WAJIB diikuti:**
  - Bangun fondasi benar dari awal, bukan jalan pintas.
  - **Tanya dulu sebelum bikin perubahan besar** — jangan asumsi scope.
  - **Verifikasi dengan bukti konkret** — JANGAN tebak-tebak perilaku API/sistem eksternal. Kalau tidak bisa verifikasi sendiri (banyak kasus sesi ini!), bilang jujur, jangan pura-pura yakin.
  - Console testing: **1 command sekaligus**.
  - Hindari bug berulang dengan cek matang di awal, bukan dengan mengurangi validasi.
  - **BARU (ketemu sesi ini):** kalau sesuatu "kadang gagal, kadang berhasil, request yang sama, kode tidak diubah" — itu ciri ketidakstabilan infrastruktur eksternal, BUKAN bug logika. Jangan terus-terusan nebak fix kode untuk masalah jenis ini.

---

## 2. ✅ Migrasi Backend Apps Script → Firebase — SELESAI (24 Jun 2026)

**Status: TUNTAS.** Semua fitur yang punya persistence (Ranking Emiten, Win Rate Scanner, Chart, Broker Analyzer) sudah pindah dari `shared/sheets.js` (Apps Script) ke `shared/firebase.js` (Firestore). HAKA tidak ikut migrasi karena sudah dihapus persistence-nya sama sekali (lihat §2b).

**Kenapa pindah:** Apps Script Web App terbukti flaky berkali-kali sepanjang sesi 23 Jun (CORS/500/404 berubah-ubah jenis tanpa kode diubah). 2 percobaan fix berbasis kode tidak menyelesaikan — keputusan akhir migrasi total.

**Yang sudah jadi:**
- `shared/firebase.js` — kontrak fungsi (`gsLoad`/`gsSave`/`gsAppend`/`gsClear`) identik dgn `sheets.js`, jadi tiap db.js fitur cuma ganti 1 baris import
- `shared/firebase.config.js` — **sudah diisi config asli** (project `ihsg-suite`, bukan placeholder lagi)
- `firestore.rules` — deployed, syaratkan anonymous auth
- Semua 4 db.js (ranking-emiten, win-rate, chart, broker-analyzer) sudah ganti import ke firebase.js
- Test (`db.test.js`/`fetch.test.js` ranking-emiten & win-rate) ditulis ulang pakai `mock.module()` (lihat §2c) — **bukan lagi mock fetch mentah**

**`apps-script/Code.gs` & `shared/sheets.js` TIDAK dihapus dari repo** — disimpan sebagai referensi/fallback historis, tapi sudah tidak dipakai fitur manapun lagi.

### 2b. HAKA — keputusan terpisah: TIDAK ADA persistence sama sekali

Keputusan Wisnu (24 Jun 2026): HAKA tidak perlu sinkron cards/named lists ke database apa pun (Sheets ATAU Firebase) — semua in-memory, reset tiap reload. `features/haka/db.js` SUDAH TIDAK import sheets.js/firebase.js sama sekali. `ensureDefaultCards()` seed 1 card multi + **5 slot single kosong** (`syms:[]`, id sementara `slot-1`..`slot-5`) — begitu user pilih simbol via picker inline, `cardSetSymbol()` ubah `card.id` jadi simbol itu sendiri, card jadi berperilaku identik dgn card yang ditambah lewat `cardAdd()` biasa.

### 2c. PENTING — cara test fitur yang pakai firebase.js

`shared/firebase.js` import `'https://www.gstatic.com/...'` di top-level — Node.js ESM loader **TIDAK BISA** load URL `https://` sama sekali (`ERR_UNSUPPORTED_ESM_URL_SCHEME`, cuma dukung scheme `file`/`data`). Ini bikin SEMUA test yang transitif import `firebase.js` (lewat db.js) gagal total kalau di-mock pakai cara lama (mock `globalThis.fetch`).

**Solusi:** pakai `mock.module()` dari `node:test` — ganti `shared/firebase.js` SELURUHNYA di level modul SEBELUM db.js diimport. Butuh flag `--experimental-test-module-mocks` (sudah ditambahkan ke `package.json`'s `"test"` script, CI otomatis ikut). Contoh pola (lihat `features/ranking-emiten/db.test.js` atau `features/win-rate/fetch.test.js` utk implementasi lengkap):
```js
import { test, mock } from 'node:test'
mock.module('../../shared/firebase.js', {
  namedExports: { gsLoad: async (...) => {...}, gsAppend: async (...) => {...}, ... }
})
const { ... } = await import('./db.js') // HARUS setelah mock.module(), bukan sebelum
```
**Kalau bikin db.js BARU yang pakai firebase.js dan butuh test** — WAJIB pakai pola ini, JANGAN coba mock `fetch` mentah seperti pola `sheets.js` lama, itu tidak akan jalan sama sekali.

---

## 2d. ✅ MIGRASI KE-2: Firestore → IndexedDB — SELESAI (29 Jun 2026)

**Status: TUNTAS.** Backend pindah LAGI, dari Firestore ke `shared/indexeddb.js` (lokal browser, IndexedDB). Firestore (§2 di atas) sekarang JUGA deprecated, sama seperti Apps Script/Sheets sebelumnya.

**Kenapa pindah:** Wisnu kena kuota gratis Firestore Spark **2x dalam 1 hari testing intensif** (read+write quota habis), dan **tidak punya kartu kredit** sama sekali — jadi upgrade ke Blaze (yang sebenarnya ujungnya murah, ~recehan) **tidak bisa dieksekusi**. Sempat dipertimbangkan Supabase (alternatif gratis tanpa kartu kredit, tapi paradigma SQL beda total, migrasi besar lagi dgn risiko baru) — Wisnu pilih IndexedDB karena:
- **TIDAK ADA konsep kuota/limit operasi SAMA SEKALI** (beda fundamental dari Firestore yang limitnya di JUMLAH OPERASI per hari)
- Tidak perlu kartu kredit, tidak perlu internet
- Trade-off yang DISADARI & DITERIMA: **tidak sinkron antar device** (Wisnu cuma pakai 1 laptop), dan **drawings Chart kehilangan sinkron multi-device** yang sebelumnya jadi tujuan desainnya (lihat flag di `chart/db.js`)

**Yang sudah jadi:**
- `shared/indexeddb.js` — kontrak fungsi IDENTIK dgn firebase.js (`gsLoad`/`gsSave`/`gsAppend`/`gsClear`/`gsLoadFiltered`), jadi tiap db.js cuma ganti 1 baris import. SATU object store ('records') utk SEMUA collection (field `collection` + index), bukan 1 store per collection.
- Semua 4 db.js (ranking-emiten, win-rate, chart, broker-analyzer) sudah ganti import ke indexeddb.js
- **Testing JAUH LEBIH BAIK** drpd era firebase.js: pakai npm package `fake-indexeddb` (implementasi MURNI JS dari spec IndexedDB asli, BUKAN sekadar mock) — bisa test kode indexeddb.js SESUNGGUHNYA di Node. Semua 4 file test (db.test.js/fetch.test.js ranking-emiten & win-rate) ditulis ulang pakai `import 'fake-indexeddb/auto'` + storage asli (gsAppend di-wrap `mock.fn()` dari node:test, tetap panggil implementasi asli, cuma utk spy "berapa kali dipanggil").
- `.gitignore` BARU dibuat (repo ini belum pernah punya sebelumnya) — exclude `node_modules` (dependency npm pertama yang benar2 dipakai: `fake-indexeddb`, devDependency saja, TIDAK dipakai di production code).
- `package.json` punya `package-lock.json` sekarang (ikut di-commit, standar praktik).

**TIDAK ADA setup manual apa pun yang diperlukan** (beda total dari FIREBASE_SETUP.md) — IndexedDB otomatis tersedia di semua browser modern, tidak perlu akun/config/API key sama sekali. `FIREBASE_SETUP.md` & `shared/firebase.config.js` masih ada di repo (historis), tidak relevan lagi.

**Cara verifikasi cepat (Console, halaman apa pun):**
```js
const { gsAppend, gsLoad } = await import('./shared/indexeddb.js') // sesuaikan path relatif
await gsAppend('test-collection', [{ hello: 'world', ts: Date.now() }])
console.log(await gsLoad('test-collection'))
```

`apps-script/Code.gs`, `shared/sheets.js`, `shared/firebase.js`, `shared/firebase.config.js`, `firestore.rules`, `FIREBASE_SETUP.md` — SEMUA dipertahankan di repo sbg referensi historis (2 migrasi backend sebelumnya), TIDAK dihapus, TIDAK dipakai fitur manapun.

## 3. Struktur File Saat Ini

```
ihsg-suite/
  index.html                    # landing page
  FIREBASE_SETUP.md             # BARU -- panduan migrasi, baca §2 di atas
  firestore.rules               # BARU -- security rules Firestore
  package.json                  # node --test (auto-discover semua *.test.js)
  shared/
    store.js, api.js, indicators.js, header.js, symsearch.js, format.js,
    expensive-fetch.js, features.js, ui.css   # (sama seperti sebelumnya)
    sheets.js                   # backend Apps Script LAMA -- masih dipakai semua
                                 # fitur SAAT INI, fallback selama migrasi Firebase
    firebase.js                 # BARU -- backend Firestore, BELUM dipakai di mana pun
    firebase.config.js          # BARU -- placeholder, WAJIB diisi Wisnu
    stats.js                    # BARU -- wilsonLowerBound(), dipakai ranking-emiten
  features/
    chart/                      # Stabil. ⚠️ Lihat §5 BUG #6 (LPM) -- baru di-fix sesi ini
    broker-analyzer/             # Stabil, tidak disentuh sesi ini
    haka/                       # Stabil, tidak disentuh sesi ini
    win-rate/                   # Lengkap & jalan (engine+db+fetch+UI), lihat §4
    ranking-emiten/             # BARU sesi ini, lengkap + signal validator, lihat §4
  apps-script/
    Code.gs                     # Backend LAMA, masih aktif (lihat §2)
  scalping/                     # KODE LAMA, referensi saja, tidak disentuh
```

**Total test:** 137, semua lolos (`npm test` di root). CI GitHub Actions aktif (`.github/workflows/test.yml`), jalan otomatis tiap push ke `main`.

---

## 4. Status Fitur Baru Sesi Ini

### Win Rate Scanner (`features/win-rate/`) — Lengkap, sudah confirmed jalan oleh Wisnu
- **27 kondisi** (Gap×RSI×MACD, 3×3×3) × **9 exit time** (`09:05,09:10,09:20,09:35,10:00,10:30,11:30,13:30,16:00`)
- **Entry = `today.open`** dari data daily (dikonfirmasi Wisnu = IEP, harga match lelang pra-pembukaan) — BUKAN snapshot intraday terpisah
- Multi-simbol (watchlist LQ45/IDX80/Semua/manual), rentang tanggal bebas
- Fetch intraday pakai `mult=5` (semua 9 exit time kelipatan 5 menit), batch 5 hari kerja/call (batas aman 7 hari kalender, **terdokumentasi** di `api.js`, bukan tebakan)
- `runBacktestMulti()` gabung hasil banyak simbol jadi 1 matrix (akumulasi digabung SEBELUM dibagi rata-rata, bukan rata-rata dari rata-rata)
- ⚠️ Catatan dari Wisnu: hasil dgn sample kecil per-kondisi (n=6-14 di scan BULL) itu **memang wajar**, bukan bug — 27 kondisi dibagi rentang waktu terbatas pasti menghasilkan banyak kombinasi langka. Solusinya scan lebih banyak saham/rentang lebih panjang, bukan masalah kode.

### Ranking Emiten (`features/ranking-emiten/`) — BARU, lengkap + signal validator
**Port dari `ihsg-lab.html` (`_renderRanking`)** — logic & 16 kondisi dipertahankan PERSIS, JANGAN diubah tanpa sepengetahuan Wisnu (hasil riset dia sebelumnya):
- **Entry = `p0902`** (intraday, BEDA dari win-rate yang pakai `daily.open`)
- **Gap** = `(p0902 - closeKemarin)/closeKemarin` — beda formula dari win-rate
- **IEP Surge** = surge VOLUME pre-opening (total volume 08:45-08:59 vs rata-rata 5 hari sebelumnya) — **BUKAN surge harga**, beda makna total dari "Gap"
- 16 kondisi hardcoded (bukan kombinatorial generik), beberapa gabungan beberapa syarat. **WIN_PCT=1.0%** (bukan >0%), **MIN_SAMPLE=3**
- Butuh data **IHSG** (trend harian, fetch via `mult=60` per jam, terpisah dari data per-simbol — 1 cache global `DB.ihsg`, dipakai semua simbol)
- Per simbol diambil **1 kombinasi (kondisi,exit) TERBAIKNYA** saja, lalu semua simbol di-ranking — beda tujuan dari win-rate (yang nunjukin matrix lengkap)
- Fetch pakai `mult=1` (1-menit, perlu presisi p0902 & window volume), batch **30 hari kalender/call** — **MIRROR PERSIS** dari `ihsg-lab.html` yang sudah terbukti jalan produksi (`batchDays=30`), bukan tebakan konservatif
- `extractCheckpoints()` forward-fill ONLY (0-2 menit SETELAH target) — BEDA dari win-rate yang nearest-2-arah, sengaja dipertahankan sesuai `_extractIntraday()` asli ihsg-lab

**Signal Validator (ditambah sesi ini, di luar scope porting awal):**
- `shared/stats.js` — `wilsonLowerBound(wins, n)`, formula diverifikasi independen via Python `statsmodels`
- `validateSplit(rows, trainRatio=0.7)` — belah data kronologis 70/30, cari kondisi terbaik di LATIH, uji ulang PERSIS kondisi sama itu di UJI (data belum pernah dilihat). `holds: true/false/null` (null = sample uji <5, belum bisa disimpulkan)
- UI: kolom "Validasi" (✓ Bertahan / ✗ Anjlok / – sample kecil) + subtext Wilson lower bound di bawah Win Rate + stat box "Bertahan di Uji". **Urutan ranking TIDAK diubah** oleh ini, cuma info tambahan.
- **Alasan dibangun:** Wisnu sadar "ambil kondisi terbaik per saham dari 144 kombinasi" itu rawan overfitting/data dredging — signal validator ini jawabannya, TAPI **belum pernah dites Wisnu sendiri** (dibangun saat dia tidur). Test ke depan: scan beberapa saham, lihat apakah kolom Validasi masuk akal.

---

## 5. Bug Kritis BARU yang Ditemukan & Diperbaiki Sesi Ini

(lanjutan dari 5 bug pattern di handoff 22 Jun — semua masih berlaku, tambahan ini)

6. **LPM ambil elemen TERAKHIR array, bukan SUM totalnya** — `features/chart/index.html`, `_fetchLpmDateBatch`. `fetchAbsorption()` di `api.js` return `data.buy`/`data.sell` sebagai array DELTA per-menit (sudah dikonversi dari cumulative), tapi kode lama ambil `data.buy[length-1].value` (cuma volume 1 menit TERAKHIR hari itu) sebagai "total hari itu" — seharusnya `.reduce((s,x)=>s+x.value,0)`. **Dikonfirmasi via Console**: BULL 2026-06-22, sum=17.230.439.400 vs elemen terakhir=0. **Dampak: SEMUA cache LPM yang pernah di-fetch SEBELUM fix ini (semua saham) kemungkinan besar salah** — grafik LPM yang selama ini terlihat nyaris flat memang berdasar data nyaris kosong. Wisnu sudah diminta clear `chart-lpm-cache` & fetch ulang.
   - **Pelajaran:** kalau API return array yang sudah di-convert ke delta (bukan cumulative), JANGAN asumsikan elemen terakhir = total — harus di-sum.

7. **Response Stockbit `fetchDaily()` ternyata DESCENDING (terbaru duluan)** — ditemukan di `features/win-rate/fetch.js`. `enrichDaily()` (RSI/MACD/ATR, semua Wilder smoothing) butuh array ASCENDING (sekuensial, hari tertua dulu) — kalau dikasih descending, smoothing-nya jalan MUNDUR, hasilnya angka yang **kelihatan normal tapi sebenarnya salah** (bukan error yang kelihatan). Fix: `rawDaily.sort((a,b)=>a.date.localeCompare(b.date))` SEBELUM `enrichDaily()`. Sudah diterapkan proaktif juga di `ranking-emiten/fetch.js` (belum sempat kena bug sama, dicegah duluan) dan `fetchIhsgTrend()` (sort by unix sebelum agregasi).
   - **Pelajaran:** JANGAN PERNAH asumsikan urutan response API tanpa verifikasi eksplisit — selalu sort sendiri kalau urutan itu penting buat kalkulasi sekuensial.

8. **Ketidakstabilan Apps Script Web App (CORS/500/404 berubah-ubah)** — lihat §2. 2 percobaan fix berbasis kode (race condition `Promise.all`→sequential, idempoten `_getOrCreateSheet`) **TIDAK menyelesaikan** — keputusan akhir: migrasi ke Firebase, bukan terus mendiagnosis Apps Script lebih jauh tanpa akses log eksekusi yang jelas (Wisnu cek Executions di Apps Script, tidak ada detail error yang berguna).

---

## 6. Konvensi Teknis Tambahan Sesi Ini

- **`node --test` tanpa argumen** otomatis scan SEMUA subfolder untuk `*.test.js` — tidak perlu update `package.json` manual tiap nambah fitur baru.
- **Folder fitur HARUS pakai tanda hubung** kalau id di `shared/features.js` pakai tanda hubung (`win-rate`, `ranking-emiten`) — landing page bikin link `href="features/${id}/"`, mismatch = 404.
- **Konfirmasi rumus matematis HARUS pakai referensi independen** (Python: `statsmodels` utk statistik, manual implementasi utk indikator) sebelum dijadikan fixture test — bukan menyalin balik rumus JS-nya sendiri. Sudah jadi pola konsisten: RSI/ATR/MACD/Supertrend (sesi sebelumnya), Wilson lower bound (sesi ini).
- **PAT GitHub**: TIDAK PERNAH disimpan ke memori Claude (aturan keras), dipakai sekali pakai per push lalu dibersihkan dari git remote config. Wisnu kirim ulang tiap butuh push.
- **Firebase config aman public/commit** (beda dari PAT/token) — keamanan dari security rules, bukan dari menyembunyikan config.

---

## 7. Yang Masih Menggantung / Belum Selesai

- **Migrasi Firebase** — lihat §2, ini prioritas utama sesi depan kalau Wisnu sudah setup.
- **Signal Validator (`validateSplit`) belum pernah dites Wisnu** — dibangun otomatis saat dia tidur, perlu verifikasi hasil di scan nyata sebelum dipercaya penuh.
- **Audit penuh codebase (23 Jun, sebelum migrasi Firebase) — SUDAH SELESAI & di-fix:** versi Firebase SDK ketinggalan 2 major (10→12.15.0), debug artifact `window._wr`, 1 simbol gagal tidak lagi gagalkan seluruh scan watchlist (RATE_LIMITED dapat backoff+lanjut, TOKEN_EXPIRED tetap abort total karena fatal utk semua simbol berikutnya), HAKA render card SEGERA bukan nunggu Sheets dulu (pola sama dgn fix Chart/Broker Analyzer). Total skrg 144 test.
- **Catatan tersisa dari audit, SENGAJA belum diubah** (bukan bug aktif, cuma inkonsistensi gaya): 2 mekanisme progress bar berbeda (expensive-fetch.js lama vs fetch-progress.js baru) — keduanya jalan benar, tidak ada kebutuhan fungsional buat disatukan.
- **Ide besar yang masih didiskusikan, BELUM dikodekan apa pun:**
  - "Watchlist H-1" (filter saham layak dipantau dari data semalam: broker flow EOD, gap, ATR, foreign net) → beda lapisan dari "trigger real-time"
  - **ORB (Opening Range Breakout)** dan **VWAP reclaim/rejection** — disepakati sebagai kandidat trigger REAL-TIME yang valid (datanya live, beda dari kondisi H-1 yang snapshot statis), tapi belum ada spek konkret/kode sama sekali. Ini calon next step besar setelah signal validator teruji.
  - Tujuan akhir Wisnu: Chart real-time kasih alert BUY/SELL pas trigger kena, basis-nya watchlist H-1 (siapa dipantau) + trigger intraday (kapan masuk).

---

## 9. Fondasi Signal Engine (dikerjakan dlm "Mode Bakar Token", 24 Jun 2026)

⚠️ **SEMUA item di section ini: pure logic + test, BELUM diintegrasikan ke
UI/Chart real-time sama sekali, dan BELUM PERNAH divalidasi Wisnu dgn data
pasar nyata.** Ini fondasi siap-pakai, BUKAN hasil analisis pasar final.

- **`shared/orb.js`** — Opening Range Breakout. `computeOpeningRange()`,
  `detectBreakout()` (dari CLOSE candle, bukan high/low — hindari sinyal
  palsu dari wick), `scanForFirstBreakout()` (opsional syarat volume
  konfirmasi). Sengaja TIDAK parsing timestamp — caller yg tentukan
  alignment candle ke market-open. 14 test.
- **`shared/vwap-signal.js`** — VWAP reclaim (bullish, cross ke atas
  VWAP)/rejection (bearish, cross ke bawah). REUSE `calcVWAP()` yg sudah
  ada di `shared/indicators.js`, cuma deteksi titik cross-nya. Definisi
  SIMETRIS — **perlu dikonfirmasi Wisnu** kalau maksudnya beda (mis.
  "rejection" sbg "gagal breakout dari bawah", bukan "cross balik ke
  bawah" — itu definisi lain yg belum diimplementasikan). 7 test.
- **`shared/watchlist-h1.js`** — Scoring saham "layak dipantau besok"
  murni dari data H-1 (REUSE PERSIS 7 dari 16 kondisi Ranking Emiten yg
  murni H-1: ATR%, ATR Ratio, RSI H-1, MACD Hist H-1, Vol/MA H-1, Foreign
  Net H-1, IHSG H-1 Trend — BUKAN ambang baru). `scoreH1Watchlist()` +
  `rankWatchlistCandidates()` (tie-break by ATR Ratio, BOLEH diganti). 9 test.
- **`features/win-rate/engine.js` — `runBacktestMultiSplit()`** — perluasan
  Signal Validator (Wilson lower bound + train/test, sebelumnya cuma ada
  di Ranking Emiten) ke Win Rate Scanner. Checkbox "Validasi (70/30)" baru
  di UI win-rate, toggle antara matrix normal vs matrix LATIH+holds. 4 test.

**Total test proyek sekarang: 178** (naik dari 144 sebelum sesi ini).

**Langkah selanjutnya yang BELUM dikerjakan** (butuh keputusan/testing
Wisnu, tidak bisa dikerjakan blind tanpa pengawasan live):
- Integrasi visual ORB/VWAP ke Chart (marker breakout/cross di candle) —
  scope baru, belum disepakati detail UI-nya
- Kalibrasi threshold Watchlist H-1 (skor berapa baru dianggap layak
  dipantau) dgn data nyata
- Rapikan inkonsistensi 2 gaya progress bar (expensive-fetch.js vs
  fetch-progress.js) — item #5 default queue, SENGAJA tidak dikerjakan
  blind krn menyentuh kode Chart/Broker Analyzer yg sudah beberapa kali
  diperbaiki sesi ini, risiko visual/UX regression tanpa testing live
  lebih tinggi drpd manfaatnya (murni kosmetik, bukan bug fungsional)

## 10. Cara Pakai Dokumen Ini

Paste seluruh isi dokumen ini di awal sesi baru. Kalau Wisnu bilang sudah setup Firebase, cek §2 dulu sebelum lanjut kerja apa pun yang menyentuh data — jangan asumsi migrasi sudah/belum selesai tanpa tanya/cek `firebase.config.js`.

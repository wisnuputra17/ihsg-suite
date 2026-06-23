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

## 2. ⚠️ PERUBAHAN BESAR: Migrasi Backend Apps Script → Firebase (SEDANG JALAN, BELUM SELESAI)

**Kenapa:** Sepanjang sesi ini, Apps Script Web App (backend Sheets) terbukti **flaky berkali-kali** — CORS blocked / 500 / 404 muncul berubah-ubah jenis pada request yang SAMA PERSIS, tanpa kode diubah sama sekali. Sudah dicoba 2 perbaikan berbasis kode (race condition di `loadSym()`, idempoten di `_getOrCreateSheet()`) — **keduanya tidak menyelesaikan**, error tetap muncul dengan jenis berbeda setelahnya. Kesimpulan: ini soal infrastruktur Google Apps Script Web App, bukan bug kita.

**Status migrasi saat ini:**
- ✅ `shared/firebase.js` sudah ditulis — kontrak fungsi (`gsLoad`/`gsSave`/`gsAppend`/`gsClear`) **identik** dengan `shared/sheets.js`, supaya tiap `db.js` fitur cuma ganti 1 baris import
- ✅ `firestore.rules` sudah disiapkan (syaratkan anonymous auth, tolak akses asing)
- ✅ `FIREBASE_SETUP.md` — panduan lengkap 7 langkah utk Wisnu (bikin project, aktifkan Firestore+Anonymous Auth, isi config, deploy rules, tes koneksi, pindahkan 1 fitur dulu)
- ❌ **BELUM ADA satu pun `db.js` yang benar-benar pindah ke Firebase** — `shared/firebase.config.js` masih placeholder, Wisnu belum eksekusi langkah manual di Firebase Console
- ❌ Belum ada fitur yang dites pakai Firebase sungguhan

**KALAU SESI BARU MULAI DAN WISNU BILANG SUDAH SETUP FIREBASE:** cek dulu apakah `shared/firebase.config.js` sudah diisi config asli (bukan placeholder `GANTI_...`). Kalau sudah, mulai pindahkan `features/ranking-emiten/db.js` dulu (paling baru, datanya belum banyak, rencana sebagai pilot) — ganti import dari `sheets.js` ke `firebase.js`, minta Wisnu scan ulang BULL, bandingkan hasilnya. Kalau lancar, baru pindahkan fitur lain satu-satu (win-rate, chart, broker-analyzer, haka) — JANGAN langsung semua sekaligus.

**Apps Script/`shared/sheets.js` TIDAK dihapus** — tetap ada sebagai fallback per-fitur kalau migrasi 1 fitur bermasalah.

---

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
- **Retry otomatis di `gsLoad`** — sempat diusulkan utk Apps Script yang flaky, Wisnu bilang "tidak perlu, next time" — kemungkinan jadi tidak relevan lagi kalau migrasi Firebase jalan (Firestore tidak punya masalah flaky yang sama).
- **Signal Validator (`validateSplit`) belum pernah dites Wisnu** — dibangun otomatis saat dia tidur, perlu verifikasi hasil di scan nyata sebelum dipercaya penuh.
- **Ide besar yang masih didiskusikan, BELUM dikodekan apa pun:**
  - "Watchlist H-1" (filter saham layak dipantau dari data semalam: broker flow EOD, gap, ATR, foreign net) → beda lapisan dari "trigger real-time"
  - **ORB (Opening Range Breakout)** dan **VWAP reclaim/rejection** — disepakati sebagai kandidat trigger REAL-TIME yang valid (datanya live, beda dari kondisi H-1 yang snapshot statis), tapi belum ada spek konkret/kode sama sekali. Ini calon next step besar setelah signal validator teruji.
  - Tujuan akhir Wisnu: Chart real-time kasih alert BUY/SELL pas trigger kena, basis-nya watchlist H-1 (siapa dipantau) + trigger intraday (kapan masuk).

---

## 8. Cara Pakai Dokumen Ini

Paste seluruh isi dokumen ini di awal sesi baru. Kalau Wisnu bilang sudah setup Firebase, cek §2 dulu sebelum lanjut kerja apa pun yang menyentuh data — jangan asumsi migrasi sudah/belum selesai tanpa tanya/cek `firebase.config.js`.

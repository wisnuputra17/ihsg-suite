# TODO — Tindakan Wisnu

> Daftar aksi konkret yang PERLU kamu lakukan sendiri (bukan catatan teknis
> Claude — itu ada di `HANDOFF.md`). Centang kalau sudah selesai.

---

## Prioritas tinggi

- [x] ~~Verifikasi IndexedDB jalan benar~~ — **confirmed Wisnu (29 Jun 2026)**: scan saham, reload, scan ulang lebih cepat (cache lokal jalan)

- [x] ~~Bersihkan cache broker yang ke-corrupt~~ — **tidak relevan lagi**, backend sudah pindah ke IndexedDB (data lama di Firestore otomatis tidak terpakai, mulai bersih dari nol)
- [x] ~~Bersihkan cache LPM semua saham~~ — **tidak relevan lagi**, sama alasan di atas

- [ ] **Verifikasi fix `cache:'no-store'` HAKA** (29 Jun 2026) — delay ~3 menit alert pertama (2 tab, sama saham), diduga kena cache browser di fetch running-trade. Sudah di-fix (`cache:'no-store'` + logging diagnostik permanen di `poll.js`), tapi BELUM dites — tunggu market buka lagi. Cara tes: 2 tab, 1 jalan duluan 1 baru di-start, bandingkan log `[haka/poll]` di Console tab yang baru.

- [ ] **Cek kolom "Validasi" di Ranking Emiten** — fitur ini ditambahkan otomatis (belum pernah saya tes sendiri). Scan beberapa saham, lihat kolom "Validasi" (✓ Bertahan / ✗ Anjlok / – sample kecil) — apakah hasilnya masuk akal dibanding angka Win Rate mentahnya?

---

## Tidak perlu aksi (sudah tuntas)

- ~~Win Rate Scanner error SHEETS_ERROR~~ — sudah confirmed jalan normal
- ~~Ranking Emiten error CORS/500/404~~ — sudah confirmed jalan normal
- ~~Retry otomatis `gsLoad`~~ — kamu putuskan "next time saja", tidak jadi dikerjakan
- ~~Loading chart/HAKA lama~~ — sudah di-fix (render segera, cache di background)
- ~~Audit sebelum migrasi Firebase~~ — sudah selesai, semua temuan di-fix (lihat HANDOFF.md §7)
- ~~Migrasi ke Firebase~~ — **SELESAI TOTAL (24 Jun 2026)**: Ranking Emiten, Win Rate Scanner, Chart, Broker Analyzer semua sudah pindah. HAKA tidak ikut migrasi (sudah dihapus persistence-nya sama sekali, keputusan terpisah)
- ~~HAKA simpan card/watchlist ke database~~ — sudah dihapus sesuai permintaan, sekarang in-memory saja + 5 slot kosong di awal

---

## Cara update list ini

Kalau ada yang baru muncul pas testing, kasih tau Claude di sesi manapun — "tambahkan ke TODO.md" — biar tetap satu tempat, tidak kececer di histori chat.

---

# Mode Bakar Token — Pending Task untuk Claude

> Beda dari daftar di atas (itu utk Wisnu eksekusi) — ini daftar tugas yang
> Claude akan kerjakan kalau Wisnu bilang "gunakan mode bakar token".
> Wisnu nambah item di sini kapan saja kepikiran sambil kerja, tidak perlu
> langsung dikerjakan saat itu. Urutan default (per 24 Jun 2026, SEMUA 6 ITEM SUDAH SELESAI):
>   1. ~~ORB (Opening Range Breakout) — desain & bangun logic + test~~ ✅ `shared/orb.js`, 15 test
>   2. ~~VWAP reclaim/rejection — desain & bangun logic + test~~ ✅ `shared/vwap-signal.js`, 8 test
>   3. ~~Perluas Signal Validator ke Win Rate Scanner~~ ✅ `runBacktestMultiSplit()`, 4 test + checkbox UI
>   4. ~~Watchlist H-1~~ ✅ `shared/watchlist-h1.js`, 11 test (reuse 7 kondisi H-1 murni dari Ranking Emiten)
>   5. ~~Rapikan inkonsistensi progress bar~~ ⏭️ SENGAJA DISKIP — risiko regresi visual di kode Chart/Broker Analyzer yg sudah berkali-kali diperbaiki, tanpa bisa testing live, demi manfaat yg murni kosmetik
>   6. ~~Perkuat test coverage~~ ✅ audit rasio test/baris semua file pure-logic + tambah edge case di 3 modul baru
>
> ⚠️ Item 1-4 BARU fondasi logic+test, BELUM diintegrasikan ke Chart/UI
> real-time sama sekali, dan BELUM pernah dites Wisnu dgn data pasar nyata.
> Total test proyek: 182 (naik dari 144 sebelum sesi Mode Bakar Token ini).
>
> List default sudah kosong/selesai semua — kalau Wisnu panggil "mode bakar
> token" lagi tanpa item baru, tanya dulu mau lanjut ke arah mana (integrasi
> Chart? Screening Otomatis? sesuatu yg lain?) — JANGAN asal pilih scope baru
> sendiri tanpa konfirmasi, krn langkah selanjutnya (integrasi visual,
> kalibrasi threshold) butuh keputusan/testing live Wisnu.
>
> Item spesifik yang Wisnu tambah di bawah ini DIDAHULUKAN dari urutan
> default di atas.

- [ ] **Screening Otomatis (GitHub Actions, jalan tiap pagi sebelum market buka)**
  - Tujuan: screening watchlist otomatis tiap pagi (kandidat kriteria: gap, ATR, broker flow H-1 — lihat "Watchlist H-1" di urutan default di atas, ini SALING TERKAIT, bukan fitur terpisah)
  - **Referensi UI** (dari Wisnu, lihat `docs/reference/screener-ui-mockup.jpeg`): mirip screener Stockbit — "Nama Screener" (text input), "Stock Universe" (dropdown, mis. IHSG/LQ45), "Rules" (list kondisi yang bisa ditambah/dihapus dinamis lewat "+ Tambah Rules" + tombol X per rule, BUKAN hardcoded spt 16/27 kondisi di Win Rate Scanner/Ranking Emiten sekarang), tombol "Screen" (CTA utama) di bawah. Implikasi: butuh UI rule-builder yang fleksibel (pilih field+operator+nilai per rule), beda arsitektur dari kondisi hardcoded yang sudah ada.
  - Mekanisme: GitHub Actions cron (gratis, TIDAK perlu kartu kredit/Blaze — sudah dibandingkan vs Firebase Cloud Functions yg wajib Blaze)
  - Token Stockbit: Wisnu **kirim manual tiap hari** (bukan otomatis — Stockbit tidak punya cara login otomatis). Perlu didesain: cara Wisnu kirim token itu ke GitHub Actions (kandidat: GitHub Secret di-update manual via CLI/API). ⚠️ CATATAN BARU (29 Jun 2026): backend sekarang IndexedDB (lokal browser) — GitHub Actions (server, tanpa browser) **TIDAK BISA akses IndexedDB sama sekali**. Screening Otomatis ini perlu cara simpan hasil yang BISA diakses dari GitHub Actions (kandidat: kembali pakai cloud storage KHUSUS utk fitur ini saja, atau commit hasil sbg file JSON ke repo via GitHub API langsung dari Action-nya sendiri, bukan dari browser) — desain ini BELUM diputuskan.
  - Kalau token sudah expired pas jam cron jalan: WAJIB gagal graceful (log/notifikasi jelas "token expired", BUKAN diam-diam gagal tanpa jejak)
  - Status: baru ide/rencana, BELUM ada desain teknis detail apa pun, apalagi kode

- [ ] **Autotrade — Eksplorasi & Implementasi (2 Jul 2026)**
  - Tujuan: eksekusi order RAJA intraday secara otomatis berdasarkan sinyal Kunci RAJA Intraday (ORB deadline 09:15, entry Open 09:00, exit 10:00 / AVOID exit 09:15)
  - **Formula yang akan di-autotrade** (sudah tervalidasi, WLB 79.5%, n=83):
    - Entry: Open pasar 09:00 (market order)
    - Konfirmasi: ORB breakout UP sebelum 09:15
    - Exit ORB UP: jam 10:00 (market order)
    - Exit AVOID: jam 09:15 kalau tidak ada ORB breakout
  - **Opsi teknis yang sudah dieksplorasi (urut rekomendasi):**
    1. **GitHub Actions + Mirae Asset OpenAPI** ← REKOMENDASI UTAMA
       - GitHub Actions cron tiap menit jam 08:45–10:15 WIB (gratis, tidak perlu server)
       - Mirae Asset OpenAPI: `openapi.miraeasset.co.id` — REST API resmi, tersedia untuk retail
       - Endpoint utama: `POST /order/place`, `DELETE /order/{id}`, `GET /portfolio`, `GET /price/realtime`
       - Butuh: buka akun Mirae Asset + daftar akses OpenAPI (proses 1-3 hari kerja)
       - Token Stockbit (untuk data IEP/ORB): tetap kirim manual tiap hari via GitHub Secret
       - Token Mirae: bisa di-refresh otomatis via OAuth (lebih stabil dari Stockbit)
    2. **Stockbit API langsung** — tidak resmi, grey area ToS, risiko akun diblokir, TIDAK direkomendasikan
    3. **RPA (Pyautogui/Selenium)** — simulasi klik di aplikasi broker, rapuh, butuh komputer menyala
  - **Arsitektur GitHub Actions:**
    ```
    08:45 → fetch IEP dari Stockbit (via Secret token)
    09:00 → place BUY order via Mirae API
    09:05–09:14 → poll harga tiap menit, cek ORB breakout
    09:15 → kalau tidak ada ORB: place SELL order (AVOID)
    10:00 → kalau ORB confirmed: place SELL order (exit normal)
    ```
  - **Prasyarat sebelum Claude bisa bangun kodenya:**
    1. Wisnu buka akun Mirae Asset (kalau belum ada) dan daftar akses OpenAPI
    2. Konfirmasi dokumentasi Mirae API masih aktif di `openapi.miraeasset.co.id`
    3. Tentukan sizing: berapa lot per signal? Fixed (mis. 1 lot) atau % saldo?
    4. Tentukan safeguard: max loss harian berapa sebelum auto-stop?
  - **Yang bisa dikerjakan Claude sekarang (tanpa akun Mirae):**
    - Bangun GitHub Actions workflow skeleton (scheduling, fetch Stockbit, evaluasi sinyal, logging)
    - Bangun modul order management (abstraksi broker, bisa swap Mirae ↔ broker lain)
    - Dry-run mode: log "WOULD BUY/SELL" tanpa eksekusi nyata dulu — untuk verifikasi sebelum go-live
  - Status: EKSPLORASI SELESAI, menunggu keputusan Wisnu dan prasyarat di atas


---

# Refactor & Technical Debt — Mode Bakar Token (3 Jul 2026)

> Evaluasi struktur kode sesi ini. Dikerjakan saat "gunakan mode bakar token"
> dan tidak ada task fitur lain yang lebih prioritas.

## Jangka Pendek (sebelum tambah fitur baru)

- [ ] **Generalisasi monitor menjadi satu fungsi `_fetchEmitenMonitor(cfg)`**
  - Saat ini `_fetchRajaMonitor` dan `_fetchMbmaMonitor` di index.html strukturnya 80% identik
  - Kalau ada bug di satu, harus fix di dua tempat
  - Fix: satu fungsi generik yang terima config `{sym, gap_threshold, orb_deadline, exit_up, exit_down}`
  - Berlaku juga untuk `_renderMonitor` dan `_renderMbmaMonitor`

- [ ] **Pindahkan monitor RAJA+MBMA dari index.html ke `features/monitor/`**
  - index.html sekarang 1500+ baris — terlalu besar
  - Monitor panel sebaiknya jadi fitur tersendiri di-embed via `<iframe>` atau di-load dinamis
  - Atau minimal pisahkan JS monitor ke `shared/monitor.js`

- [ ] **Checklist wajib setiap buat file baru**
  - Bug `import TOKEN from` vs `import { TOKEN }` sudah terjadi 3x
  - Tambahkan ke HANDOFF.md sebagai "common pitfalls":
    - TOKEN adalah named export → wajib `import { TOKEN }`
    - Fungsi di module scope tidak accessible dari `onclick` → pakai `window._fn`
    - `renderHeader` butuh array `[{label, href}]` bukan object

## Jangka Menengah

- [ ] **Buat `shared/monitor.js` — generalisasi checklist IEP→ORB→Exit**
  - Satu class/module yang handle semua emiten
  - Config-driven: `new EmitenMonitor({sym, gap_threshold, ...})`
  - Dipakai oleh index.html (panel kiri) DAN features/intraday-trading/

- [ ] **Sinkronkan formula BSJP antara index.html dan intraday-trading**
  - Saat ini BSJP logic ada di `features/intraday-trading/index.html` saja
  - Kalau formula berubah, harus update di dua tempat

- [ ] **Test coverage untuk render functions**
  - CI saat ini test logic backend (IndexedDB, indicators) — 193 test
  - Tidak ada test untuk `_renderMonitor`, `_fetchRajaMonitor`, dll
  - Bug seperti `no_signal` state tanpa handler tidak ketahuan sampai runtime
  - Tambah unit test untuk state machine render: setiap orbStatus → expected DOM output

## Jangka Panjang

- [ ] **Sistem monitor yang scalable untuk banyak emiten**
  - Saat ini kalau tambah emiten baru (BBRI, TLKM, dll) harus copy-paste card lagi
  - Desain: config-driven dari array `EMITEN_CONFIG` → generate card otomatis
  - Sudah sebagian ada di `features/intraday-trading/` tapi belum di index.html

- [ ] **Pisahkan analisa BSJP ke `shared/bsjp.js`**
  - Logic: hitung kategori foreign (buy_strong/weak/sell_strong/weak), tentukan exit time
  - Agar bisa dipakai dari index.html, intraday-trading, dan fitur lain


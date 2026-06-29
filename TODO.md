# TODO — Tindakan Wisnu

> Daftar aksi konkret yang PERLU kamu lakukan sendiri (bukan catatan teknis
> Claude — itu ada di `HANDOFF.md`). Centang kalau sudah selesai.

---

## Prioritas tinggi

- [ ] **Verifikasi IndexedDB jalan benar** (29 Jun 2026, migrasi backend ke-2: Firestore → IndexedDB) — coba scan/fetch ulang di salah satu fitur (Ranking Emiten/Win Rate/Chart/Broker Analyzer), pastikan data tersimpan & muncul lagi setelah reload halaman. Tidak perlu setup apa pun (beda dari Firebase) — IndexedDB otomatis ada di browser.

- [x] ~~Bersihkan cache broker yang ke-corrupt~~ — **tidak relevan lagi**, backend sudah pindah ke IndexedDB (data lama di Firestore otomatis tidak terpakai, mulai bersih dari nol)
- [x] ~~Bersihkan cache LPM semua saham~~ — **tidak relevan lagi**, sama alasan di atas

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


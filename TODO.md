# TODO — Tindakan Wisnu

> Daftar aksi konkret yang PERLU kamu lakukan sendiri (bukan catatan teknis
> Claude — itu ada di `HANDOFF.md`). Centang kalau sudah selesai.

---

## Prioritas tinggi

- [ ] **Bersihkan cache LPM SEMUA saham yang pernah di-scan** (bukan cuma BULL) — bug elemen-terakhir-bukan-sum itu memengaruhi SEMUA saham yang pernah pakai indikator LPM di Chart sebelum fix-nya ter-push. ⚠️ Chart sekarang pakai Firebase (bukan Sheets lagi) — Console di halaman Chart:
  ```js
  const { gsClear } = await import('../../shared/firebase.js')
  await gsClear('chart-lpm-cache')
  ```
  Lalu fetch ulang LPM tiap saham yang biasa kamu pantau.

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
> langsung dikerjakan saat itu. Urutan defaultnya (kalau list di bawah
> kosong/belum ada prioritas spesifik):
>   1. ORB (Opening Range Breakout) — desain & bangun logic + test
>   2. VWAP reclaim/rejection — desain & bangun logic + test
>   3. Perluas Signal Validator (Wilson lower bound + train/test) ke Win Rate Scanner
>   4. Watchlist H-1 (filter saham layak dipantau dari broker flow/gap/ATR semalam)
>   5. Rapikan inkonsistensi kecil dari audit (2 gaya progress bar, dst)
>   6. Perkuat test coverage di bagian yang masih tipis
>
> Item spesifik yang Wisnu tambah di bawah ini DIDAHULUKAN dari urutan
> default di atas.

- [ ] **Screening Otomatis (GitHub Actions, jalan tiap pagi sebelum market buka)**
  - Tujuan: screening watchlist otomatis tiap pagi (kandidat kriteria: gap, ATR, broker flow H-1 — lihat "Watchlist H-1" di urutan default di atas, ini SALING TERKAIT, bukan fitur terpisah)
  - Mekanisme: GitHub Actions cron (gratis, TIDAK perlu kartu kredit/Blaze — sudah dibandingkan vs Firebase Cloud Functions yg wajib Blaze)
  - Token Stockbit: Wisnu **kirim manual tiap hari** (bukan otomatis — Stockbit tidak punya cara login otomatis). Perlu didesain: cara Wisnu kirim token itu ke GitHub Actions (kandidat: GitHub Secret di-update manual via CLI/API, ATAU token disimpan ke Firestore lewat UI web yg sudah ada, GitHub Action baca dari situ saat jalan)
  - Kalau token sudah expired pas jam cron jalan: WAJIB gagal graceful (log/notifikasi jelas "token expired", BUKAN diam-diam gagal tanpa jejak)
  - Status: baru ide/rencana, BELUM ada desain teknis detail apa pun, apalagi kode


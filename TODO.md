# TODO — Tindakan Wisnu

> Daftar aksi konkret yang PERLU kamu lakukan sendiri (bukan catatan teknis
> Claude — itu ada di `HANDOFF.md`). Centang kalau sudah selesai.

---

## Prioritas tinggi

- [ ] **Bersihkan cache LPM SEMUA saham yang pernah di-scan** (bukan cuma BULL) — bug elemen-terakhir-bukan-sum itu memengaruhi SEMUA saham yang pernah pakai indikator LPM di Chart sebelum fix-nya ter-push. Console di halaman Chart:
  ```js
  const { gsClear } = await import('../../shared/sheets.js')
  await gsClear('chart-lpm-cache')
  ```
  Lalu fetch ulang LPM tiap saham yang biasa kamu pantau.

- [ ] **Cek kolom "Validasi" di Ranking Emiten** — fitur ini ditambahkan otomatis (belum pernah saya tes sendiri). Scan beberapa saham, lihat kolom "Validasi" (✓ Bertahan / ✗ Anjlok / – sample kecil) — apakah hasilnya masuk akal dibanding angka Win Rate mentahnya?

---

## Opsional, tidak mendesak

- [ ] **Migrasi ke Firebase** (kalau mau hilangkan error CORS/500/404 Apps Script yang berulang) — ikuti `FIREBASE_SETUP.md` dari Langkah 1. Apps Script tetap jalan sebagai fallback selama belum pindah, jadi tidak ada tekanan waktu.

---

## Tidak perlu aksi (sudah tuntas)

- ~~Win Rate Scanner error SHEETS_ERROR~~ — sudah confirmed jalan normal
- ~~Ranking Emiten error CORS/500/404~~ — sudah confirmed jalan normal
- ~~Retry otomatis `gsLoad`~~ — kamu putuskan "next time saja", tidak jadi dikerjakan

---

## Cara update list ini

Kalau ada yang baru muncul pas testing, kasih tau Claude di sesi manapun — "tambahkan ke TODO.md" — biar tetap satu tempat, tidak kececer di histori chat.

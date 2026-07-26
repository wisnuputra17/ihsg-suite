# KELUARGA #6 — SUPERTREND / IKUT-TREN: DITOLAK (26 Jul 2026)

Pemicu: Wisnu menemukan LuxAlgo "ST 3D Surface" (auto-optimize sensitivity range).
Diuji SAH via protokol train/holdout (pengaman yang dibuang fitur auto-optimize).

## Kontrol negatif (5 mean-reverter) — LOLOS
Supertrend grid P{7,10,14}×{2,2.5,3} di INDY/BIPI/DSNG/MEDC/INCO: WLB maks 37 (INDY),
sisanya 20-34. Tak ada hadiah palsu → spek bersih, tidak curve-fit.

## PTRO (kandidat PALING trending: 79% >MA200, harga 191→4660 = 24x) — GAGAL
Grid halus ala-LuxAlgo (Length 5-15 step 1, Mult 1-4 step 0.5), **pemenang dipilih
HANYA dari train (paruh-1 2021-2023), dikunci, diuji SEKALI di holdout (paruh-2)**:
- TRAIN pemenang P14×1.5: n=18 WLB 33.7 win 56% (sudah <50)
- HOLDOUT P14×1.5 (dikunci): n=19 WLB **27.3** win 47% — parameter "terbaik" masa lalu
  jadi DI BAWAH RATA-RATA di masa depan. avg +18.8% = ilusi tail (PTRO naik 24x), win<50.
- Pembanding default P10×3 full: WLB 35.5 win 62% avg +39.8% — MENGGODA tapi tak
  bertahan saat parameter dipilih jujur & diuji out-of-sample.

## Kesimpulan
Keluarga ikut-tren DITUTUP: whipsaw membunuh di mean-reverter, LAG membunuh di trender
(masuk telat setelah tren terkonfirmasi, keluar telat menyerahkan profit di reversal).
Gagal bahkan di emiten paling ideal. Pelajaran meta: fitur auto-optimize (LuxAlgo 3D
Surface) jika dipercaya menampilkan parameter yang PERSIS gagal di holdout ini —
bukti konkret train/holdout bukan formalitas. Jangan buka ulang tanpa hipotesis
struktural baru (bukan sekadar indikator tren lain).

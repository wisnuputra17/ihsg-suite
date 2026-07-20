# ANALISA SWING INDY — 20 Jul 2026: DITOLAK (sampel episode terlalu kecil utk WLB)

**Data:** daily 2021-07-01 → 2026-07-20 (1.211 hari valid, adjust rapi).
Framework seksi B penuh: grid CRSI(10-30) × trail(15-35) × pos(1-3) × gap(7-21),
state machine, fee 0.40, MACD percentile P85/90/95, uji SL, bedah era.

## Hasil
- Grid CRSI terbaik: CRSI≤15 trail15 pos1 gap21 → n=20 WLB **38.7** win 60 avg +10.0
- MACD exit-all MERUSAK (38.7→25.6-27.9) — kebalikan RAJA; SL 10% netral — DNA beda
- Entry episode −30% (hipotesis screener) hold 60hr: n=12 **win 75% avg +25.9%** —
  karakter NYATA — tapi WLB 46.8 < 50 (butuh win ≥~85% di n=12)
- Era: 2021-H1'23 WLB 25 | H2'23-2026 WLB 35.5 — tak ada rezim penyelamat
- Konteks: jendela backtest memuat kolaps sekuler 4.240→905 (−78%) yang LOLOS dari
  gerbang ret-3thn screener (di luar jendela 3 tahun)

## Vonis & pelajaran
DITOLAK sebagai Kunci (red flag WLB<50 di semua varian). Pelajaran struktural:
**median pemulihan ≠ konsistensi menang.** Kunci butuh episode cukup sering DAN
win sangat tinggi (RAJA: n=20 win 90 = langka). → Gerbang screener swing di-upgrade:
kolom win% episode (+60/120hr) ≥75, frekuensi ≤4 ep/thn, bendera pump med>+100%,
likuiditas ≥Rp10M, dan ret-jendela-penuh (tutup celah kolaps di luar 3thn).
Ekspektasi jujur: kolam hasil scan ketat bisa KOSONG — dan itu jawaban sah.

## LAMPIRAN — PROTOKOL EKSPLORASI 60/40 (20 Jul, permintaan Wisnu)
Train = 2021-07-01→2024-07-04 (726 hr) | **HOLDOUT DISEGEL 2024-07-05→akhir — TIDAK
PERNAH DITEMBAKKAN** (tak ada aturan lolos train; segel masih perawan utk keluarga
hipotesis yang benar2 baru; keluarga CRSI/episode SUDAH terbakar di seluruh data).

Anatomi kenaikan train: 15 lonjakan +15%/≤20hr; jejak kaki: 71% lahir dekat dasar-20
(baseline 21%), di bawah MA pendek, netral MA200. → ILUSI BASE-RATE terbukti:
P(dekat-dasar|lonjakan) tinggi ≠ P(lonjakan|dekat-dasar) — semua varian entry
dekat-dasar (exit waktu 5-20hr, +filter red5/vol/distMA20, target, trailing) KALAH
dari entry acak (WLB 15-23 vs acak 26; avg negatif semua).
Keluarga ikut-tren: cross MA50 win 7% (!), MA20 win 23% (whipsaw), Donchian/rezim
n=4-6. INDY = whipsaw utk tren + pisau jatuh utk washout, di horizon harian.

KESIMPULAN: INDY DITUTUP utk seluruh keluarga harga-murni horizon harian (validasi
independen atas penolakan awal, via jalur eksplorasi bebas). Pelajaran protokol:
eksplorasi sah sebagai pabrik hipotesis; train membunuh ilusi SEBELUM holdout —
"guru tidak boleh merangkap penguji".

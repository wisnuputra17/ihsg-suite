# ANALISA TINS — 19 Jul 2026: DITOLAK DUA ARAH

**Data:** intraday 1m (label 30m) 2025-01-02 → 2026-07-17, 352 hari, 104.986 candle.

## Dekomposisi (kunci diagnosis, jalankan ini DULUAN utk emiten baru)
| Periode | malam (close→open) | siang (open→close) |
|---|---|---|
| H1-2025 | +0.750% | −0.726% |
| H2-2025 | +0.777% | +0.279% |
| Q1 CRASH | +0.296% | −0.059% |
| Q2+Jul | +0.544% | −0.310% |
| FULL | **+0.647%** | **−0.200%** |

Spesies sama dgn PTRO: makhluk malam (median gap +0.78%). → Intraday DICORET
tanpa grid search (siang negatif di 3 dari 4 periode).

## BSJP: drift malam NYATA tapi < biaya
Biaya 0.68% (tick 0.28% @3570 + fee 0.40) vs drift mentah +0.647 → net baseline −0.23.
Filter keluarga momentum (resep PTRO) TIDAK cukup mengonsentrasikan:
hijau>3 exit 09:15 = net +0.34, win 52, **WLB 39** (terbaik: exit 10:00 WLB 44).
Semua varian (threshold 0/2/3 × exit open/09:15/09:30/10:00 × MACD × RSI) < WLB 50
→ ambang merah framework. Perbandingan: PTRO hijau>3 = WLB 61.

## Kesimpulan
TINS = PTRO kurus: spesies sama, edge lebih tipis, biaya lebih berat, kemiringan
momentum lemah (dGreen +0.61 vs dRed +0.32). DITOLAK — masuk daftar
JANGAN-DIUJI-ULANG (BSJP & intraday). Tick 0.28% struktural (naik >5000 malah
jadi 0.5%). Tidak perlu export bandarmology.

## VALIDASI SILANG (sesi paralel, metode exit 09:15 — konfirmasi independen)
Angka atas pakai close→open; validasi ini pakai close→**09:15** (konvensi BSJP kita).
Konsisten: gross full +0.557, net baseline −0.228, semua periode net negatif kecuali
H2-25 (+0.08). Tambahan yang belum diuji di atas:
- Kontrarian ekstrem: RSI<40 net +0.10 (WLB 34, n=34), RSI>60 net −0.62 (WLB 25) → nihil
- MACD dua arah dua-duanya negatif (−0.12 / −0.34) → tidak ada sisi yang hidup
- Lotere gap-down intraday (jebakan PTRO): gap<−0.5 exit 10:00 fee DT → net −0.16,
  win 40, WLB 27, dan TOTALNYA RUGI — lebih buruk dari PTRO yang minimal untung di kertas
Dua metode, satu vonis: DITOLAK TOTAL, tanpa pantauan bulanan (tak ada masa jaya
untuk dirindukan — kontras RATU).

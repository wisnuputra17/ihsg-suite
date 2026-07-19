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

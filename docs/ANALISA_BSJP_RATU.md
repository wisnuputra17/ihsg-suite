# ANALISA BSJP RATU — 19 Jul 2026

**Data:** intraday 30m 2025-01-08 → 2026-07-17 (106.985 candle, RSI+MACD) + daily
bandarmology 357 hari. Entry = close candle terakhir (closing auction, ~16:00).
Exit dasar = close candle pertama ≥ 09:15. Biaya = fee 0.40% + 1 tick slippage exit
(~0.20% di harga 4000-an → total ~0.60%). Standar: WLB, temporal split ≤15pp, no
look-ahead (sinyal entry dari candle ≤15:30).

## Vonis: BELUM LAYAK — mati suri, bukan mati permanen. Pantau bulanan.

## Kronologi edge (baseline exit 09:15, NET setelah biaya)
| Periode | n | gross | net | win(net) |
|---|---|---|---|---|
| H1-2025 pre-bear | 102 | +2.027% | **+1.265%** | 50% |
| H2-2025 | 126 | +0.647% | −0.079% | 44% |
| Q1-2026 crash | 55 | −0.101% | −0.846% | 47% |
| Q2+Jul-2026 revival | 69 | +0.588% | −0.162% | 45% |

Dengan filter terbaik (MACD intraday <0 saat entry — kontrarian ala TPIA v2):
H1-2025 net **+3.156% win 60%** (setara/lebih dari BSJP RAJA!), tapi full-period
hanya WLB 44 (n=178, split 53/51). Semua periode pasca-H1 negatif tipis.

## Temuan kunci
1. **Edge-nya pernah nyata** (H1-2025), bukan ilusi statistik.
2. **Revival Q2-2026 nyata di level gross** (+0.59%, karakter momentum balik,
   win gross 59% di daily) — tapi biaya 0.60% persis memakan habis. Konsisten
   dengan screener 19 Jul: RATU #1 se-IHSG by WLB (gross), NET6 −0.27 (TIDAK).
3. **Jam exit tidak menolong**: open/09:00/09:15/09:30/10:00 semua WLB 39–44.
   09:15 paling stabil split-nya.
4. 15+ varian filter mikro diuji (dayRet, H-1 hijau/merah, MACD, RSI, kombinasi
   ringan) — tidak ada yang mendekati standar RAJA (WLB 64.5). Berhenti di sini
   supaya tidak overfitting. Imbalance & foreign TIDAK diuji ulang (daftar
   jangan-diuji-ulang).

## Ambang kebangkitan (kriteria monitoring, BUKAN formula)
Biaya bulat ~0.60%/malam. Aktifkan pipeline penuh ulang HANYA jika drift gross
rolling 60 hari ≥ ~0.9–1.0% (margin, bukan pas-pasan) dan win gross ≥ 55%.
Cek via BSJP Screener bulanan (RATU: gross avg vs biaya). Sekarang: 0.59 → belum.

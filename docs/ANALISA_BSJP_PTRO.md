# ANALISA BSJP PTRO — 19 Jul 2026 (KANDIDAT v1, BELUM FINAL)

**Data:** intraday 30m 2025-01-02 → 2026-07-17 (360 hari, 116.048 candle, RSI+MACD).
Split ter-adjust rapi (dicek: tak ada lompatan >35% antar close). Entry = close candle
terakhir (~16:00). Biaya = 0.40% + 1 tick exit (~0.25% @4000 → total ~0.65%).

## KANDIDAT FORMULA v1
```
Entry : sore di closing, HANYA jika dayRet live > +3%
        (= hijau >3% saat entry; identik "H-1 hijau" karena entry di close)
Exit  : besok 09:15 fix
n=69 (≈47/thn) | net +2.241%/malam | win 72% | WLB 61 | MDD 6.6%
Kumulatif 18bln: +155% (simple sum, net)
```

## Validasi
- Threshold monotonik mulus: >0% WLB 53 → >2% 55 → >3% **61** → >5% rusak (gap split 22pp)
- Exit grid: open 45 / 09:15 **61** / 09:30 55 / 10:00 56 → 09:15 puncak jelas
- Stress per periode (net): H1-25 +2.02 (win 68) | H2-25 +1.68 (win 81) |
  **Q1-26 CRASH +3.35 (win 90, n=10)** | Q2+Jul +2.80 (win 50, n=14)
- WLB split EARLY 60 / LATE 52 (gap 8 ≤ 15 ✓)
- Eksekutabilitas: dari 14 hari hijau >10%, hanya 2 nyerempet ARA (19.7/22%) — closing
  auction normal di sisanya. Likuiditas 15:00-close di hari sinyal: median Rp56 M,
  min Rp8.7 M → ukuran ritel aman
- 5 malam terburuk: −5.5 / −4.2 / −3.0 / −2.7 / −2.0

## Kenapa BELUM final (2 catatan jujur)
1. **Periode terbaru terlemah**: Q2+Jul win 50% (n=14), searah LATE split 52.
   Edge mungkin melunak — pantau, jangan abaikan.
2. Threshold 3% & exit 09:15 dipilih dari grid pasca-lihat-data (selection bias ringan;
   dimitigasi pola monotonik + split lolos, tapi butuh konfirmasi independen).

## LANGKAH LANJUT
Uji lapisan bandarmology (resep RAJA): imbalance H-1 s/d H-5 pada subset hijau >3%.
→ BUTUH export: PTRO daily + broker imbalance format ratu_daily.json, 2025-01-01 → skrg.
Hasil uji: lift WLB → naik kelas RAJA; netral → v1 berdiri sendiri (kelas TPIA+).
Pembanding: BSJP RAJA WLB 64.5 avg +1.83 MDD 7.4 | TPIA WLB 69.2 avg +0.61.

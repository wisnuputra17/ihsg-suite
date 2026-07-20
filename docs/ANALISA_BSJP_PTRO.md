# ANALISA BSJP PTRO — 19 Jul 2026 (FORMULA v1 — STATUS: MASA PERCOBAAN)

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

## UJI BANDARMOLOGY (19 Jul, data daily+imbalance 361 hari) — TIDAK MENAMBAH NILAI
Pada 69 malam sinyal, imbalance H-1 (window 5d):
- imb > 0 : n=33 net +3.016% win 76% WLB 59
- imb ≤ 0 : n=36 net +1.530% win 69% WLB 53  ← tetap untung tebal!
- Spearman imbalance vs net: +0.138 (gradien lemah) | concentration: tidak jelas arah
Memfilter = buang malam profitable, n 69→33, WLB TURUN 61→59 (Wilson menghukum n kecil
lebih dari hadiah win). → v1 BERDIRI SENDIRI tanpa bandar — satu keluarga dgn TPIA
(price action murni). Imbalance PTRO masuk daftar JANGAN-DIUJI-ULANG.

## STATUS: MASA PERCOBAAN
Paper trade / posisi kecil 1–2 bulan. Naikkan ukuran HANYA jika win live ≈65–70%.
Pantau bulanan bersama ambang RATU. Alasan: WLB 61 di bawah RAJA (64.5) + Q2+Jul
win 50 (n=14, edge mungkin melunak).
Pembanding: BSJP RAJA WLB 64.5 avg +1.83 MDD 7.4 | TPIA WLB 69.2 avg +0.61.

## INTRADAY PTRO — DITOLAK (19 Jul 2026, framework STEP 3 lengkap)
Entry 09:00 open, ORB close-based 5 candle (shared/orb.js), grid deadline+exit+threshold:
- Distribusi gap: MEDIAN +0.73% (!) — edge PTRO terdistribusi OVERNIGHT, bukan siang
- GAP UP (58% hari): makin siang makin negatif (09:30 +0.18 → close −0.24, win 34-42%)
- STABIL: tipis (+0.1-0.3 gross), tidak menutup fee
- GAP DOWN (kandidat terbaik): SEMUA varian WLB < 50 (maks 47 @gap<−1 n=33) → ambang
  merah framework. Tail check FATAL: 5 hari terbaik = 108% total profit (tanpa itu RUGI)
- Fee DT 0.26 vs REG 0.40 tidak mengubah vonis
KESIMPULAN: PTRO satu arah — BSJP only. Intraday PTRO masuk daftar JANGAN-DIUJI-ULANG.
(Kontras RAJA: edge siang; tiap emiten beda karakter.)

## v1.1 — SPESIFIKASI OPERASIONAL EKSEKUTABEL (20 Jul, dari laporan bug Wisnu)
Kasus 20 Jul: precheck 15:55 SKIP, lelang penutupan menggeser close melewati +3% →
kartu (v1, sinyal=close final) mengklaim posisi yang tidak diambil. Kuantifikasi:
flip live↔final hanya 2 masuk + 3 keluar dari ~70 sinyal / 18 bln = IMATERIAL.
**v1.1: sinyal = dayRet dari harga 15:50** (angka yang tersedia saat memutuskan):
n=70, net +2.175%, win 71%, WLB 60, split 77/66 — praktis identik v1 (WLB 61).
Kartu dipatok ke definisi ini (precheck & evaluasi final konsisten, flip mustahil).
Entry price tetap close resmi (harga fill lelang). Label kartu dijujurkan:
"SINYAL AKTIF (posisi formula)" — kartu memonitor formula, bukan posisi trader.

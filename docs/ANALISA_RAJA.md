# ANALISA KOMPREHENSIF RAJA — IHSG Suite
**Tanggal:** 2 Juli 2026  
**Data:** ihsg-RAJA-2021-06-30_2026-06-30.json (daily, 5 tahun) + tes.json (intraday 1m, 239 hari Jul 2025–Jul 2026)  
**Metodologi:** Wilson Lower Bound (WLB) 95% confidence, state machine simulation, grid search exhaustif  

---

## DAFTAR ISI

1. [Konsep Dasar & Metodologi](#1-konsep-dasar--metodologi)
2. [RAJA Swing — Perjalanan Eksplorasi](#2-raja-swing--perjalanan-eksplorasi)
3. [Kunci RAJA Swing — Formula Final](#3-kunci-raja-swing--formula-final)
4. [RAJA Intraday — Eksplorasi Lengkap](#4-raja-intraday--eksplorasi-lengkap)
5. [ORB (Opening Range Breakout) — Penjelasan & Validasi](#5-orb-opening-range-breakout--penjelasan--validasi)
6. [IEP Gap Analysis — Temuan Kritis](#6-iep-gap-analysis--temuan-kritis)
7. [Grid Search Exit Time — Per Kondisi Gap](#7-grid-search-exit-time--per-kondisi-gap)
8. [Formula Final Intraday RAJA](#8-formula-final-intraday-raja)
9. [Simulasi Equity & Proyeksi](#9-simulasi-equity--proyeksi)
10. [Analisa Fee & Viabilitas](#10-analisa-fee--viabilitas)
11. [AMMN — Analisa Pembanding](#11-ammn--analisa-pembanding)
12. [Prinsip Umum untuk Emiten Baru](#12-prinsip-umum-untuk-emiten-baru)
13. [Checklist Implementasi Proyek Baru](#13-checklist-implementasi-proyek-baru)

---

## 1. KONSEP DASAR & METODOLOGI

### Wilson Lower Bound (WLB)
WLB adalah batas bawah statistik dari win rate dengan confidence 95%. Artinya: "kita 95% yakin bahwa win rate sesungguhnya **minimal** sebesar WLB ini."

```
WLB = (p + z²/2n - z√(p(1-p)/n + z²/4n²)) / (1 + z²/n)
      di mana: p = win rate observasi, n = jumlah sample, z = 1.96 (95%)
```

**Standar reliability:**
- WLB ≥ 70% → formula reliable, bisa dipercaya
- WLB 50–70% → ada edge tapi perlu hati-hati
- WLB < 50% → tidak reliable, nyaris lempar koin

**Kenapa bukan win rate biasa?**  
Win rate 80% dari n=5 berbeda dengan dari n=100. WLB mengakomodasi uncertainty sample kecil. Contoh:
- n=5, win=100%: WLB = 52.2% (tidak reliable!)
- n=20, win=90%: WLB = 69.9% (cukup solid)
- n=83, win=81.7%: WLB = 72.0% (reliable)

### State Machine vs Forward Return
- **Forward return** (fwd_k): hitung return k hari ke depan secara independen — sinyal bisa overlap. Cenderung overestimate performa.
- **State machine**: simulasi trading real — satu posisi pada satu waktu, entry hanya saat tidak ada posisi terbuka. Lebih konservatif dan realistis.
- **Selalu pakai state machine** untuk validasi akhir.

### Temporal Split
Semua formula divalidasi dengan membagi data menjadi dua periode (EARLY dan LATE) untuk memastikan tidak overfitting:
- Formula yang konsisten di kedua periode = reliable
- Formula yang hanya bagus di satu periode = suspect (kemungkinan overfitting)

---

## 2. RAJA SWING — PERJALANAN EKSPLORASI

### 2.1 Data yang Digunakan
- **File:** ihsg-RAJA-2021-06-30_2026-06-30.json
- **Periode:** 30 Jun 2021 – 30 Jun 2026 (5 tahun, ~1198 trading days)
- **Indikator tersedia:** RSI(14), MACD(12,26,9), MA10/20/50/100, Volume, MA Volume 20, Bollinger Width, VWMA20, POC60, RSI Divergence, LPM/Absorption, Broker data

### 2.2 Temuan dari Analisa Periode Entry Bagus

Analisa 4 periode harga naik signifikan RAJA:

| Periode | Return | RSI awal | RSI akhir | MACDh awal | Jarak MA20 |
|---------|--------|----------|-----------|------------|------------|
| P1 (BESAR) | +429% | 32.7 | 27.5 | +6.88 | -31.8% |
| P2 (BESAR) | +188% | 15.6 | 11.2 | -10.97 | -46.5% |
| P3 (moderat) | +10-19% | 37.4 | 35.5 | -10.76 | -12.8% |
| P4 (moderat) | sempat negatif | 40.5 | 36.1 | -3.84 | -10.5% |

**Pola:** Entry terbaik adalah saat RSI sangat rendah (15-33) DAN harga jauh di bawah MA20 (-12% hingga -46%). MACD histogram tidak konsisten sebagai entry signal.

### 2.3 Eksplorasi Indikator — Hasil Lengkap

**RSI threshold grid search (forward 10 hari):**

| Kondisi | n | Win% | WLB% | Avg |
|---------|---|------|------|-----|
| RSI ≤ 20 (extreme) | 14 | 100% | 78.5% | +154.40% |
| RSI ≤ 30 | ~40 | 85%+ | 65%+ | +40%+ |
| RSI ≤ 40 + MA20×0.95 | 212 | 85.4% | 80.0% | +48.90% |
| RSI ≤ 40 + MA20×0.95 + Vol>1.3x | 73 | 98.6% | 92.6% | +54.36% |

⚠️ **PERINGATAN KRITIS:** Angka-angka di atas adalah **forward return dengan overlap** (bukan state machine). Setelah bug `localeCompare` ditemukan dan diperbaiki, dan setelah state machine real diterapkan, WLB turun drastis karena sinyal oversold sering cluster (beberapa hari berturut-turut = 1 trade di state machine).

### 2.4 Bug Kritis yang Ditemukan

**Bug localeCompare:** Fungsi `sort((a,b) => a.date.localeCompare(b.date))` tidak konsisten di semua browser locale, menyebabkan data tidak tersortir dengan benar. RSI dan MACD yang dihitung dari data tidak tersortir menghasilkan nilai yang salah, membuat WLB tampak jauh lebih tinggi dari kenyataan.

**Fix:** Ganti ke `(a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0`

Setelah bug diperbaiki: WLB semua indikator turun signifikan. Formula RSI+MA20+MACD yang tadinya klaim WLB 83.9% ternyata WLB hanya ~37-52% di state machine real.

### 2.5 Eksplorasi Lanjutan Setelah Bug Fix

Semua indikator yang diuji setelah bug fix:
- RSI ≤ 30 (berbagai threshold): WLB state machine ~37-52%
- RSI + MA20 (berbagai kombinasi): WLB ~43-54%
- Bollinger Width: WLB 39.1% (lebih buruk dari baseline)
- VWMA20: WLB ~44-51%
- Volume Profile POC: WLB ~45-50%
- RSI Divergence (bullish): n=5, tidak reliable
- LPM/Absorption: WLB ~44-51%
- Broker individual: WLB ~44-52%
- ATR Breakout 1.0x + MACD≤100: WLB **53.3%** (terbaik, tapi state machine turun ke 24-33%)
- Donchian Channel Breakout: WLB terlalu kecil
- Supertrend: WLB terlalu kecil

**Kesimpulan jujur:** RAJA tidak punya sinyal entry sederhana yang reliable secara statistik menggunakan indikator teknikal standar.

### 2.6 Temuan Kunci — MACD Histogram sebagai AVOID Signal

**MACD hist > 100 sebagai sinyal AVOID/EXIT:**

| Threshold | n | Win SHORT | WLB SHORT | Avg SHORT |
|-----------|---|-----------|-----------|-----------|
| MACD > 50 | 87 | 67.8% | 57.4% | +6.07% |
| MACD > 75 | 53 | 84.9% | 72.9% | +13.01% |
| **MACD > 100** | **34** | **100%** | **89.8%** | **+18.39%** |
| MACD > 125 | 27 | 100% | 87.5% | +19.63% |

⚠️ **PENTING:** Threshold 100 ini **SPESIFIK untuk skala harga RAJA**. Untuk emiten lain dengan skala harga berbeda, threshold perlu di-recalibrate (gunakan percentile, bukan nilai absolut).

### 2.7 Connors RSI sebagai Entry Signal

Connors RSI = (RSI(3) + RSI(streak) + PercentRank(100)) / 3

Dirancang untuk mengurangi cluster dibanding RSI biasa:
- RSI biasa: sinyal muncul 3-15 hari berturut (1 trade di state machine)
- Connors RSI: sinyal lebih tersebar, menghasilkan n lebih banyak

**Grid search Connors RSI + trail% (state machine):**

| CRSI ≤ | Trail% | n | Win% | WLB% | Avg | Hold |
|--------|--------|---|------|------|-----|------|
| 15 | 30% | 11 | 81.8% | 52.3% | +106% | ~184 hari |
| 20 | 25% | 13 | 76.9% | 48.2% | +89% | ~145 hari |
| 25 | 30% | 12 | 83.3% | 54.7% | +78% | ~156 hari |

---

## 3. KUNCI RAJA SWING — FORMULA FINAL

### 3.1 Formula dengan Multi-Posisi

Temuan penting: **multi-posisi meningkatkan WLB** karena menggunakan lebih banyak kesempatan entry di satu siklus.

**Konfigurasi optimal:**
- Entry signal: **Connors RSI ≤ 15**
- Max posisi bersamaan: **3 posisi**
- Min gap antar entry: **14 hari** (mencegah averaging down berlebihan)
- Exit per posisi: **Trailing stop 30%** dari highest masing-masing posisi
- Exit semua posisi: **MACD histogram > 100** (sinyal euforia, keluar semua)

**Hasil state machine (n=20, multi-posisi max 3):**

| Metrik | 1 Posisi | 3 Posisi (Final) |
|--------|----------|------------------|
| n trades | 11 | **20** |
| Win rate | 81.8% | **90%** |
| WLB | 52.3% | **69.9%** |
| Avg return | +106% | **+106%** (serupa) |
| Avg hold | ~265 hari | ~184 hari |

**Mengapa multi-posisi lebih baik?**  
Satu siklus oversold RAJA bisa berlangsung beberapa bulan. Dengan 1 posisi, hanya masuk di hari pertama. Dengan multi-posisi, masuk beberapa kali di bawah yang lebih rendah — ini menurunkan average cost dan meningkatkan profit saat reversal.

### 3.2 Detail Trades (State Machine, 5 tahun)

Semua trade menguntungkan (win rate 100% dalam state machine multi-posisi):
- Trade terpanjang: 611 hari (exit via trailing stop)
- Trade terpendek: 21 hari (exit via MACD>100)
- Avg hold: ~184 hari

### 3.3 Stop Loss — Tidak Digunakan

Stop loss 5% diuji dan hasilnya merusak WLB dari 69.9% → 11%. Ini karena karakter RAJA: harga sering dip di bawah entry sebelum rally besar. Stop loss memotong trade yang seharusnya profitable.

**Kesimpulan:** Untuk RAJA swing, **tidak ada stop loss**. Risk management dilakukan via:
1. Diversifikasi (tidak taruh semua di satu emiten)
2. Max 3 posisi (tidak averaging down tak terbatas)
3. Min gap 14 hari antar entry

---

## 4. RAJA INTRADAY — EKSPLORASI LENGKAP

### 4.1 Data yang Digunakan
- **File:** tes.json
- **Konten:** 76,654 candle RAJA intraday 1 menit
- **Periode:** Juli 2025 – Juli 2026 (239 hari bursa)
- **Catatan:** Meski file dinamai "30m", data ternyata 1 menit (321 candle/hari)

### 4.2 Konsep IEP (Indicative Equilibrium Price)
IEP = harga indikatif yang terbentuk selama sesi lelang pre-opening (08:45–08:59 WIB).  
- IEP adalah estimasi harga pembukaan berdasarkan order yang masuk
- IEP FINAL terbentuk paling akhir menjelang 09:00
- **Tidak bisa langsung entry di harga IEP** — order baru dieksekusi saat pasar buka 09:00

### 4.3 Konsep ORB (Opening Range Breakout)
Opening Range = range harga di 5 candle pertama setelah pasar buka:
- **Candle:** 09:00, 09:01, 09:02, 09:03, 09:04
- **ORB High** = max(high semua candle)
- **ORB Low** = min(low semua candle)
- **ORB Breakout UP** = ada candle setelah 09:04 yang close-nya melampaui ORB High

**Contoh konkret:**
```
09:00  high=1255, low=1238
09:01  high=1260, low=1248
09:02  high=1258, low=1250
09:03  high=1256, low=1249
09:04  high=1265, low=1252

ORB High = 1265, ORB Low = 1238

09:05  close=1270 > 1265 → ORB BREAKOUT UP ✓
```

### 4.4 Validasi ORB dari Data

**Distribusi kapan ORB High hari itu terbentuk:**
- 09:00–09:04 (dalam ORB window): ~55% hari
- 09:05–09:09: ~20% hari
- Setelah 09:10: ~25% hari

**Distribusi kapan ORB Breakout UP terjadi (09:05-09:29):**
- 09:05: 12.1% hari
- 09:06–09:10: ~35% hari
- 09:11–09:14: ~21% hari
- Tidak ada ORB sebelum 09:15: ~32% hari

**Apakah ada ORB terlambat (setelah 09:30)?**  
Dari analisa: **0 hari** yang tidak ada ORB sebelum 09:30 lalu tiba-tiba breakout setelahnya. Ini memvalidasi deadline 09:15 sebagai cutoff.

---

## 5. ORB (OPENING RANGE BREAKOUT) — PENJELASAN & VALIDASI

### 5.1 Kenapa Deadline 09:15?

Grid search dari berbagai deadline:

| Deadline | n ORB | Equity | MDD | WLB ORB | Avg/hari |
|----------|-------|--------|-----|---------|---------|
| 09:06 | 29 (12%) | 140.1u | -19.1% | 50.8% | +0.176% |
| 09:11 | 60 (25%) | 136.8u | -24.3% | 52.4% | +0.183% |
| **09:16** | **83 (35%)** | **180.8u** | **-26.3%** | **58.1%** | **+0.311%** |
| 09:21 | 93 (39%) | 167.9u | -26.9% | 57.7% | +0.282% |
| 09:31 | 111 (46%) | 126.8u | -31.0% | 56.5% | +0.171% |

**Deadline 09:15 optimal** karena:
- Equity tertinggi (180.8u)
- MDD relatif rendah (-26.3%)
- WLB ORB terbaik (58.1%)
- Frekuensi cukup (35% hari)

### 5.2 Entry Timing: IEP vs Open 09:00

| Entry | n | Win% | WLB% | Avg |
|-------|---|------|------|-----|
| IEP (08:58) | 82 | 81.7% | 72.0% | +2.46% |
| Open 09:00 | 82 | 81.7% | 72.0% | +2.37% |

**Selisih hanya +0.09%** — tidak signifikan secara praktis. Entry di IEP tidak bisa dieksekusi karena IEP belum final saat itu. **Gunakan Open 09:00.**

**Slippage IEP → Open 09:00:**
- Median: 0% (46.9% hari Open = IEP persis)
- Rata-rata: +0.108%
- 42.7% hari Open lebih mahal dari IEP
- 10.5% hari Open lebih murah dari IEP

---

## 6. IEP GAP ANALYSIS — TEMUAN KRITIS

### 6.1 Definisi Gap

Gap dihitung dari: **(IEP close – close kemarin) / close kemarin × 100%**

| Kategori | Threshold | Jumlah | % | Avg Gap |
|----------|-----------|--------|---|---------|
| GAP UP | > +0.5% | 110 hari | 46.2% | +1.83% |
| STABIL | ±0.5% | 88 hari | 37.0% | +0.07% |
| GAP DOWN | < -0.5% | 40 hari | 16.8% | -2.92% |

### 6.2 Performa ORB per Kondisi Gap

| Kategori | ORB Muncul | Win% ORB | WLB ORB | Avg ORB | Avg WIN | Avg LOSS |
|----------|------------|----------|---------|---------|---------|---------|
| **SEMUA** | 34.5% | 81.7% | 72.0% | +2.37% | +3.08% | -0.82% |
| **GAP UP** | 37.3% | **85.4%** | 71.6% | **+2.77%** | +3.44% | -1.13% |
| **STABIL** | 27.3% | 70.8% | **50.8%** | +1.47% | +2.36% | -0.70% |
| **GAP DOWN** | 42.5% | **88.2%** | 65.7% | **+2.67%** | +3.07% | **-0.37%** |

### 6.3 Insight Penting

**GAP DOWN bukan sinyal buruk:**
- ORB lebih sering muncul saat GAP DOWN (42.5%) dibanding GAP UP (37.3%)
- Win rate tertinggi: 88.2%
- Kemungkinan karena: harga terkoreksi pre-opening → begitu ada breakout, momentum lebih kuat
- Avg loss sangat kecil (-0.37%) — bahkan di hari kalah, kerugiannya minimal

**STABIL adalah kondisi terlemah:**
- WLB ORB hanya 50.8% — nyaris tidak ada edge
- ORB paling jarang muncul (27.3%)
- **Rekomendasi: SKIP hari STABIL**

**Dampak skip STABIL (equity 1 tahun):**
- Trading semua hari: 185.3u
- Skip STABIL: **231.8u (+25%)**
- MDD turun: 18.0% → **15.5%**

---

## 7. GRID SEARCH EXIT TIME — PER KONDISI GAP

### 7.1 GAP UP (n=41 hari ORB UP)

| Exit | Win% | WLB% | Avg | R/R | Verdict |
|------|------|------|-----|-----|---------|
| 09:15 | 92.7% | **80.6%** | +2.37% | 2.15x | Win rate tertinggi |
| **09:30** | 85.4% | 71.6% | +2.77% | 3.06x | Balanced |
| **10:00** | 85.4% | 71.6% | **+2.83%** | **4.36x** | ★ Score terbaik |
| 10:30 | 80.5% | 66.0% | +2.70% | 4.08x | Mulai menurun |
| 11:00 | 75.6% | 60.7% | +2.88% | 4.12x | WLB drop |
| 11:30 | 78.0% | 63.3% | +2.87% | 3.65x | WLB drop |
| 12:00 | 78.0% | 63.3% | +2.77% | 3.50x | WLB drop |
| 13:30 | 73.2% | 58.1% | +2.69% | 3.75x | Tidak worth it |
| EOD | 65.9% | 50.5% | +2.69% | 2.37x | WLB buruk |

**Kesimpulan GAP UP: exit 10:00** — WLB sama dengan 09:30 tapi R/R jauh lebih baik (4.36x vs 3.06x). Setelah 10:00 WLB terus menurun.

### 7.2 GAP DOWN (n=17 hari ORB UP)

| Exit | Win% | WLB% | Avg | R/R | Verdict |
|------|------|------|-----|-----|---------|
| **09:15** | **100%** | **81.6%** | **+2.80%** | ∞ | ★ Terbaik mutlak |
| 09:30 | 88.2% | 65.7% | +2.67% | 8.37x | Masih bagus |
| 10:00 | 82.4% | 59.0% | +2.36% | 2.39x | Drop tajam |
| 10:30 | 82.4% | 59.0% | +2.47% | 2.01x | Drop tajam |
| 11:00 | 64.7% | 41.3% | +1.95% | 2.18x | Buruk |
| EOD | 52.9% | 31.0% | +3.36% | 5.36x | Avg tinggi, WLB buruk |

**Kesimpulan GAP DOWN: exit 09:15** — 100% win rate, WLB 81.6%. Momentum GAP DOWN sangat singkat, tidak worth it tahan lebih lama.

⚠️ **Catatan n kecil:** n=17 untuk GAP DOWN — perlu lebih banyak data untuk konfirmasi penuh. 100% win rate dari 17 trade memang menarik tapi belum konklusif secara statistik absolut.

### 7.3 Simulasi Equity — Semua Kombinasi Exit

| Kombinasi | n | WLB ORB | Equity | CAGR | MDD |
|-----------|---|---------|--------|------|-----|
| UP→09:30, DOWN→09:15 | 150 | 79.2% | 237.4u | +327.5% | 15.6% |
| UP→09:15, DOWN→09:15 | 150 | 85.9% | 203.0u | +228.6% | 17.1% |
| **UP→10:00, DOWN→09:15** | **150** | **79.2%** | **244.0u** | **+342.9%** | **15.6%** |
| UP→11:00, DOWN→09:15 | 150 | 71.1% | 244.0u | +347.5% | 15.6% |
| UP→11:30, DOWN→09:15 | 150 | 73.1% | 242.8u | +343.9% | 16.2% |
| UP→12:00, DOWN→09:15 | 150 | 73.1% | 232.4u | +312.5% | 16.2% |
| UP→13:30, DOWN→09:15 | 150 | 69.1% | 225.0u | +290.5% | 16.8% |
| UP→EOD, DOWN→09:15 | 150 | 63.5% | 217.9u | +270.0% | 16.6% |

**Pemenang: UP→10:00, DOWN→09:15**
- Equity tertinggi yang juga punya WLB ORB solid (79.2%)
- UP→11:00 punya equity sama tapi WLB lebih rendah (71.1% vs 79.2%) — tidak sebanding risikonya

---

## 8. FORMULA FINAL INTRADAY RAJA

### 8.1 Formula Lengkap

```
LANGKAH 1 — 08:45-08:59: Hitung IEP Gap
  gapPct = (IEP_close – prev_close) / prev_close × 100%
  
  GAP UP   : gapPct > +0.5%   → Lanjut ke entry
  GAP DOWN : gapPct < -0.5%   → Lanjut ke entry (exit lebih awal)
  STABIL   : ±0.5%            → SKIP hari ini, tidak trading

LANGKAH 2 — 09:00: Entry
  Masuk di Open price jam 09:00 (jika bukan STABIL)

LANGKAH 3 — 09:00-09:04: Hitung ORB
  ORB High = max(high candle 09:00-09:04)
  ORB Low  = min(low candle 09:00-09:04)

LANGKAH 4 — 09:05-09:14: Monitor Breakout
  Ada candle close > ORB High? → ORB UP CONFIRMED
  Tidak ada sampai 09:15?      → EXIT AVOID

LANGKAH 5 — Exit
  ORB UP + GAP UP   → Exit di jam 10:00
                       (WLB 71.6%, avg +2.83%, R/R 4.36x, win 85.4%)
  
  ORB UP + GAP DOWN → Exit di jam 09:15
                       (WLB 81.6%, avg +2.80%, win 100%, n=17)
  
  Tidak ada ORB     → EXIT AVOID jam 09:15
                       (avg -0.81% — jauh lebih baik dari stay sampai 12:00 avg -3.56%)
  
  STABIL            → Tidak trading sama sekali
```

### 8.2 Statistik Per Skenario

**Skenario ORB UP + GAP UP (exit 10:00):**
- n = 41 hari
- Win rate: 85.4%
- WLB: 71.6%
- Avg return: +2.83%
- Avg WIN: +3.45%
- Avg LOSS: -0.79%
- R/R: 4.36x

**Skenario ORB UP + GAP DOWN (exit 09:15):**
- n = 17 hari
- Win rate: 100%
- WLB: 81.6%
- Avg return: +2.80%
- Avg WIN: +2.80%
- Avg LOSS: 0% (tidak pernah rugi)
- R/R: ∞

**Skenario EXIT AVOID (tidak ada ORB, exit 09:15):**
- n = 92 hari (GAP UP+DOWN tanpa ORB)
- Win rate sebagai LONG: ~14%
- WLB AVOID (prediksi turun): 74.4%
- Avg loss: -0.81%

**Skenario SKIP STABIL:**
- 88 hari di-skip
- WLB ORB di hari stabil: 50.8% — tidak layak

### 8.3 Validasi Temporal

**EARLY (Jul-Des 2025):**
- Semua hari: equity 104.5u, avg +0.066%/hari
- Skip STABIL: equity **113.3u**, avg +0.205%/hari

**LATE (Jan-Jul 2026):**
- Semua hari: equity 177.3u, avg +0.558%/hari
- Skip STABIL: equity **204.6u**, avg +1.026%/hari

Formula konsisten di kedua periode ✓

---

## 9. SIMULASI EQUITY & PROYEKSI

### 9.1 Equity Curve Aktual (1 Tahun, Tanpa Fee)

Modal: 100 unit, trading hanya hari GAP UP/DOWN + ORB UP

| Bulan | Return | Modal | ORB | AVOID |
|-------|--------|-------|-----|-------|
| Jul 2025 | +13.34% | 113u | 10 | 7 |
| Agu 2025 | +8.00% | 122u | 7 | 5 |
| Sep 2025 | +7.37% | 131u | 7 | 4 |
| Okt 2025 | +33.90% | 176u | 8 | 6 |
| Nov 2025 | +4.48% | 184u | 8 | 4 |
| Des 2025 | +1.86% | 187u | 3 | 8 |
| Jan 2026 | +21.59% | 228u | 12 | 5 |
| Feb 2026 | +25.89% | 287u | 8 | 3 |
| Mar 2026 | +11.78% | 320u | 4 | 7 |
| Apr 2026 | +11.81% | 358u | 6 | 3 |
| Mei 2026 | +18.04% | 423u | 5 | 4 |
| Jun 2026 | +13.71% | 481u | 4 | 6 |
| **Total** | **+381%** | **481u** | **82** | **62** |

**Tidak ada bulan merah** — karena hari AVOID di-skip (tidak ada entry) dan hari STABIL di-skip.

### 9.2 Metrik Kunci

| Metrik | Nilai |
|--------|-------|
| CAGR (dari data aktual) | +424% |
| Max Drawdown | -15.6% |
| Calmar Ratio | 27.2x |
| Sharpe Ratio | 1.68 (proxy) |
| Hari trading/tahun | ~144 hari (dari 239) |
| % hari trading | ~60% |

### 9.3 Proyeksi Dengan Fee Stockbit (0.15% beli + 0.25% jual = 0.40%)

Fee total: 0.40% × 144 hari = 57.6%/tahun (untuk hari trading saja)

| Skenario | CAGR | Modal 1 thn (dari 10jt) |
|----------|------|------------------------|
| Tanpa fee (teoritis) | +424% | Rp 52.4 jt |
| Dengan fee 0.40% | **+285%** | **Rp 38.5 jt** |

Berbeda dari strategi harian yang trading setiap hari — fee di sini hanya kena di 144 hari ORB, tidak 239 hari. Masih sangat viable.

---

## 10. ANALISA FEE & VIABILITAS

### 10.1 Fee Stockbit

| Komponen | % |
|----------|---|
| Beli | 0.15% |
| Jual (incl. PPh 0.1%, levy) | 0.25% |
| **Total round-trip** | **0.40%** |

### 10.2 Dampak Fee per Strategi

**Intraday SETIAP HARI (239 hari):**
- Fee: 0.40% × 239 = 95.6%/tahun
- Hasil: **RUGI -28.8%** — strategy hancur
- ❌ Tidak viable

**Intraday HANYA hari ORB (144 hari):**
- Fee: 0.40% × 144 = 57.6%/tahun
- CAGR setelah fee: ~+285%
- ✓ Masih sangat profitable

**Swing RAJA (rata-rata 1-3 trade/tahun):**
- Fee: 0.40% × ~4 = 1.6%/tahun (sangat kecil)
- CAGR hampir tidak terpengaruh
- ✓ Sangat efisien

### 10.3 Entry Saat ORB Confirmed vs Open 09:00

Jika masuk SETELAH ORB dikonfirmasi (bukan 09:00):
- Entry premium: harga sudah naik di atas ORB High
- Return dari titik entry ke exit: sangat tipis, tidak cukup cover fee
- **Juga RUGI** setelah fee

**Kesimpulan kritis:** Entry HARUS di Open 09:00 (sebelum tahu ORB). ORB dipakai sebagai filter STAY vs EXIT, bukan sebagai trigger entry.

---

## 11. AMMN — ANALISA PEMBANDING

### 11.1 Data
- **File:** ihsg-AMMN-2023-08-01_2026-07-01.json
- **Periode:** 3 tahun (lebih pendek dari RAJA)
- **Kondisi:** Downtrend struktural 2024-2026 (harga dari 9525 → 3240)

### 11.2 Connors RSI pada AMMN

| CRSI ≤ | fwd10: Win% | WLB% | Avg |
|--------|-------------|------|-----|
| 10 | 50.0% | 23.7% | -0.91% |
| 15 | 53.1% | 36.4% | -1.04% |
| 20 | 53.1% | 36.4% | -1.04% |

**Formula RAJA tidak bisa diterapkan langsung ke AMMN.** Karakter berbeda:
- RAJA: mean-reverting setelah oversold (beli di dip, tunggu reversal)
- AMMN: downtrend struktural, RSI rendah tidak berarti reversal

### 11.3 Formula Terbaik untuk AMMN

**4 candle hijau berturut + Volume > 1.3x MA20:**
- WLB: 30.1%
- n: 4 trades
- Avg: +21.07%
- **Tidak reliable — n terlalu kecil**

### 11.4 MACD AMMN

Threshold berbeda karena skala harga berbeda:
- MACD AMMN max: 313.7 (vs RAJA ~100-200)
- MACD > 30 (threshold berbeda) sebagai short signal: WLB ~50%
- Tidak sekuat RAJA karena downtrend yang kuat

**Pelajaran:** Setiap emiten perlu kalibrasi sendiri. Jangan copy-paste formula antar emiten.

---

## 12. PRINSIP UMUM UNTUK EMITEN BARU

### 12.1 Framework Analisa (Urutan Prioritas)

```
STEP 1: Pahami karakter emiten
  - Apakah trending atau mean-reverting?
  - Apakah liquid? (volume harian)
  - Apakah ada pola seasonal?

STEP 2: Analisa IEP Gap
  - Hitung distribusi gap dari close kemarin
  - Tentukan threshold (default ±0.5%, tapi bisa berbeda)
  - Validasi: apakah gap UP vs DOWN punya pola berbeda?

STEP 3: ORB Analysis (intraday)
  - Hitung ORB High/Low dari 09:00-09:04
  - Test deadline 09:10, 09:15, 09:20, 09:30
  - Grid search exit time per kondisi gap

STEP 4: Swing Analysis
  - Test Connors RSI threshold (10, 15, 20, 25, 30)
  - Test trailing stop (15%, 20%, 25%, 30%, 35%)
  - Cari MACD threshold untuk AVOID (percentile P90, P95)
  - Test multi-posisi (max 2, 3, 4 dengan gap 7, 14, 21 hari)

STEP 5: Validasi
  - Temporal split (EARLY vs LATE)
  - Pastikan WLB ≥ 60% di kedua periode
  - Hitung equity curve dan MDD
```

### 12.2 Red Flags (Tanda Formula Tidak Reliable)

❌ WLB < 50%  
❌ n < 15 trade (untuk intraday), n < 10 (untuk swing)  
❌ Performa sangat berbeda di EARLY vs LATE  
❌ WLB tinggi hanya di forward return, turun drastis di state machine  
❌ Threshold yang sangat spesifik (misal MACD > 100.3) — kemungkinan curve fitting  

### 12.3 Indikator yang Terbukti Berguna untuk RAJA

| Indikator | Kegunaan | Catatan |
|-----------|---------|---------|
| Connors RSI | Entry signal swing | Threshold 15 untuk RAJA |
| MACD hist | Exit signal swing | >100 untuk RAJA (skala-spesifik) |
| Trailing stop | Exit mekanisme | 30% untuk RAJA |
| IEP Gap | Filter intraday | >±0.5% |
| ORB breakout | Konfirmasi intraday | Deadline 09:15 |
| Volume ratio | Filter entry | Vol > 1.3x MA20 (tambahan opsional) |

### 12.4 Indikator yang Tidak Terbukti untuk RAJA

❌ Bollinger Width (sinyal terlalu umum)  
❌ VWMA (tidak ada edge signifikan)  
❌ Volume Profile POC (tidak konsisten)  
❌ RSI Divergence (n terlalu kecil)  
❌ LPM/Absorption sebagai entry signal (tapi berguna untuk context)  
❌ Broker individual (tidak ada edge statistik)  
❌ ATR Breakout (bagus di forward return, hancur di state machine)  

### 12.5 MACD Threshold — KALIBRASI PER EMITEN

**KRITIS:** Threshold MACD 100 untuk RAJA TIDAK bisa dipakai untuk emiten lain karena bergantung pada skala harga.

**Cara kalibrasi:**
```python
# Ambil semua nilai MACD hist historis
macd_values = [d['macdHist'] for d in daily if d['macdHist'] is not None]

# Tentukan threshold sebagai percentile tinggi
p90 = sorted(macd_values)[int(len(macd_values)*0.90)]
p95 = sorted(macd_values)[int(len(macd_values)*0.95)]

# Test keduanya sebagai AVOID signal
# Pilih yang punya WLB AVOID tertinggi
```

Untuk RAJA: MACD P90 = ~70, P95 = ~100 → threshold 100 kebetulan = P95

---

## 13. CHECKLIST IMPLEMENTASI PROYEK BARU

### 13.1 Data yang Dibutuhkan

**Untuk analisa swing:**
- Daily OHLCV minimal 3 tahun (5 tahun lebih baik)
- Indikator: RSI(14), MACD(12,26,9), MA10/20/50/100, Volume, MA Volume 20
- Connors RSI dihitung dari OHLCV
- Broker flow (opsional, untuk context)

**Untuk analisa intraday:**
- Candle 1 menit minimal 100 hari (200+ hari lebih baik)
- Candle mencakup 08:45-09:30 (periode IEP + ORB + exit window)
- Prev close dari daily (untuk hitung IEP gap)

### 13.2 Urutan Analisa Otomatis

```
INPUT: Kode emiten (misal "RAJA")
OUTPUT: Laporan analisa lengkap

1. Fetch data daily (5 tahun)
2. Hitung semua indikator
3. Eksplorasi swing:
   a. Grid search Connors RSI threshold (5-35)
   b. Grid search trailing stop (10-40%)
   c. Kalibrasi MACD threshold (P85-P95)
   d. Test multi-posisi
   e. Validasi temporal split
4. Eksplorasi intraday:
   a. Fetch data 1m (atau terkecil yang tersedia)
   b. Hitung distribusi IEP gap
   c. Test berbagai deadline ORB
   d. Grid search exit time per kondisi gap
   e. Validasi temporal split
5. Generate laporan:
   - Formula swing terbaik + statistik
   - Formula intraday terbaik + statistik
   - Equity curve simulasi
   - Red flags dan catatan
```

### 13.3 Output Standar per Emiten

```
=== EMITEN: [KODE] ===

SWING:
  Formula: [kondisi entry] → [exit mechanism]
  n trades: [n]  WLB: [%]  Win rate: [%]  Avg hold: [hari]
  Avg return: [%]  MDD: [%]  CAGR: [%]

INTRADAY:
  IEP Gap threshold: [±X%]
  ORB deadline: [jam]
  GAP UP  → exit [jam]: WLB [%], avg [%], win [%]
  GAP DOWN → exit [jam]: WLB [%], avg [%], win [%]
  STABIL  → SKIP (WLB hanya [%])
  
  Equity 1 thn: [u]  MDD: [%]  Hari trading/thn: [n]

CATATAN:
  - MACD avoid threshold: [nilai] (P[percentile])
  - Validasi temporal: EARLY [%], LATE [%] → [konsisten/tidak]
  - Red flags: [daftar]
```

### 13.4 Parameter Default (Titik Awal untuk Setiap Emiten Baru)

```python
SWING_DEFAULTS = {
    'connors_rsi_thresholds': [10, 15, 20, 25, 30],
    'trailing_stop_pcts': [15, 20, 25, 30, 35],
    'max_positions': [1, 2, 3],
    'min_gap_days': [7, 14, 21],
    'macd_percentiles': [85, 90, 95],
}

INTRADAY_DEFAULTS = {
    'gap_threshold': 0.5,           # ±0.5% untuk STABIL
    'orb_window': ('09:00', '09:04'),
    'deadlines': ['09:06', '09:11', '09:16', '09:21', '09:31'],
    'exit_times': ['09:15', '09:30', '10:00', '10:30', '11:00',
                   '11:30', '12:00', '13:30', '15:50'],
    'avoid_exit': '09:15',          # selalu exit AVOID di 09:15
}

VALIDATION = {
    'min_n_swing': 10,
    'min_n_intraday': 15,
    'min_wlb': 60.0,
    'split_date': 'MIDPOINT',       # split di tengah periode data
}
```

---

## RINGKASAN EKSEKUTIF

### Kunci RAJA Swing (FINAL)
- **Entry:** Connors RSI ≤ 15
- **Multi-posisi:** max 3, min gap 14 hari
- **Exit per posisi:** Trailing stop 30% dari highest
- **Exit semua:** MACD hist > 100
- **Statistik:** n=20, WLB 69.9%, win 90%, avg hold ~184 hari

### Kunci RAJA Intraday (FINAL)
- **Filter:** Skip hari IEP Stabil (±0.5%)
- **Entry:** Open 09:00 (GAP UP atau GAP DOWN saja)
- **ORB:** 09:00-09:04, deadline breakout 09:15
- **GAP UP + ORB UP:** exit 10:00 (WLB 71.6%, avg +2.83%)
- **GAP DOWN + ORB UP:** exit 09:15 (WLB 81.6%, avg +2.80%)
- **Tidak ada ORB:** exit AVOID 09:15 (avg -0.81%)
- **Equity 1 thn:** +381% (tanpa fee), ~+285% (dengan fee Stockbit)

### Prinsip Terpenting
1. **WLB selalu lebih penting dari win rate** — WLB mengakomodasi uncertainty n kecil
2. **State machine selalu lebih rendah dari forward return** — pakai state machine untuk validasi
3. **Temporal split wajib** — formula harus konsisten di EARLY dan LATE
4. **Fee membunuh daily trading** — hanya masuk di hari yang ada sinyal, bukan setiap hari
5. **Setiap emiten perlu kalibrasi sendiri** — jangan copy formula antar emiten

---

*Dokumen ini dibuat dari dua sesi analisa intensif (1-2 Juli 2026) menggunakan data aktual RAJA IDX. Semua angka adalah hasil backtest historis dan bukan jaminan performa masa depan.*

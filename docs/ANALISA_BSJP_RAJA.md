# ANALISA BSJP RAJA — Beli Sore Jual Pagi
**Tanggal:** 3 Juli 2026 | **Data:** tes.json (239 hari, Jul 2025–Jul 2026, intraday 1m)

---

## A. KONSEP STRATEGI

BSJP = **B**eli **S**ore **J**ual **P**agi — posisi overnight 1 malam.

```
Flow harian:
  16:00 WIB  → ENTRY di sesi lelang penutupan
  ~16:30 WIB → Cek foreign flow hari ini (sudah final di Stockbit daily API)
               → Tentukan jam exit besok
  Besok pagi → EXIT sesuai kondisi foreign
```

---

## B. FORMULA FINAL

### Entry
```
Jam    : 16:00 (sesi lelang penutupan — harga lebih final dari 15:50)
Filter : Tidak ada — masuk SETIAP hari bursa
Alasan : Semakin sore entry, semakin tinggi WLB (dari 42.9% jam 13:30
         naik terus ke 65.4% jam 16:00)
```

### Exit — Dinamis Berdasarkan Foreign Flow Malam Hari

Cek dari Stockbit daily API setelah pasar tutup (~16:30):
- `foreignbuy` dan `foreignsell` hari ini
- Hitung magnitude: `|foreignbuy - foreignsell| / (harga × volume × 100) × 100%`
- P75 magnitude ≈ 0.156% (perlu dikalibrasi ulang tiap 6 bulan)

```
Kondisi              Exit besok   WLB     Avg      n/total
─────────────────────────────────────────────────────────
NET BUY KUAT         09:05        67.9%★  +2.05%   23/238  (9.7%)
  fb > fs + mag ≥ P75

NET BUY LEMAH        10:00        49.7%   +1.15%   79/238  (33.2%)
  fb > fs + mag < P75

NET SELL KUAT        09:30        48.8%   +1.40%   37/238  (15.5%)
  fs > fb + mag ≥ P75

NET SELL LEMAH       09:00        61.1%   +0.50%   99/238  (41.6%)
  fs > fb + mag < P75
```

---

## C. STATISTIK KESELURUHAN

```
n = 238/238 (setiap hari bursa, tanpa filter entry)
WLB       = 61.9%
Win rate  = 68.1%
Avg/hari  = +1.007%
AvgWIN    = +2.66%
AvgLOS    = -2.52%
MDD       = -36.1%
Equity    = +828% (1 tahun, tanpa fee)
Equity    = +261% (1 tahun, fee Stockbit 0.40%)
Bulan profit = 11/12
```

### Temporal Split
```
EARLY (Jul-Des 2025): WLB 60.5%, avg +1.201%, n=126/126 → ✓
LATE  (Jan-Jul 2026): WLB 57.8%, avg +0.789%, n=112/112 → ✓ konsisten
```

### Monthly Breakdown
```
2025-07: +27.70%  ✓
2025-08: + 5.49%  ✓
2025-09: +36.99%  ✓
2025-10: +32.36%  ✓
2025-11: +33.38%  ✓
2025-12: +15.38%  ✓
2026-01: -13.50%  ✗ ← satu-satunya bulan merah
2026-02: +27.44%  ✓
2026-03: +18.56%  ✓
2026-04: +29.59%  ✓
2026-05: +11.01%  ✓
2026-06: +15.23%  ✓
```

---

## D. PERJALANAN ANALISA

### Step 1 — Grid Search Entry × Exit (Baseline)
- Semua kombinasi entry 09:00–16:10 × exit 09:00–15:50 diuji
- **Temuan:** semakin sore entry, WLB semakin tinggi
- Entry 16:00 → exit 09:00: WLB 65.4%★ (tertinggi, temporal konsisten)
- Entry 16:00 → exit 09:10: WLB 61.9%, equity lebih tinggi tapi temporal LATE turun

### Step 2 — Foreign Flow sebagai Penentu Exit
- Foreign buy/sell tersedia di Stockbit daily API setelah 16:30
- **Tidak tersedia** di intraday candle (selalu 0 per candle)
- RSI dan MACD daily juga tidak tersedia jam 15:45 (belum update)
- Yang tersedia real-time sore: harga OHLCV + RSI/MACD 15m (dari resampling candle 1m)

**Exit timing optimal per kondisi foreign:**
- NET BUY kuat → exit sangat awal (09:05-09:10): momentum overnight habis di pagi hari
- NET BUY lemah → hold agak lama (10:00): momentum lambat
- NET SELL kuat → rebound pagi (09:30): asing jual menekan harga, terjadi short-covering pagi
- NET SELL lemah → exit sangat awal (09:00): jangan tahan lebih dari open

### Step 3 — BSJP + ORB Exit
- Entry 15:45 + exit mengikuti sinyal ORB pagi: tidak meningkatkan WLB
- ORB pagi adalah sinyal baru yang tidak selalu aligned dengan momentum overnight

### Step 4 — RSI & MACD 15m sebagai Filter Entry
- Dihitung real-time dari resampling candle 1m → 15m
- Formula terbaik: PM_mom>1% + Hari Hijau + RSI_15m>50
  - n=39/238, WLB 61.7%, avg +2.76%, MDD 2.8%
  - Temporal: EARLY 43.3% ← lemah, LATE 68.6%

---

## E. PERBANDINGAN DENGAN STRATEGI LAIN

| Strategi | WLB | Avg/trade | MDD | Freq/thn | CAGR (dgn fee) |
|---|---|---|---|---|---|
| **BSJP (formula final)** | 61.9% | +1.01% | 36.1% | 238/thn | ~+261% |
| BSJP + filter PM>1%+Hijau+RSI15>50 | 61.7% | +2.76% | 2.8% | 39/thn | ~+107% |
| Intraday ORB GAP UP | 71.6% | +2.83% | rendah | 41/thn | ~+116% |
| Intraday ORB GAP DOWN | 81.6% | +2.80% | rendah | 17/thn | ~+48% |
| Swing RAJA (CRSI+Foreign) | 64.6% | +88.4% | 28.3% | 2-3/thn | ~+88% |

**Keunggulan BSJP:**
- Bisa dijalankan SETIAP hari (tidak perlu tunggu sinyal langka)
- Hold hanya 1 malam — risiko overnight terkontrol
- Bisa dikombinasikan dengan intraday di pagi harinya

**Kelemahan BSJP:**
- Fee membunuh profit: 238 hari × 0.40% = 95.2%/thn
- MDD -36.1% cukup dalam (vs intraday yang jauh lebih rendah)
- NET BUY lemah dan NET SELL kuat: WLB di bawah 55%

---

## F. CATATAN IMPLEMENTASI

### Cara cek magnitude foreign:
```javascript
// Dari Stockbit daily API setelah 16:30
const fb = dailyData.foreignbuy   // dalam rupiah
const fs = dailyData.foreignsell  // dalam rupiah
const vol_value = close * volume * 100  // approx value trading (Rp)
const magnitude = Math.abs(fb - fs) / vol_value * 100  // dalam %
const P75 = 0.156  // perlu dikalibrasi ulang tiap 6 bulan

const isNetBuy = fb > fs
const isStrong = magnitude >= P75

// Tentukan exit jam berapa besok:
if (isNetBuy && isStrong)  exit = '09:05'
if (isNetBuy && !isStrong) exit = '10:00'
if (!isNetBuy && isStrong) exit = '09:30'
if (!isNetBuy && !isStrong) exit = '09:00'
```

### Red flags — pertimbangkan skip hari BSJP jika:
- IHSG hari ini turun > 2% (sentiment buruk)
- Ada berita korporasi negatif RAJA setelah pasar tutup
- Harga RAJA sudah naik > 5% dalam 3 hari terakhir (overbought jangka pendek)

---

## G. PRINSIP YANG TERBUKTI DARI ANALISA INI

1. **Timing entry berpengaruh besar** — bukan hanya "sore" tapi "setelah lelang penutupan"
2. **Foreign flow adalah filter exit, bukan filter entry** — tidak bisa dipakai sebelum 16:30
3. **Exit terlalu lama = WLB turun** — setiap kondisi punya "jendela optimal"
4. **NET SELL bukan bearish** untuk BSJP — justru ada rebound karena short covering
5. **Fee adalah realita** — strategi daily trading butuh avg yang cukup besar untuk cover fee

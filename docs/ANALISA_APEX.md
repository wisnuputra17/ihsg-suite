# ANALISA APEX — 20 Jul 2026: DITOLAK (struktural)

**Data:** daily 2025-01-02 → 2026-07-17 (361 hari, OHLCV+RSI+MACD; hari parsial
20 Jul dibuang). Biaya per malam: fee 0.40 + tick 1/137 = 0.73 → **1.13%**.

## Dekomposisi
| Periode | malam | siang |
|---|---|---|
| H1-2025 | +0.372% | −0.312% |
| H2-2025 | +0.705% | +0.004% |
| Q1 CRASH | +1.264% | −1.462% |
| Q2+Jul | +0.773% | −1.107% |
| FULL | **+0.703%** | **−0.529%** |
Makhluk malam murni — tetapi gross malam < biaya 1.13% di SEMUA periode kecuali Q1.

## Keluarga hijau (exit open besok — satu-satunya exit terukur dari daily)
| Filter | n | gross | net | win | WLB | split |
|---|---|---|---|---|---|---|
| baseline | 360 | +0.703 | −0.524 | 26% | 22 | 18/34 |
| hijau>3% | 48 | +1.579 | +0.354 | 48% | 34 | 38/58 |
| hijau>5% | 30 | +1.776 | +0.572 | 50% | 33 | 33/67 |

Tiga red flag sekaligus: WLB<50 semua varian · split >15pp · tail 147% (5 malam
terbaik > total profit — tanpa mereka RUGI). Win 26% baseline = kuantisasi tick:
malam 0-tick otomatis −1.13%.

## Catatan
- Exit 09:15 TIDAK teruji (file daily) — namun lubang WLB 33→50 saat tiap trade
  membayar 1.13% tidak realistis ditutup drift pagi → export intraday TIDAK
  direkomendasikan.
- ARA-lock proxy: hanya 1/48 hari sinyal (bukan masalah utamanya).
- Konfirmasi empiris aturan tick merah screener (BUMI → TINS → APEX, makin murah
  harga makin fatal). Masuk daftar JANGAN-DIUJI-ULANG.

## OTOPSI 5 MALAM TERBAIK (20 Jul — pertanyaan Wisnu: bisakah diprediksi?)
| Tanggal | hijau | vol vs avg20 | malam | 3 hari sesudah |
|---|---|---|---|---|
| 2026-01-02 | +5.1% | 0.4x | +9.7% | −1.5 / +1.5 / −4.4 |
| 2025-11-17 | +33.6% | 16.1x | +7.9% | +4.9 / +3.7 / −0.9 |
| 2025-06-12 | +10.9% | 30.0x | +4.9% | −4.7 / −3.7 / −2.0 |
| 2026-02-03 | +6.2% | 0.5x | +4.2% | +1.5 / −2.0 / 0.0 |
| 2025-10-03 | +16.4% | 7.2x | +4.0% | −3.9 / −10.6 / −1.5 |

Median vol top5 = 7.2x vs sisanya 1.3x; RSI tidak membedakan (59 vs 55).
DIAGNOSIS: 3/5 = hari katalis (ledakan volume, spike-lalu-buang), 2/5 = artefak
pasar tipis (gap open di vol 0.4-0.5x, eksekutabilitas diragukan).
= LOTERE PERISTIWA, spesies WIFI. BUKAN formula:
(1) hipotesis lahir dari pemenang → uji di data sama = sirkular;
(2) kejadian ~belasan/18bln → n tak akan capai ambang framework;
(3) sifat tak konsisten (2/5 justru volume mati).
Wilayah yang tepat utk profit jenis ini: metode Cacing/Naga (katalis diskresioner),
bukan BSJP statistik. Vonis DITOLAK tetap.

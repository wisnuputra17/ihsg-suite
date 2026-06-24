# Setup Firebase — Panduan Lengkap

> Dibuat: 23 Jun 2026, sebagai persiapan migrasi dari Apps Script/Sheets ke
> Firebase Firestore. Alasan migrasi: Apps Script Web App terbukti flaky
> berkali-kali (CORS/500/404 berubah-ubah jenis tanpa kode diubah) — lihat
> histori sesi 23 Jun 2026 kalau butuh detail lengkap kronologinya.
>
> File yang sudah disiapkan (tinggal dipakai setelah langkah di bawah selesai):
>   - `shared/firebase.js` — pengganti `shared/sheets.js`, kontrak fungsi IDENTIK
>   - `shared/firebase.config.js` — **masih placeholder, WAJIB diisi di Langkah 4**
>   - `firestore.rules` — security rules, **WAJIB di-deploy di Langkah 5**

---

## Langkah 1 — Bikin project Firebase (gratis, Spark plan)

1. Buka **https://console.firebase.google.com**
2. Login pakai akun Google yang sama dengan yang dipakai utk Apps Script (atau akun mana pun, tidak harus sama)
3. Klik **"Add project"** / **"Create a project"**
4. Nama project bebas, misal `ihsg-suite` (boleh beda dari nama repo, tidak masalah)
5. **Google Analytics: matikan saja** (toggle off) — tidak perlu utk tool ini, biar setup lebih cepat
6. Klik **Create project**, tunggu sampai selesai (~30 detik), klik **Continue**

## Langkah 2 — Aktifkan Firestore Database

> ⚠️ Navigasi Firebase Console berubah-ubah dari waktu ke waktu — kalau
> langkah di bawah tidak cocok persis dengan yang kamu lihat, cari menu
> dengan nama serupa ("Firestore", "Database"), jangan terpaku ke nama
> tombol persis.

1. Di sidebar kiri, klik **"Databases & Storage"**
2. Klik **"Firestore"** dari submenu yang muncul
3. Klik **Create database** / **Add database**
4. Pilih **"Standard edition"** → Next
5. Database ID: biarkan default `(default)`
6. Pilih lokasi server:
   - **`asia-southeast2` (Jakarta)** kalau ada di pilihan — paling dekat, latensi paling rendah
   - Kalau tidak ada, pilih **`asia-southeast1` (Singapura)**
7. Mode security rules: pilih yang **"Locked mode"** / menolak semua akses (BUKAN mode terbuka/test) — kita pasang security rules custom sendiri di Langkah 5
8. Klik **Create**

## Langkah 3 — Aktifkan Anonymous Authentication

(Ini WAJIB — `shared/firebase.js` login anonim otomatis di belakang layar, supaya `firestore.rules` bisa nolak bot/script asing tanpa perlu kamu input username/password apa pun)

1. Sidebar kiri → klik **"Security"**
2. Klik **"Authentication"** dari submenu
3. Tab **Sign-in method** → klik **Anonymous** dari daftar provider
4. Toggle **Enable** → klik **Save**

## Langkah 4 — Ambil config & isi `shared/firebase.config.js`

1. Sidebar kiri → klik ikon ⚙️ **Project settings** (di sebelah "Project Overview")
2. Scroll ke bawah ke bagian **"Your apps"** → klik ikon **`</>`** (Web)
3. Nickname app bebas, misal `ihsg-suite-web` — **JANGAN centang "Firebase Hosting"** (kita pakai GitHub Pages, bukan Firebase Hosting)
4. Klik **Register app**
5. Akan muncul blok kode berisi `firebaseConfig = {...}` — **copy semua value di dalamnya**
6. Buka `shared/firebase.config.js` di repo, **ganti semua placeholder** (`GANTI_DENGAN_API_KEY_ASLI` dst) dengan value asli dari config tadi
7. Commit & push perubahan ini ke GitHub

**Catatan:** config ini AMAN untuk public/commit — sudah dijelaskan kenapa di komentar file-nya. Keamanan datanya dijaga oleh security rules (Langkah 5), bukan dengan menyembunyikan config ini.

## Langkah 5 — Deploy security rules

1. Kembali ke **Databases & Storage → Firestore** → klik tab **Rules**
2. **Hapus semua isi editor**, paste isi file `firestore.rules` dari repo (full, persis)
3. Klik **Publish**

## Langkah 6 — Tes koneksi (sebelum dipakai di fitur manapun)

Buka halaman mana pun di situs (misal landing page), buka Console, coba:

```js
const { gsAppend, gsLoad } = await import('./shared/firebase.js')
await gsAppend('test-collection', [{ hello: 'world', ts: Date.now() }])
const rows = await gsLoad('test-collection')
console.log('berhasil, isi:', rows)
```

Kalau muncul `berhasil, isi: [{hello:'world', ts:...}]` tanpa error — Firebase sudah terhubung dengan benar. Kalau ada error, kasih lihat saya pesan errornya persis (jangan dirangkum) — kemungkinan besar soal Langkah 3 (Anonymous Auth belum aktif) atau Langkah 5 (rules belum di-publish).

Setelah berhasil, boleh hapus collection `test-collection` itu lewat tab **Data** di Firestore Console (klik collection-nya → hapus tiap dokumen, atau biarkan saja, tidak masalah kalau mau dibiarkan — cuma data sampah kecil).

## Langkah 7 — Pindahkan 1 fitur dulu (pilot test)

Setelah Langkah 6 sukses, kita ganti **1 fitur dulu** (rencana: Ranking Emiten, karena paling baru & datanya belum banyak) — cukup ganti baris import di `features/ranking-emiten/db.js`:

```diff
- import { gsLoad, gsSave, gsAppend, gsClear } from '../../shared/sheets.js'
+ import { gsLoad, gsSave, gsAppend, gsClear } from '../../shared/firebase.js'
```

Scan ulang BULL, bandingkan: apakah lebih cepat & tidak ada error CORS/500/404 lagi. Kalau lancar, kita lanjut pindahkan fitur lain satu-satu (Win Rate Scanner, Chart LPM, Broker Analyzer, HAKA).

## Kalau ada yang gagal di tengah jalan

`apps-script/Code.gs` dan `shared/sheets.js` TIDAK dihapus — tetap ada di repo sebagai fallback. Kalau migrasi 1 fitur bermasalah, tinggal balikkan baris import-nya ke `sheets.js` lagi, fitur itu jalan seperti semula tanpa kena dampak apa pun dari percobaan Firebase.

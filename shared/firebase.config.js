/**
 * shared/firebase.config.js
 * ===========================
 * Config project Firebase — diambil dari Firebase Console setelah bikin
 * project (lihat FIREBASE_SETUP.md langkah 2).
 *
 * AMAN untuk public/commit ke GitHub apa adanya — config Firebase BUKAN
 * secret, keamanan akses datanya dijaga oleh firestore.rules (siapa boleh
 * baca/tulis), bukan dengan menyembunyikan config ini. Beda total dengan
 * GitHub PAT/token Stockbit yang WAJIB dirahasiakan — config ini tidak.
 *
 * GANTI semua nilai placeholder di bawah dengan punyamu sendiri dari:
 * Firebase Console → Project Settings → General → "Your apps" → Web app → Config
 */

export const FIREBASE_CONFIG = {
  apiKey:            'GANTI_DENGAN_API_KEY_ASLI',
  authDomain:        'GANTI.firebaseapp.com',
  projectId:         'GANTI_PROJECT_ID',
  storageBucket:     'GANTI.firebasestorage.app',
  messagingSenderId: 'GANTI_SENDER_ID',
  appId:             'GANTI_APP_ID'
}

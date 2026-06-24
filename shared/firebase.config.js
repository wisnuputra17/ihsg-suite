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
  apiKey:            'AIzaSyCiYpqptrxvDx4QfKWMgjmwK_RNFSEvVaM',
  authDomain:        'ihsg-suite.firebaseapp.com',
  projectId:         'ihsg-suite',
  storageBucket:     'ihsg-suite.firebasestorage.app',
  messagingSenderId: '166051921224',
  appId:             '1:166051921224:web:e8130fea19a2e6a610c77d'
}

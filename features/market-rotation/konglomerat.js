/**
 * PETA KONGLOMERAT — grup pengendali di IDX.
 *
 * ⚠️ STATUS: DRAF — WAJIB DIVERIFIKASI WISNU.
 * IDX tidak menyediakan label "grup konglomerat" resmi; peta ini disusun dari
 * hubungan kepemilikan/pengendali yang terdokumentasi publik dan relatif mapan.
 * Keanggotaan bisa berubah (akuisisi/divestasi) dan sebagian diperdebatkan.
 *
 * CARA EDIT: satu grup = satu entri. Tambah/hapus kode di array. Kode harus
 * cocok dengan simbol IDX (SYMS). Emiten boleh masuk >1 grup bila memang
 * kepemilikan silang — agregasi menghitung per-grup independen.
 *
 * Ini mengelompokkan untuk OBSERVASI aliran uang, bukan klaim struktur hukum.
 */
export const KONGLOMERAT = {
  'Bakrie':        ['BUMI', 'BRMS', 'ENRG', 'DEWA', 'BNBR', 'ELTY', 'VIVA', 'UNSP'],
  'Salim':         ['INDF', 'ICBP', 'DNET', 'META', 'IPCC', 'FAST', 'DMAS', 'BINA', 'MSIN'],
  'Sinarmas':      ['SMMA', 'BSDE', 'DSSA', 'INKP', 'TKIM', 'SMAR', 'BSIM', 'DUTI', 'FREN', 'GEMS', 'TOBA'],
  'Djarum':        ['BBCA', 'TOWR', 'SUPR', 'IMAS', 'PANI', 'BELI', 'MIKA'],
  'Lippo':         ['LPKR', 'LPCK', 'SILO', 'MLPL', 'MPPA', 'LINK', 'GMTD'],
  'Astra':         ['ASII', 'AUTO', 'UNTR', 'ACST', 'AALI'],
  'Barito (Prajogo)': ['BRPT', 'TPIA', 'PTRO', 'CUAN', 'BREN', 'CGAS'],
  'MNC (Tanoesoedibjo)': ['BHIT', 'BMTR', 'MNCN', 'MSIN', 'KPIG', 'IPTV', 'BABP'],
  'Emtek':         ['EMTK', 'SCMA', 'BUKA', 'DSSA'],
  'Adaro (Thohir)': ['ADRO', 'ADMR', 'BELI', 'MPMX', 'ABMM'],
  'Rajawali (Tahija/Soeryadjaya)': ['MDKA', 'ARCI', 'RATU', 'BSSR'],
  'Panin':         ['PNBN', 'PNIN', 'PNLF', 'CFIN'],
  'Wilmar/Martua': ['CPO', 'ANJT'],
}

/** Kembalikan {grup: [kode]} — hanya kode yang ada di universe SYMS. */
export function konglomeratGroups(syms) {
  const set = new Set(syms)
  const out = []
  for (const [name, members] of Object.entries(KONGLOMERAT)) {
    const valid = members.filter(c => set.has(c))
    if (valid.length >= 2) out.push({ key: name, members: valid })
  }
  return out
}

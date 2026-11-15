// Ikon SVG garis (stroke). Semua memakai viewBox 24, stroke-width 2, round cap/join.

// Ikon kategori (dipakai di tile kategori & pemilih ikon)
export const CATEGORY_ICONS = {
  makan: 'M7 3v18M4 3v5a3 3 0 0 0 6 0V3M17 21V3c-2 0-3.5 2.5-3.5 6s1.5 4 3.5 4',
  transport: 'M3 13l2-6h14l2 6v5H3zM3 13h18M7 16h.01M17 16h.01',
  belanja: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  tagihan: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  jajan: 'M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3',
  kesehatan: 'M20.8 8.6a5 5 0 0 0-8.8-3.2A5 5 0 0 0 3.2 8.6C3.2 14 12 20 12 20s8.8-6 8.8-11.4zM12 9v6M9 12h6',
  hiburan: 'M4 5h16v14H4zM10 9l5 3-5 3z',
  bank: 'M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18',
  lainnya: 'M5 12h.01M12 12h.01M19 12h.01',
  gaji: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 13.5h.01',
  bonus: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C10 7 8 6 8 4.5S10.5 3 12 7c1.5-4 4-4 4-2.5S14 7 12 7',
  usaha: 'M4 9l1-5h14l1 5M5 9v11h14V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5',
  transfer: 'M4 8h14l-4-4M20 16H6l4 4',
  // cadangan
  rumah: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  pendidikan: 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6',
  hewan: 'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM19 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 12c-3 0-5 4-5 6s1.5 2.5 5 2.5 5-.5 5-2.5-2-6-5-6z',
  hadiah: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7l-3-3M12 7l3-3',
  pulsa: 'M7 2h10v20H7zM11 18h2',
  olahraga: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
  pesawat: 'M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  kecantikan: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  anak: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM9 12h.01M15 12h.01M10 16c1 .8 3 .8 4 0M12 5c0-1 1-2 2-2',
  investasi: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  donasi: 'M20.8 8.6a5 5 0 0 0-8.8-3.2A5 5 0 0 0 3.2 8.6C3.2 14 12 20 12 20s8.8-6 8.8-11.4z',
  servis: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
  bensin: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3',
  parkir: 'M4 3h16v18H4zM9 17V7h4a3 3 0 0 1 0 6H9',
  internet: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  pakaian: 'M20.4 6.6L16 4a4 4 0 0 1-8 0L3.6 6.6l1.4 4.4 2-1V20h10V10l2 1z',
  kopi: 'M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6zM17 9h1.5a2.5 2.5 0 0 1 0 5H17M7 2v3M11 2v3M15 2v3',
  buku: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  game: 'M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6L14 15h-4l-1 .6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M15.5 12h.01M18 13.5h.01',
  listrik: 'M13 2L4 14h7l-1 8 9-12h-7z',
  air: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  musik: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  obat: 'M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7zM7 10l7 7',
  dompet: 'M20 8V6a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V7M16.5 14.5h.01',
  kado: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5',
};

// Ikon antarmuka
export const UI_ICONS = {
  home: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  plus: 'M12 5v14M5 12h14',
  wallet: CATEGORY_ICONS.dompet,
  chart: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-9',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  x: 'M18 6L6 18M6 6l12 12',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  swap: 'M7 4v16M7 4L3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  back: 'M19 12H5M12 19l-7-7 7-7',
  sync: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  sheet: 'M4 3h16v18H4zM4 9h16M4 15h16M10 3v18',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  check: 'M5 12l5 5L20 7',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  adjust: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  cloudOff: 'M3 3l18 18M8.5 6.2A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.7 7M17 19H7a5 5 0 0 1-1.6-9.7',
  arrowDown: 'M12 5v14M5 12l7 7 7-7',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
};

export const ICON_KEYS = Object.keys(CATEGORY_ICONS).filter(k => k !== 'transfer');

export function svg(name, size = 20, cls = '') {
  const d = UI_ICONS[name] || CATEGORY_ICONS[name] || CATEGORY_ICONS.lainnya;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

// Koin okane (putih, lubang transparan) untuk header Beranda
export function coin(size = 26) {
  return `<svg width="${size}" height="${size}" viewBox="21 21 58 58" aria-hidden="true"><path d="M23 50a27 27 0 1 0 54 0a27 27 0 1 0-54 0zM41 50a9 9 0 1 0 18 0a9 9 0 1 0-18 0z" fill="currentColor" fill-rule="evenodd"/></svg>`;
}

export const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

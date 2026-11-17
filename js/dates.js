// Helper tanggal murni. Semua tanggal berupa string ISO lokal 'YYYY-MM-DD', bulan 'YYYY-MM'.

export const pad = n => String(n).padStart(2, '0');
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const todayISO = () => isoDate(new Date());
export const ym = iso => String(iso).slice(0, 7);
export const dayOf = iso => Number(String(iso).slice(8, 10));

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Tanggal terakhir sebuah bulan 'YYYY-MM' → 'YYYY-MM-DD'
export const monthEnd = month => `${month}-${pad(daysInMonth(month))}`;

export function addMonths(month, k) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function addDays(iso, k) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + k);
  return isoDate(d);
}

// Tanggal di bulan tertentu, dipotong ke hari terakhir kalau melebihi (mis. 31 → 30)
export function dateIn(month, day) {
  return `${month}-${pad(Math.max(1, Math.min(day, daysInMonth(month))))}`;
}

// Selisih hari b − a
export function diffDays(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Timestamp ISO dengan offset lokal, mis. 2026-11-15T21:04:05+07:00
export function nowISO(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${isoDate(d)}T${hhmm(d)}:${pad(d.getSeconds())}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

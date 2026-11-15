// Format rupiah, tanggal Indonesia, dan mask privasi.
import { parseISO, diffDays, dayOf } from './dates.js';

let privacy = false;
export const setPrivacy = v => { privacy = !!v; };
export const isPrivate = () => privacy;
export const MASK = 'Rp••••••';

export const group = n => Math.round(Math.abs(Number(n) || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// rupiah(12500) → "Rp12.500"; sign:true → "+Rp12.500"; negatif → "−Rp12.500"
export function rupiah(n, { sign = false, raw = false } = {}) {
  if (privacy && !raw) return MASK;
  n = Math.round(Number(n) || 0);
  const s = n < 0 ? '−' : (sign && n > 0 ? '+' : '');
  return `${s}Rp${group(n)}`;
}

// Format ringkas: 8.500.000 → "8,5 jt", 25.000 → "25rb"
export function compact(n, { raw = false } = {}) {
  if (privacy && !raw) return '••';
  const a = Math.abs(Math.round(Number(n) || 0));
  const s = n < 0 ? '−' : '';
  const one = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
  if (a >= 1e9) return `${s}${one(a / 1e9)} M`;
  if (a >= 1e6) return `${s}${one(a / 1e6)} jt`;
  if (a >= 1e3) return `${s}${one(a / 1e3)}rb`;
  return `${s}${a}`;
}

export const parseAmount = s => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0;
export const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const monthShort = m => MONTHS[Number(m.slice(5, 7)) - 1];
export const monthLong = m => `${MONTHS_LONG[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const fmtDay = iso => { const d = parseISO(iso); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtDate = iso => { const d = parseISO(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtDayMonth = iso => `${dayOf(iso)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export function dayHeader(iso, today) {
  const diff = diffDays(iso, today);
  if (diff === 0) return `Hari ini · ${fmtDay(iso)}`;
  if (diff === 1) return `Kemarin · ${fmtDay(iso)}`;
  return fmtDay(iso);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name) {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

export const pct = v => `${Math.round((Number(v) || 0) * 100)}%`;

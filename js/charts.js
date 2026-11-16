// Grafik SVG kecil tanpa library. Semua fungsi mengembalikan string SVG; warna lewat currentColor / CSS variable.

const f = n => (Math.round(n * 10) / 10).toString();

// Garis halus (Catmull-Rom → Bézier) melewati titik-titik
function smooth(pts) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('');
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const t = 0.18;
    d += `C${f(p1[0] + (p2[0] - p0[0]) * t)} ${f(p1[1] + (p2[1] - p0[1]) * t)} ${f(p2[0] - (p3[0] - p1[0]) * t)} ${f(p2[1] - (p3[1] - p1[1]) * t)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

// Sparkline area (untuk hero). values: angka; mengisi lebar penuh.
export function spark(values, { w = 390, h = 62, id = 'sp' } = {}) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 8), 6 + (1 - (v - min) / span) * (h - 14)]);
  const line = smooth(pts);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <path d="${line}L${f(last[0])} ${h}L0 ${h}Z" fill="url(#${id})"/>
    <path class="draw" d="${line}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
    <circle cx="${f(last[0])}" cy="${f(last[1])}" r="7" fill="currentColor" opacity=".25"/><circle cx="${f(last[0])}" cy="${f(last[1])}" r="3.4" fill="currentColor"/></svg>`;
}

// Donut: segments [{ value, color }] (color = nilai CSS, mis. var(--c-oranye-i)); center = HTML di tengah
export function donut(segments, { size = 132, stroke = 16, center = '' } = {}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
  const gap = segments.length > 1 ? 3 : 0;
  let off = 0;
  const arcs = total > 0 ? segments.filter(s => s.value > 0).map(s => {
    const len = (s.value / total) * c;
    const seg = `<circle cx="${mid}" cy="${mid}" r="${f(r)}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${f(Math.max(1, len - gap))} ${f(c)}" stroke-dashoffset="${f(-off)}"/>`;
    off += len;
    return seg;
  }).join('') : '';
  return `<div class="donut" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${mid}" cy="${mid}" r="${f(r)}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
    <g transform="rotate(-90 ${mid} ${mid})">${arcs}</g></svg><div class="donut-c">${center}</div></div>`;
}

/**
 * Laju pengeluaran: kumulatif bulan ini (garis tegas) vs bulan lalu (putus-putus) + garis budget.
 * cur dipotong sampai hari `upto`.
 */
export function pace(cur, prev, { budget = 0, upto = cur.length, w = 320, h = 118, label = '' } = {}) {
  const n = Math.max(cur.length, prev.length, 2);
  const shown = cur.slice(0, Math.max(1, upto));
  // skala mengikuti data; garis budget hanya digambar kalau masih dalam jangkauan
  const top = Math.max(1, ...shown, ...prev);
  const max = (budget > 0 && budget <= top * 1.6 ? Math.max(top, budget) : top) * 1.08;
  const x = i => (i / (n - 1)) * w;
  const y = v => h - 6 - (v / max) * (h - 16);
  const path = arr => arr.map((v, i) => `${i ? 'L' : 'M'}${f(x(i))} ${f(y(v))}`).join('');
  const lastI = shown.length - 1;
  const hasPrev = prev.some(v => v > 0);
  return `<svg class="pace" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">
    <defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    ${budget > 0 && budget <= max ? `<line x1="0" x2="${w}" y1="${f(y(budget))}" y2="${f(y(budget))}" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="2 5" stroke-linecap="round"/>` : ''}
    ${hasPrev ? `<path d="${path(prev)}" fill="none" stroke="currentColor" stroke-opacity=".42" stroke-width="1.6" stroke-dasharray="4 4" stroke-linecap="round"/>` : ''}
    <path d="${path(shown)}L${f(x(lastI))} ${h}L0 ${h}Z" fill="url(#pc)"/>
    <path class="draw" d="${path(shown)}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
    <circle cx="${f(x(lastI))}" cy="${f(y(shown[lastI]))}" r="4" fill="currentColor"/>
    <circle cx="${f(x(lastI))}" cy="${f(y(shown[lastI]))}" r="8" fill="currentColor" opacity=".25"/></svg>`;
}

// Cincin progres kecil (0..1+). over = melewati batas
export function ringMini(p, { size = 64, stroke = 7 } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
  const v = Math.max(0, Math.min(1, p));
  return `<svg class="ringm ${p > 1 ? 'over' : p >= 0.9 ? 'warn' : ''}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${mid}" cy="${mid}" r="${f(r)}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
    <circle class="arc" cx="${mid}" cy="${mid}" r="${f(r)}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${f(c * v)} ${f(c)}" transform="rotate(-90 ${mid} ${mid})"/></svg>`;
}

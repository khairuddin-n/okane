// Komponen UI bersama: tile, baris transaksi, bottom sheet, toast, input nominal.
import { svg } from './icons.js';
import { esc, rupiah, group, parseAmount, isPrivate, MASK } from './format.js';
import { state, findCategory, findAccount } from './store.js';
import { ADMIN_CATEGORY } from './model.js';

// Angka besar: "Rp" kecil di depan, angka tebal
export function money(n, { sign = false } = {}) {
  if (isPrivate()) return MASK;
  n = Math.round(Number(n) || 0);
  const s = n < 0 ? '−' : (sign && n > 0 ? '+' : '');
  return `${s}<span class="cur">Rp</span>${group(n)}`;
}

// Angka besar menghitung naik saat layar dibuka (elemen ber-atribut data-count)
export function countUp(root) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = Number(el.dataset.count) || 0;
    if (Math.abs(to) < 1000) return;
    const from = to * 0.82, t0 = performance.now(), dur = 520;
    const step = now => {
      if (!el.isConnected) return;
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.innerHTML = money(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export const JENIS = { bank: 'Bank', ewallet: 'E-wallet', tunai: 'Cash' };

export function catStyle(tipe, nama) {
  if (tipe === 'transfer') return { ikon: 'transfer', warna: 'indigo' };
  if (tipe === 'penyesuaian') return { ikon: 'adjust', warna: 'abu' };
  if (tipe === 'pelunasan') return { ikon: 'people', warna: 'violet' };
  const k = findCategory(tipe, nama);
  return k ? { ikon: k.ikon || 'lainnya', warna: k.warna || 'abu' } : { ikon: nama === ADMIN_CATEGORY ? 'bank' : 'lainnya', warna: nama === ADMIN_CATEGORY ? 'teal' : 'abu' };
}

export function tile(ikon, warna, size = '') {
  const px = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
  return `<span class="tile ${size} c-${esc(warna)}">${svg(ikon, px)}</span>`;
}
export const catTile = (tipe, nama, size) => { const s = catStyle(tipe, nama); return tile(s.ikon, s.warna, size); };

export const accName = id => findAccount(id)?.nama || '—';

export function txTitle(t) {
  if (t.tipe === 'transfer') return t.catatan || `${accName(t.akun)} → ${accName(t.akun_tujuan)}`;
  if (t.tipe === 'penyesuaian') return t.catatan || 'Balance adjustment';
  if (t.tipe === 'pelunasan') return t.catatan || 'Repayment received';
  return t.catatan || t.kategori || 'Transaction';
}

export function txAmount(t) {
  if (t.tipe === 'masuk' || t.tipe === 'pelunasan') return `<span class="t-income">${rupiah(t.nominal, { sign: true })}</span>`;
  if (t.tipe === 'keluar') return `<span class="t-expense">${rupiah(-t.nominal)}</span>`;
  if (t.tipe === 'transfer') return `<span class="t-transfer">${rupiah(t.nominal)}</span>`;
  return `<span class="muted">${rupiah(t.nominal, { sign: true })}</span>`;
}

export function txRow(t, { showDate = false } = {}) {
  // Baris kedua hanya kalau menambah informasi (rekening & kategori tidak ditulis; ada di ikon, detail, dan filter).
  const note = String(t.catatan || '').trim();
  const parts = [];
  // kategori tidak ditulis ulang: ikonnya sudah menunjukkan kategori
  if (t.tipe === 'transfer' && note) parts.push(`${accName(t.akun)} → ${accName(t.akun_tujuan)}`);
  if (t.tipe === 'keluar' && state.piutang.some(p => p.transaksi_id === t.id && !p.dihapus)) parts.push('Split');
  if (showDate) parts.push(`${t.tanggal.slice(8, 10)}/${t.tanggal.slice(5, 7)}`);
  const fee = t.tipe === 'transfer' && Number(t.biaya_admin) > 0 ? `<small>fee ${rupiah(t.biaya_admin)}</small>` : '';
  return `<button class="row" data-tx="${esc(t.id)}">
    ${catTile(t.tipe, t.kategori)}
    <span class="mid"><span class="ttl">${esc(txTitle(t))}</span>${parts.length ? `<span class="meta">${esc(parts.join(' · '))}</span>` : ''}</span>
    <span class="amt num">${txAmount(t)}${fee}</span>
  </button>`;
}

export function accChip(r, on, balance) {
  return `<button type="button" class="chip acc ${on ? 'on' : ''}" data-acc="${esc(r.id)}" aria-pressed="${on}">${esc(r.nama)}<small class="num">${rupiah(balance)}</small></button>`;
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg, { action, onAction, ms = 2600 } = {}) {
  const host = document.getElementById('toast');
  host.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}</div>`;
  if (action) host.querySelector('button').onclick = () => { host.innerHTML = ''; onAction?.(); };
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { host.innerHTML = ''; }, ms);
}

// Snackbar dengan tombol Batalkan (5 detik)
export function undoToast(msg, undo) {
  toast(msg, { action: 'Undo', ms: 5000, onAction: async () => { try { await undo(); toast('Undone'); } catch (e) { console.warn(e); toast('Couldn’t undo'); } } });
}

// ---------- Bottom sheet ----------
export function openSheet({ title, body, onMount, onClose }) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grab"></div>
    <div class="sheet-h"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${svg('x')}</button></div>
    <div class="sheet-b">${body}</div></div>`;
  root.appendChild(wrap);
  const prevFocus = document.activeElement;
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
    prevFocus?.focus?.();
    onClose?.();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  const sheet = wrap.querySelector('.sheet');
  onMount?.(sheet, close);
  (sheet.querySelector('[autofocus]') || sheet.querySelector('.sheet-h button')).focus();
  return close;
}

export function confirmSheet({ title, text, ok = 'Yes', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    openSheet({
      title,
      body: `<p class="muted" style="margin-bottom:16px">${esc(text)}</p>
        <div class="row2"><button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`,
      onMount: (el, close) => { el.querySelector('[data-ok]').onclick = () => { done = true; close(); resolve(true); }; },
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

// ---------- Privasi: dijelaskan di dalam aplikasi (pindah halaman memutus sesi Google) ----------
export function openPrivacy() {
  const local = state.mode === 'local';
  openSheet({
    title: 'Your data & privacy',
    body: `<ul class="priv-list">
      <li>${local ? 'Your data is stored only on this device.' : 'Your data is stored in a spreadsheet called “okane – Data” in your own Google Drive.'}</li>
      <li>okane has no server. Nothing is sent to the developer or anyone else. No ads, no analytics.</li>
      ${local ? '' : '<li>okane can only open files it created, not the rest of your Drive.</li>'}
      <li>${local ? 'Signing out deletes the data on this device.' : 'You can delete the spreadsheet or revoke access any time in your <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener">Google Account</a>.'}</li>
    </ul>`,
  });
}

// ---------- Input nominal dengan format ribuan saat mengetik ----------
export function bindMoney(input, onChange) {
  const fmt = () => {
    const v = parseAmount(input.value);
    const pos = input.value.length - input.selectionStart;
    input.value = v ? group(v) : '';
    const p = Math.max(0, input.value.length - pos);
    try { input.setSelectionRange(p, p); } catch {}
    onChange?.(v);
  };
  input.addEventListener('input', fmt);
  return { get: () => parseAmount(input.value), set: v => { input.value = v ? group(v) : ''; onChange?.(parseAmount(input.value)); } };
}

export const moneyInput = (name, value, attrs = '') =>
  `<div class="money"><input class="input num" name="${name}" inputmode="numeric" autocomplete="off" value="${value ? group(value) : ''}" placeholder="0" ${attrs}></div>`;

// Teks status sinkron
export function syncLabel() {
  if (state.mode === 'local') return { text: 'Local mode', cls: 'muted' };
  if (!navigator.onLine) return { text: 'Offline', cls: 'muted' };
  if (state.needsAuth) return { text: 'Sign in again', cls: 'warn' };
  if (state.syncing) return { text: 'Syncing…', cls: 'muted' };
  if (state.pending > 0) return { text: `${state.pending} pending`, cls: 'warn' };
  return { text: 'Synced', cls: '' };
}

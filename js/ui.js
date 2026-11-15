// Komponen UI bersama: tile, baris transaksi, bottom sheet, toast, input nominal.
import { svg } from './icons.js';
import { esc, rupiah, group, parseAmount } from './format.js';
import { state, findCategory, findAccount } from './store.js';

export const JENIS = { bank: 'Bank', ewallet: 'E-wallet', tunai: 'Tunai' };

export function catStyle(tipe, nama) {
  if (tipe === 'transfer') return { ikon: 'transfer', warna: 'indigo' };
  if (tipe === 'penyesuaian') return { ikon: 'adjust', warna: 'abu' };
  const k = findCategory(tipe, nama);
  return k ? { ikon: k.ikon || 'lainnya', warna: k.warna || 'abu' } : { ikon: nama === 'Biaya bank' ? 'bank' : 'lainnya', warna: nama === 'Biaya bank' ? 'teal' : 'abu' };
}

export function tile(ikon, warna, size = '') {
  const px = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
  return `<span class="tile ${size} c-${esc(warna)}">${svg(ikon, px)}</span>`;
}
export const catTile = (tipe, nama, size) => { const s = catStyle(tipe, nama); return tile(s.ikon, s.warna, size); };

export const accName = id => findAccount(id)?.nama || '—';

export function txTitle(t) {
  if (t.tipe === 'transfer') return t.catatan || `${accName(t.akun)} → ${accName(t.akun_tujuan)}`;
  if (t.tipe === 'penyesuaian') return t.catatan || 'Penyesuaian saldo';
  return t.catatan || t.kategori || 'Transaksi';
}

export function txAmount(t) {
  if (t.tipe === 'masuk') return `<span class="t-income">${rupiah(t.nominal, { sign: true })}</span>`;
  if (t.tipe === 'keluar') return `<span class="t-expense">${rupiah(-t.nominal)}</span>`;
  if (t.tipe === 'transfer') return `<span class="t-transfer">${rupiah(t.nominal)}</span>`;
  return `<span class="muted">${rupiah(t.nominal, { sign: true })}</span>`;
}

export function txRow(t, { showDate = false } = {}) {
  let meta;
  if (t.tipe === 'transfer') meta = `${esc(accName(t.akun))} → ${esc(accName(t.akun_tujuan))}`;
  else if (t.tipe === 'penyesuaian') meta = `Penyesuaian · ${esc(accName(t.akun))}`;
  else meta = `${esc(t.kategori)} · ${esc(accName(t.akun))}`;
  meta += ` · ${showDate ? esc(t.tanggal.slice(8, 10) + '/' + t.tanggal.slice(5, 7)) + ' ' : ''}${esc(t.jam || '')}`;
  const auto = t.sumber === 'otomatis' ? '<span class="auto-tag">otomatis</span>' : '';
  const admin = t.tipe === 'transfer' && Number(t.biaya_admin) > 0 ? `<small>admin ${rupiah(t.biaya_admin)}</small>` : '';
  return `<button class="row" data-tx="${esc(t.id)}">
    ${catTile(t.tipe, t.kategori)}
    <span class="mid"><span class="ttl">${esc(txTitle(t))}${auto}</span><span class="meta">${meta}</span></span>
    <span class="amt num">${txAmount(t)}${admin}</span>
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

// ---------- Bottom sheet ----------
export function openSheet({ title, body, onMount, onClose }) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grab"></div>
    <div class="sheet-h"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Tutup">${svg('x')}</button></div>
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

export function confirmSheet({ title, text, ok = 'Ya', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    openSheet({
      title,
      body: `<p class="muted" style="margin-bottom:16px">${esc(text)}</p>
        <div class="row2"><button class="btn ghost" data-close>Batal</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`,
      onMount: (el, close) => { el.querySelector('[data-ok]').onclick = () => { done = true; close(); resolve(true); }; },
      onClose: () => { if (!done) resolve(false); },
    });
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
  if (state.mode === 'local') return { text: 'Mode lokal', cls: 'muted' };
  if (!navigator.onLine) return { text: 'Offline', cls: 'muted' };
  if (state.needsAuth) return { text: 'Perlu masuk lagi', cls: 'warn' };
  if (state.syncing) return { text: 'Menyinkron…', cls: 'muted' };
  if (state.pending > 0) return { text: `${state.pending} menunggu`, cls: 'warn' };
  return { text: 'Tersinkron', cls: '' };
}

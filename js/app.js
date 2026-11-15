// Bootstrap, router hash, dan render loop.
import * as store from './store.js';
import { state } from './store.js';
import { svg } from './icons.js';
import { apply as applyTheme, onThemeChange } from './theme.js';
import { todayISO, ym } from './dates.js';
import { billsForMonth, billsDueSoon, activeAccounts } from './model.js';
import { GOOGLE_CLIENT_ID } from '../config.js';
import beranda from './screens/beranda.js';
import riwayat from './screens/riwayat.js';
import catat from './screens/catat.js';
import rekening from './screens/rekening.js';
import aturRekening from './screens/atur-rekening.js';
import laporan from './screens/laporan.js';
import pengaturan from './screens/pengaturan.js';
import onboarding, { onboardingState } from './screens/onboarding.js';
import * as auth from './auth.js';
import * as sync from './sync.js';
import * as drive from './drive.js';
import { esc } from './format.js';
import { toast, confirmSheet } from './ui.js';

const ROUTES = [
  [/^beranda$/, beranda, 'beranda'],
  [/^riwayat$/, riwayat, 'riwayat'],
  [/^catat$/, catat, null],
  [/^rekening$/, rekening, 'rekening'],
  [/^rekening\/atur\/([^/]+)$/, aturRekening, null, ['id']],
  [/^laporan$/, laporan, 'laporan'],
  [/^pengaturan(?:\/(kategori))?$/, pengaturan, null, ['sub']],
  [/^onboarding$/, onboarding, null],
];

const view = document.getElementById('view');
const nav = document.getElementById('nav');
let current = null;
const stack = [];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  return { path: path || 'beranda', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function go(hash, { replace = false } = {}) {
  if (replace) location.replace(hash); else location.hash = hash;
}

function back() {
  if (stack.length > 1) history.back();
  else go('#/beranda', { replace: true });
}

const ctx = () => ({
  state, params: current.params, query: current.query, go, back,
  rerender: () => render(),
  syncNow: opts => app.syncNow?.(opts),
  logout: () => app.logout?.(),
  userAction: () => app.userAction?.(),
  loginGoogle: () => app.loginGoogle?.(),
  canGoogle: () => !!GOOGLE_CLIENT_ID,
  canLocal: () => !GOOGLE_CLIENT_ID || ['localhost', '127.0.0.1'].includes(location.hostname) || /[?&]dev=1/.test(location.search),
});

export const app = {};
const banner = document.getElementById('banner');

function renderBanner() {
  const show = state.mode === 'google' && state.needsAuth && navigator.onLine;
  banner.innerHTML = show ? `<div class="banner" role="status"><span>${state.pending ? `${state.pending} perubahan menunggu. ` : ''}Sambungkan lagi ke Google untuk sinkron.</span><button type="button">Sambungkan</button></div>` : '';
  if (show) banner.querySelector('button').onclick = () => reconnect();
}

// Minta token (harus dari klik), lalu sinkron
function reconnect({ quiet = false } = {}) {
  return auth.request({ prompt: '' })
    .then(() => { state.needsAuth = false; return sync.syncAll(); })
    .catch(e => {
      state.needsAuth = !auth.getToken();
      store.emit();
      if (!quiet && e?.code !== 'popup_closed') toast(e?.code === 'popup_failed_to_open' ? 'Popup diblokir browser. Izinkan popup untuk situs ini.' : 'Belum tersambung ke Google');
    });
}

// Dipanggil di awal aksi pengguna (Simpan, dll.): perpanjang token diam-diam kalau perlu
app.userAction = () => {
  if (state.mode !== 'google' || !navigator.onLine || !auth.ready()) return;
  if (auth.getToken()) return;
  reconnect({ quiet: true });
};

app.syncNow = () => {
  if (state.mode !== 'google') return;
  if (!navigator.onLine) { toast('Sedang offline. Perubahan menunggu di HP.'); return; }
  if (!auth.getToken()) { reconnect(); return; }
  sync.syncAll().then(() => toast('Tersinkron')).catch(() => toast('Gagal sinkron, coba lagi nanti'));
};

app.loginGoogle = () => {
  const p = auth.request({ prompt: 'consent' }); // langsung di dalam klik
  onboardingState.setBusy('Menghubungkan ke Google…'); render();
  (async () => {
    await p;
    onboardingState.setBusy('Menyiapkan spreadsheet…'); render();
    const user = await drive.aboutUser();
    const { id } = await drive.findOrCreate();
    if (state.spreadsheetId && state.spreadsheetId !== id) await store.resetAll();
    await store.setApp({ mode: 'google', user, spreadsheetId: id, needsAuth: false });
    try { localStorage.setItem('okane_hint', user.email); } catch {}
    onboardingState.setBusy('Mengambil data…'); render();
    await sync.pull();
    await store.runAutomations();
    await sync.flush();
    onboardingState.toAccounts();
    route();
  })().catch(e => {
    console.warn(e);
    const msg = e?.code === 'popup_closed' ? 'Login dibatalkan.'
      : e?.code === 'popup_failed_to_open' ? 'Popup login diblokir. Izinkan popup untuk situs ini lalu coba lagi.'
      : e?.message || 'Gagal masuk. Coba lagi.';
    onboardingState.setError(msg); render();
  });
};

app.logout = async () => {
  const google = state.mode === 'google';
  const text = state.pending
    ? `Ada ${state.pending} perubahan yang belum tersinkron dan akan hilang. Tetap keluar?`
    : google ? 'Data di HP ini dihapus. Data di Google Sheets tetap aman dan bisa dibuka lagi saat masuk.' : 'Semua data mode lokal di HP ini akan dihapus.';
  if (!await confirmSheet({ title: 'Keluar dari okane?', text, ok: 'Keluar', danger: true })) return;
  if (google) await auth.revoke();
  await store.resetAll();
  try { localStorage.removeItem('okane_hint'); localStorage.removeItem('privacy'); } catch {}
  go('#/onboarding', { replace: true });
};

function render() {
  if (!current) return;
  // simpan fokus & seleksi input supaya re-render tidak mengganggu ketikan
  const a = document.activeElement;
  const keep = a && view.contains(a) && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  view.innerHTML = current.screen.render(ctx());
  current.screen.bind?.(view, ctx());
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch {} }
  }
  renderNav();
  renderBanner();
}

function route() {
  const { path, query } = parseHash();
  const full = location.hash || '#/beranda';
  if (stack.length > 1 && stack[stack.length - 2] === full) stack.pop(); else if (stack[stack.length - 1] !== full) stack.push(full);

  const needsOnb = !state.mode || !activeAccounts(state.rekening).length;
  if (needsOnb && path !== 'onboarding') { go('#/onboarding', { replace: true }); return; }
  if (!needsOnb && path === 'onboarding') { go('#/beranda', { replace: true }); return; }

  let found = null;
  for (const [re, screen, tab, names = []] of ROUTES) {
    const m = re.exec(path);
    if (m) { found = { screen, tab, params: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) }; break; }
  }
  if (!found) { go('#/beranda', { replace: true }); return; }
  current = { ...found, query, path };
  document.body.classList.toggle('no-nav', !found.tab);
  current.screen.enter?.(query, found.params);
  render();
  window.scrollTo(0, 0);
}

const NAV = [['beranda', 'home', 'Beranda'], ['riwayat', 'list', 'Riwayat'], null, ['rekening', 'wallet', 'Rekening'], ['laporan', 'chart', 'Laporan']];
function renderNav() {
  const tab = current?.tab;
  const today = todayISO();
  const due = billsDueSoon(billsForMonth(state.tagihan, state.transaksi, ym(today)), today, 3).length > 0;
  nav.innerHTML = `<div class="nav-in">${NAV.map(n => n
    ? `<a href="#/${n[0]}" class="${tab === n[0] ? 'on' : ''}" ${tab === n[0] ? 'aria-current="page"' : ''}>${svg(n[1], 22)}<span>${n[2]}</span>${n[0] === 'rekening' && due ? '<i class="dot" aria-label="Ada tagihan jatuh tempo"></i>' : ''}</a>`
    : `<a href="#/catat" class="fab-wrap" aria-label="Catat transaksi"><span class="fab">${svg('plus', 28)}</span></a>`).join('')}</div>`;
}

store.subscribe(() => { if (current?.screen.live) render(); else { renderNav(); renderBanner(); } });
onThemeChange(() => { if (current?.screen.live) render(); });
window.addEventListener('hashchange', route);

async function boot() {
  applyTheme();
  try { await store.init(); } catch (e) { console.error(e); view.innerHTML = '<p class="empty">Penyimpanan HP tidak tersedia. Coba buka di browser biasa (bukan mode samaran).</p>'; return; }
  if (state.mode === 'google') { state.needsAuth = true; }
  route();
  // jalankan admin otomatis dari cache (idempoten), lalu siapkan login Google
  if (state.mode && state.lastSync || state.mode === 'local') store.runAutomations().catch(console.warn);
  auth.init().catch(e => console.warn('[auth]', e.message));
}

// Service worker + notifikasi versi baru
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let requested = false;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    const notify = w => toast('Versi baru tersedia', { action: 'Muat ulang', ms: 0, onAction: () => { requested = true; w.postMessage('skipWaiting'); } });
    if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(e => console.warn('[sw]', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (requested) location.reload(); });
}
registerSW();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.mode === 'google' && auth.getToken()) sync.syncAll().catch(() => {});
});
window.addEventListener('online', () => { store.emit(); if (auth.getToken()) sync.syncAll().catch(() => {}); });
window.addEventListener('offline', () => store.emit());

boot();

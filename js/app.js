// Bootstrap, router hash, dan render loop.
import * as store from './store.js';
import { state } from './store.js';
import { svg } from './icons.js';
import { apply as applyTheme, onThemeChange } from './theme.js';
import { todayISO, ym } from './dates.js';
import { billsForMonth, billsDueSoon, activeAccounts } from './model.js';
import { GOOGLE_CLIENT_ID } from '../config.js';
import { SCHEMA_VERSION } from './schema.js';
import beranda from './screens/beranda.js';
import riwayat from './screens/riwayat.js';
import catat from './screens/catat.js';
import rekening from './screens/rekening.js';
import aturRekening from './screens/atur-rekening.js';
import laporan from './screens/laporan.js';
import pengaturan from './screens/pengaturan.js';
import onboarding, { onboardingState } from './screens/onboarding.js';
import berulang from './screens/berulang.js';
import rekap from './screens/rekap.js';
import * as lock from './lock.js';
import { maybeBalanceCheck } from './balance-check.js';
import * as auth from './auth.js';
import * as sync from './sync.js';
import * as drive from './drive.js';
import { esc } from './format.js';
import { toast, confirmSheet, countUp } from './ui.js';

const ROUTES = [
  [/^beranda$/, beranda, 'beranda'],
  [/^riwayat$/, riwayat, 'riwayat'],
  [/^catat$/, catat, null],
  [/^rekening$/, rekening, 'rekening'],
  [/^rekening\/atur\/([^/]+)$/, aturRekening, null, ['id']],
  [/^laporan$/, laporan, 'laporan'],
  [/^pengaturan\/berulang$/, berulang, null],
  [/^pengaturan(?:\/(kategori))?$/, pengaturan, null, ['sub']],
  [/^rekap\/(\d{4}-\d{2})$/, rekap, null, ['month']],
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
  banner.innerHTML = show ? `<div class="banner" role="status"><span>${state.pending ? `${state.pending} changes waiting. ` : ''}Reconnect to Google to sync.</span><button type="button">Reconnect</button></div>` : '';
  if (show) banner.querySelector('button').onclick = () => reconnect();
}

// Minta token (harus dari klik), lalu sinkron
function reconnect({ quiet = false } = {}) {
  return auth.request({ prompt: '' })
    .then(() => { state.needsAuth = false; return sync.syncAll(); })
    .catch(e => {
      state.needsAuth = !auth.getToken();
      store.emit();
      if (!quiet && e?.code !== 'popup_closed') toast(e?.code === 'popup_failed_to_open' ? 'Popup blocked. Allow popups for this site.' : 'Not connected to Google yet');
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
  if (!navigator.onLine) { toast('You\'re offline. Changes are saved on this device.'); return; }
  if (!auth.getToken()) { reconnect(); return; }
  sync.syncAll().then(() => toast('Synced')).catch(() => toast('Sync failed, try again later'));
};

app.loginGoogle = () => {
  const p = auth.request({ prompt: 'consent' }); // langsung di dalam klik
  onboardingState.setBusy('Connecting to Google…'); render();
  (async () => {
    await p;
    onboardingState.setBusy('Setting up your spreadsheet…'); render();
    const user = await drive.aboutUser();
    const { id } = await drive.findOrCreate();
    if (state.spreadsheetId && state.spreadsheetId !== id) await store.resetAll();
    await store.setApp({ mode: 'google', user, spreadsheetId: id, needsAuth: false, schemaOk: SCHEMA_VERSION });
    try { localStorage.setItem('okane_hint', user.email); } catch {}
    onboardingState.setBusy('Loading your data…'); render();
    await sync.pull();
    await store.migrateCategories();
    await store.runAutomations();
    await sync.flush();
    onboardingState.toAccounts();
    route();
  })().catch(e => {
    console.warn(e);
    const msg = e?.code === 'popup_closed' ? 'Sign-in cancelled.'
      : e?.code === 'popup_failed_to_open' ? 'Sign-in popup blocked. Allow popups for this site and try again.'
      : e?.message || 'Sign-in failed. Try again.';
    onboardingState.setError(msg); render();
  });
};

app.logout = async () => {
  const google = state.mode === 'google';
  const text = state.pending
    ? `${state.pending} unsynced changes will be lost. Sign out anyway?`
    : google ? 'Data on this device will be cleared. Your Google Sheet stays safe and loads again when you sign in.' : 'All local-mode data on this device will be deleted.';
  if (!await confirmSheet({ title: 'Sign out of okane?', text, ok: 'Sign out', danger: true })) return false;
  if (google) await auth.revoke();
  await store.resetAll();
  try { localStorage.removeItem('okane_hint'); localStorage.removeItem('privacy'); } catch {}
  go('#/onboarding', { replace: true });
  return true;
};

// Lupa PIN: hapus data lokal (termasuk PIN) lalu masuk ulang. Data di Google Sheets tetap aman.
async function forgotPin() {
  document.body.classList.add('over-lock');
  const ok = await app.logout();
  document.body.classList.remove('over-lock');
  if (ok) lock.dismiss();
}

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
  const paint = () => { render(); window.scrollTo(0, 0); countUp(view); };
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !still && view.childElementCount) document.startViewTransition(paint); else paint();
  if (path === 'beranda') setTimeout(maybeBalanceCheck, 700);
}

const NAV = [['beranda', 'home', 'Home'], ['riwayat', 'list', 'History'], null, ['rekening', 'wallet', 'Accounts'], ['laporan', 'chart', 'Reports']];
function renderNav() {
  const tab = current?.tab;
  const today = todayISO();
  const due = billsDueSoon(billsForMonth(state.tagihan, state.transaksi, ym(today)), today, 3).length > 0;
  nav.innerHTML = `<div class="nav-in">${NAV.map(n => n
    ? `<a href="#/${n[0]}" class="${tab === n[0] ? 'on' : ''}" ${tab === n[0] ? 'aria-current="page"' : ''}><span class="ni">${svg(n[1], 22)}${n[0] === 'rekening' && due ? '<i class="dot" aria-label="Bills due soon"></i>' : ''}</span><span>${n[2]}</span></a>`
    : `<a href="#/catat" class="fab-wrap" aria-label="New transaction"><span class="fab">${svg('plus', 26)}</span></a>`).join('')}</div>`;
}

store.subscribe(() => { if (current?.screen.live) render(); else { renderNav(); renderBanner(); } });
onThemeChange(() => { if (current?.screen.live) render(); });
window.addEventListener('hashchange', route);
window.addEventListener('okane:rerender', () => render());

async function boot() {
  applyTheme();
  // layar kunci tampil dulu, sebelum data digambar
  try { await lock.initLock({ onForgot: forgotPin, onUnlock: () => { if (current?.path === 'beranda') setTimeout(maybeBalanceCheck, 400); } }); } catch (e) { console.warn('[lock]', e); }
  try { await store.init(); } catch (e) { console.error(e); view.innerHTML = '<p class="empty">Device storage is unavailable. Try a regular browser window (not private/incognito).</p>'; return; }
  if (state.mode === 'google') { state.needsAuth = true; }
  route();
  // jalankan admin otomatis dari cache (idempoten), lalu siapkan login Google
  if (state.mode === 'local') store.migrateCategories().then(() => store.runAutomations()).catch(console.warn);
  else if (state.mode && state.lastSync) store.runAutomations().catch(console.warn); // Google: migrasi kategori jalan setelah pull (sync.syncAll)
  auth.init().catch(e => console.warn('[auth]', e.message));
}

// Service worker + notifikasi versi baru
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let requested = false;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    const notify = w => toast('New version available', { action: 'Reload', ms: 0, onAction: () => { requested = true; w.postMessage('skipWaiting'); } });
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

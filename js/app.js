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
import onboarding from './screens/onboarding.js';

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

// Hook yang diisi milestone berikutnya (sync, auth)
export const app = {};

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

store.subscribe(() => { if (current?.screen.live) render(); else renderNav(); });
onThemeChange(() => { if (current?.screen.live) render(); });
window.addEventListener('hashchange', route);

async function boot() {
  applyTheme();
  try { await store.init(); } catch (e) { console.error(e); view.innerHTML = '<p class="empty">Penyimpanan HP tidak tersedia. Coba buka di browser biasa (bukan mode samaran).</p>'; return; }
  route();
}

boot();

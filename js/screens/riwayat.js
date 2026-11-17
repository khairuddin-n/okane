// Riwayat: cari + filter (tanggal, tipe, rekening, kategori). Filter lengkap ada di bottom sheet;
// filter yang aktif tampil sebagai chip yang bisa dihapus satu per satu.
import { svg } from '../icons.js';
import { esc, rupiah, dayHeader, monthLong, fmtDate } from '../format.js';
import { todayISO, ym, addMonths, monthEnd } from '../dates.js';
import { activeAccounts, byNewest, normalize, num, ADMIN_CATEGORY, OTHER_CATEGORY } from '../model.js';
import { txRow, accName, openSheet, tile } from '../ui.js';
import { state } from '../store.js';

const PERIODS = [['all', 'All time'], ['this', 'This month'], ['last', 'Last month'], ['3m', 'Last 3 months'], ['year', 'This year'], ['custom', 'Custom']];
const TYPES = [['all', 'All'], ['keluar', 'Expense'], ['masuk', 'Income'], ['transfer', 'Transfer']];
const fresh = () => ({ period: 'all', from: '', to: '', tipe: 'all', akun: '', kats: [] }); // kats: ['keluar|Food', …]

let q = '';
let F = fresh();
let months = 1;

// Rentang tanggal [from, to] dari filter periode ('' = tanpa batas)
function range(f) {
  const today = todayISO();
  const cur = ym(today);
  switch (f.period) {
    case 'this': return [`${cur}-01`, today];
    case 'last': { const m = addMonths(cur, -1); return [`${m}-01`, monthEnd(m)]; }
    case '3m': return [`${addMonths(cur, -2)}-01`, today];
    case 'year': return [`${today.slice(0, 4)}-01-01`, today];
    case 'custom': return [f.from || '', f.to || ''];
    default: return ['', ''];
  }
}

function periodLabel(f) {
  if (f.period === 'custom') {
    if (f.from && f.to && f.from.slice(0, 7) === f.to.slice(0, 7) && f.from.endsWith('-01') && f.to === monthEnd(f.from.slice(0, 7))) return monthLong(f.from.slice(0, 7));
    return [f.from ? fmtDate(f.from) : '…', f.to ? fmtDate(f.to) : '…'].join(' – ');
  }
  return PERIODS.find(p => p[0] === f.period)?.[1] || '';
}

function matches(t, f, nq) {
  if (t.dihapus) return false;
  const [from, to] = range(f);
  if (from && t.tanggal < from) return false;
  if (to && t.tanggal > to) return false;
  if (f.tipe !== 'all' && t.tipe !== f.tipe) return false;
  if (f.akun && t.akun !== f.akun && t.akun_tujuan !== f.akun) return false;
  if (f.kats.length) {
    const fee = t.tipe === 'transfer' && num(t.biaya_admin) > 0 && f.kats.includes(`keluar|${ADMIN_CATEGORY}`);
    const own = (t.tipe === 'keluar' || t.tipe === 'masuk') && f.kats.includes(`${t.tipe}|${t.kategori || OTHER_CATEGORY}`);
    if (!fee && !own) return false;
  }
  if (nq) {
    const hay = normalize([t.catatan, t.kategori, accName(t.akun), t.akun_tujuan ? accName(t.akun_tujuan) : ''].join(' '));
    if (!hay.includes(nq)) return false;
  }
  return true;
}

const filtered = f => { const nq = normalize(q); return state.transaksi.filter(t => matches(t, f, nq)).sort(byNewest); };
const activeCount = f => (f.period !== 'all' ? 1 : 0) + (f.tipe !== 'all' ? 1 : 0) + (f.akun ? 1 : 0) + f.kats.length;

// Nilai bersih per hari (untuk header): masuk − keluar; transfer hanya biaya admin (atau arus rekening yang difilter)
function dayNet(list, accFilter) {
  let s = 0;
  for (const t of list) {
    const n = num(t.nominal);
    if (t.tipe === 'masuk') s += n;
    else if (t.tipe === 'keluar') s -= n;
    else if (t.tipe === 'transfer') {
      if (accFilter) { if (t.akun === accFilter) s -= n + num(t.biaya_admin); if (t.akun_tujuan === accFilter) s += n; }
      else s -= num(t.biaya_admin);
    } else if (t.tipe === 'penyesuaian' || t.tipe === 'pelunasan') s += n;
  }
  return s;
}

function listHTML() {
  const today = todayISO();
  const all = filtered(F);
  // tanpa filter tanggal & pencarian: tampilkan per bulan dengan "Load more"
  const paged = F.period === 'all' && !q;
  const from = paged ? `${addMonths(ym(today), -(months - 1))}-01` : '';
  const shown = from ? all.filter(t => t.tanggal >= from) : all;
  const more = from && all.length > shown.length;
  const groups = new Map();
  for (const t of shown) { if (!groups.has(t.tanggal)) groups.set(t.tanggal, []); groups.get(t.tanggal).push(t); }
  let html = '';
  for (const [d, list] of groups) {
    html += `<div class="day-h"><span>${esc(dayHeader(d, today))}</span><span class="num">${rupiah(dayNet(list, F.akun), { sign: true })}</span></div>
      <div class="card day-c"><div class="rows">${list.map(t => txRow(t)).join('')}</div></div>`;
  }
  if (!shown.length) html = `<p class="empty" style="margin-top:24px">${q || activeCount(F) ? 'No transactions match.' : 'No transactions yet.'}</p>`;
  if (more) html += `<div class="pad" style="margin-top:14px"><button class="btn ghost big" data-act="more">Load more</button></div>`;
  let masuk = 0, keluar = 0;
  for (const t of shown) { if (t.tipe === 'masuk') masuk += num(t.nominal); else if (t.tipe === 'keluar') keluar += num(t.nominal); else if (t.tipe === 'transfer') keluar += num(t.biaya_admin); }
  const sum = shown.length ? `<div class="rw-sum"><div><span>In</span><b class="num t-income">${rupiah(masuk)}</b></div><div><span>Out</span><b class="num t-expense">${rupiah(keluar)}</b></div><div><span>Net</span><b class="num">${rupiah(masuk - keluar, { sign: true })}</b></div></div>` : '';
  return { html: sum + html, count: all.length };
}

// Chip filter aktif (bisa dihapus satu per satu)
function activeChips() {
  const out = [];
  if (F.period !== 'all') out.push(['period', periodLabel(F)]);
  if (F.tipe !== 'all') out.push(['tipe', TYPES.find(t => t[0] === F.tipe)[1]]);
  if (F.akun) out.push(['akun', accName(F.akun)]);
  for (const k of F.kats) out.push([`kat:${k}`, k.split('|')[1]]);
  if (!out.length) return '';
  return `<div class="chips scroll f-active">${out.map(([k, l]) => `<button class="chip on" data-rm="${esc(k)}" aria-label="Remove filter ${esc(l)}">${esc(l)}${svg('x', 14)}</button>`).join('')}
    <button class="chip" data-act="clear">Clear all</button></div>`;
}

const catsFor = tipe => state.kategori.filter(k => !k.arsip && (tipe === 'all' ? k.tipe === 'keluar' || k.tipe === 'masuk' : k.tipe === tipe))
  .sort((a, b) => (a.tipe === b.tipe ? 0 : a.tipe === 'keluar' ? -1 : 1) || num(a.urutan) - num(b.urutan));

function openFilters(onApply) {
  const d = { ...F, kats: [...F.kats] };
  const body = () => {
    const cats = d.tipe === 'transfer' ? [] : catsFor(d.tipe);
    const both = d.tipe === 'all';
    const catChip = k => { const key = `${k.tipe}|${k.nama}`; const on = d.kats.includes(key); return `<button type="button" class="chip ${on ? 'on' : ''}" data-k="${esc(key)}" aria-pressed="${on}">${tile(k.ikon, k.warna, 'xs')}${esc(k.nama)}</button>`; };
    const n = filtered(d).length;
    return `<div class="stack f-sheet">
      <div><div class="label">Date</div><div class="chips">${PERIODS.map(([k, l]) => `<button type="button" class="chip ${d.period === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
        ${d.period === 'custom' ? `<div class="row2" style="margin-top:10px"><label class="field"><span>From</span><input class="input" type="date" data-d="from" value="${esc(d.from)}"></label><label class="field"><span>To</span><input class="input" type="date" data-d="to" value="${esc(d.to)}"></label></div>` : ''}</div>
      <div><div class="label">Type</div><div class="seg">${TYPES.map(([k, l]) => `<button type="button" data-t="${k}" class="${d.tipe === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div><div class="label">Account</div><div class="chips"><button type="button" class="chip ${!d.akun ? 'on' : ''}" data-a="">All</button>${activeAccounts(state.rekening).map(r => `<button type="button" class="chip ${d.akun === r.id ? 'on' : ''}" data-a="${esc(r.id)}">${esc(r.nama)}</button>`).join('')}</div></div>
      ${cats.length ? `<div><div class="label">Categories</div>
        ${both ? `<div class="sub-l">Expense</div><div class="chips">${cats.filter(k => k.tipe === 'keluar').map(catChip).join('')}</div><div class="sub-l">Income</div><div class="chips">${cats.filter(k => k.tipe === 'masuk').map(catChip).join('')}</div>`
          : `<div class="chips">${cats.map(catChip).join('')}</div>`}</div>` : ''}
      <div class="row2 f-foot"><button type="button" class="btn ghost" data-act="reset">Reset</button><button type="button" class="btn primary" data-act="apply">Show ${n} ${n === 1 ? 'result' : 'results'}</button></div>
    </div>`;
  };
  openSheet({
    title: 'Filter',
    body: `<div id="fbody">${body()}</div>`,
    onMount(el, close) {
      const redraw = () => { el.querySelector('#fbody').innerHTML = body(); bind(); };
      const bind = () => {
        el.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => {
          d.period = b.dataset.p;
          if (d.period === 'custom' && !d.from && !d.to) { d.from = `${ym(todayISO())}-01`; d.to = todayISO(); }
          redraw();
        }; });
        el.querySelectorAll('[data-d]').forEach(i => { i.onchange = () => { d[i.dataset.d] = i.value; redraw(); }; });
        el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => {
          d.tipe = b.dataset.t;
          if (d.tipe !== 'all') d.kats = d.tipe === 'transfer' ? [] : d.kats.filter(k => k.startsWith(`${d.tipe}|`));
          redraw();
        }; });
        el.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => { d.akun = b.dataset.a; redraw(); }; });
        el.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => {
          const k = b.dataset.k;
          d.kats = d.kats.includes(k) ? d.kats.filter(x => x !== k) : [...d.kats, k];
          redraw();
        }; });
        el.querySelector('[data-act="reset"]').onclick = () => { Object.assign(d, fresh()); redraw(); };
        el.querySelector('[data-act="apply"]').onclick = () => { F = d; months = 1; close(); onApply(); };
      };
      bind();
    },
  });
}

export default {
  live: true,
  enter(query) {
    if (query.akun) { F = { ...fresh(), akun: query.akun }; q = ''; months = 1; }
    if (query.kat) { // dari Laporan: satu kategori pengeluaran di satu bulan
      const m = /^\d{4}-\d{2}$/.test(query.bulan || '') ? query.bulan : '';
      F = { ...fresh(), tipe: 'keluar', kats: [`keluar|${query.kat}`], ...(m ? { period: 'custom', from: `${m}-01`, to: monthEnd(m) } : {}) };
      q = ''; months = 1;
    }
  },
  render() {
    const { html, count } = listHTML();
    const n = activeCount(F);
    return `
      <div class="top"><div style="flex:1"><h1>History</h1><div class="sub" id="rw-count">${count} transactions</div></div></div>
      <div class="pad rw-bar">
        <label class="search"><span class="sr-only">Search transactions</span>${svg('search', 18)}
          <input id="rw-q" class="input" type="search" placeholder="Search" value="${esc(q)}" autocomplete="off"></label>
        <button class="icon-btn f-btn ${n ? 'on' : ''}" data-act="filter" aria-label="Filter${n ? ` (${n} active)` : ''}">${svg('adjust', 20)}${n ? `<i>${n}</i>` : ''}</button>
      </div>
      ${activeChips()}
      <div id="rw-list">${html}</div>`;
  },
  bind(root, { go, rerender }) {
    const bindList = () => {
      root.querySelectorAll('[data-tx]').forEach(b => { b.onclick = () => go(`#/catat?id=${encodeURIComponent(b.dataset.tx)}`); });
      const more = root.querySelector('[data-act="more"]');
      if (more) more.onclick = () => { months++; refresh(); };
    };
    const refresh = () => {
      const { html, count } = listHTML();
      root.querySelector('#rw-list').innerHTML = html;
      root.querySelector('#rw-count').textContent = `${count} transactions`;
      bindList();
    };
    root.querySelector('#rw-q').addEventListener('input', e => { q = e.target.value; refresh(); });
    root.querySelector('[data-act="filter"]').onclick = () => openFilters(rerender);
    root.querySelectorAll('[data-rm]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.rm;
        if (k === 'period') F = { ...F, period: 'all', from: '', to: '' };
        else if (k === 'tipe') F = { ...F, tipe: 'all' };
        else if (k === 'akun') F = { ...F, akun: '' };
        else F = { ...F, kats: F.kats.filter(x => `kat:${x}` !== k) };
        months = 1; rerender();
      };
    });
    const clear = root.querySelector('[data-act="clear"]');
    if (clear) clear.onclick = () => { F = fresh(); months = 1; rerender(); };
    bindList();
  },
};

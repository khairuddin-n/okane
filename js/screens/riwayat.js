// Riwayat: cari + filter (tanggal, tipe, rekening, kategori). Filter lengkap ada di bottom sheet;
// filter yang aktif tampil sebagai chip yang bisa dihapus satu per satu.
import { svg } from '../icons.js';
import { esc, rupiah, dayHeader, monthLong, fmtDate } from '../format.js';
import { todayISO, ym, addMonths, monthEnd } from '../dates.js';
import { activeAccounts, byNewest, normalize, num, ADMIN_CATEGORY, OTHER_CATEGORY } from '../model.js';
import { txRow, accName, openSheet, tile } from '../ui.js';
import { state } from '../store.js';

const PERIODS = [['all', 'All time'], ['this', 'This month'], ['last', 'Last month'], ['3m', 'Last 3 months'], ['year', 'This year'], ['custom', 'Custom range']];
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

// Bottom sheet filter: bagian ringkas (satu baris per pilihan), kategori lewat halaman checklist di dalam sheet.
function openFilters(onApply) {
  const d = { ...F, kats: [...F.kats] };
  let view = 'main'; // 'main' | 'cats'
  const resultLabel = () => { const n = filtered(d).length; return n ? `Show ${n} ${n === 1 ? 'result' : 'results'}` : 'No results'; };
  const catSummary = () => {
    if (!d.kats.length) return 'Any category';
    const names = d.kats.map(k => k.split('|')[1]);
    return names.length <= 2 ? names.join(', ') : `${names.length} selected`;
  };
  const chipRow = (items, cur, attr) => `<div class="chips scroll f-row">${items.map(([k, l]) => `<button type="button" class="chip ${cur === k ? 'on' : ''}" data-${attr}="${esc(k)}" aria-pressed="${cur === k}">${esc(l)}</button>`).join('')}</div>`;

  const mainView = () => `
    <section class="f-sec"><h3>Date</h3>
      ${chipRow(PERIODS, d.period, 'p')}
      ${d.period === 'custom' ? `<div class="row2 f-dates"><label class="field"><span>From</span><input class="input" type="date" data-d="from" value="${esc(d.from)}" max="${esc(d.to || '')}"></label>
        <label class="field"><span>To</span><input class="input" type="date" data-d="to" value="${esc(d.to)}" min="${esc(d.from || '')}"></label></div>` : ''}
    </section>
    <section class="f-sec"><h3>Type</h3>
      <div class="seg">${TYPES.map(([k, l]) => `<button type="button" data-t="${k}" class="${d.tipe === k ? 'on' : ''}" aria-pressed="${d.tipe === k}">${l}</button>`).join('')}</div>
    </section>
    <section class="f-sec"><h3>Account</h3>
      ${chipRow([['', 'All accounts'], ...activeAccounts(state.rekening).map(r => [r.id, r.nama])], d.akun, 'a')}
    </section>
    ${d.tipe === 'transfer' ? '' : `<section class="f-sec"><h3>Category</h3>
      <button type="button" class="f-link" data-act="cats"><span class="f-link-v ${d.kats.length ? 'set' : ''}">${esc(catSummary())}</span>${svg('chevronRight', 18)}</button>
    </section>`}`;

  const catsView = () => {
    const cats = catsFor(d.tipe);
    const group = (tipe, label) => {
      const list = cats.filter(k => k.tipe === tipe);
      if (!list.length) return '';
      return `${d.tipe === 'all' ? `<div class="f-group">${label}</div>` : ''}<div class="f-checks">${list.map(k => {
        const key = `${k.tipe}|${k.nama}`, on = d.kats.includes(key);
        return `<button type="button" class="f-check ${on ? 'on' : ''}" data-k="${esc(key)}" role="checkbox" aria-checked="${on}">
          ${tile(k.ikon, k.warna, 'sm')}<span>${esc(k.nama)}</span><i class="box">${on ? svg('check', 14) : ''}</i></button>`;
      }).join('')}</div>`;
    };
    return `<div class="f-sub"><button type="button" class="f-back" data-act="back">${svg('back', 20)}<span>Category</span></button>
        ${d.kats.length ? '<button type="button" class="f-clear" data-act="none">Clear</button>' : ''}</div>
      ${group('keluar', 'Expense')}${group('masuk', 'Income')}`;
  };

  openSheet({
    title: 'Filters',
    body: '<div id="fbody"></div>',
    footer: `<div class="f-foot"><button type="button" class="f-reset" data-act="reset">Reset</button><button type="button" class="btn primary" data-act="apply"></button></div>`,
    onMount(el, close) {
      const bodyEl = el.querySelector('#fbody');
      const apply = el.querySelector('[data-act="apply"]');
      const scroller = el.querySelector('.sheet-b');
      const redraw = (keepScroll = true) => {
        const y = scroller.scrollTop;
        bodyEl.innerHTML = view === 'main' ? mainView() : catsView();
        scroller.scrollTop = keepScroll ? y : 0;
        apply.textContent = view === 'main' ? resultLabel() : 'Done';
        apply.disabled = view === 'main' && !filtered(d).length;
        el.querySelector('[data-act="reset"]').hidden = view !== 'main' || !activeCount(d);
        bind();
      };
      const bind = () => {
        bodyEl.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => {
          d.period = b.dataset.p;
          if (d.period === 'custom' && !d.from && !d.to) { d.from = `${ym(todayISO())}-01`; d.to = todayISO(); }
          redraw();
        }; });
        bodyEl.querySelectorAll('[data-d]').forEach(i => { i.onchange = () => { d[i.dataset.d] = i.value; redraw(); }; });
        bodyEl.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => {
          d.tipe = b.dataset.t;
          if (d.tipe !== 'all') d.kats = d.tipe === 'transfer' ? [] : d.kats.filter(k => k.startsWith(`${d.tipe}|`));
          redraw();
        }; });
        bodyEl.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => { d.akun = b.dataset.a; redraw(); }; });
        const cats = bodyEl.querySelector('[data-act="cats"]');
        if (cats) cats.onclick = () => { view = 'cats'; redraw(false); };
        const back = bodyEl.querySelector('[data-act="back"]');
        if (back) back.onclick = () => { view = 'main'; redraw(false); };
        const none = bodyEl.querySelector('[data-act="none"]');
        if (none) none.onclick = () => { d.kats = []; redraw(); };
        bodyEl.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => {
          const k = b.dataset.k;
          d.kats = d.kats.includes(k) ? d.kats.filter(x => x !== k) : [...d.kats, k];
          redraw();
        }; });
        // pilihan yang aktif terlihat di baris yang bisa digeser
        bodyEl.querySelectorAll('.f-row .chip.on').forEach(c => { const r = c.parentElement; if (c.offsetLeft + c.offsetWidth > r.clientWidth) r.scrollLeft = c.offsetLeft - 16; });
      };
      el.querySelector('[data-act="reset"]').onclick = () => { Object.assign(d, fresh()); redraw(); };
      apply.onclick = () => {
        if (view === 'cats') { view = 'main'; redraw(false); return; }
        F = d; months = 1; close(); onApply();
      };
      redraw(false);
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

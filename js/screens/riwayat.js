import { svg } from '../icons.js';
import { esc, rupiah, dayHeader } from '../format.js';
import { todayISO, ym, addMonths } from '../dates.js';
import { activeAccounts, byNewest, normalize, num } from '../model.js';
import { txRow, accName } from '../ui.js';

// state lokal layar
let q = '';
let filter = 'all';
let months = 1;

function filtered(state) {
  const nq = normalize(q);
  return state.transaksi.filter(t => {
    if (t.dihapus) return false;
    if (filter === 'keluar' || filter === 'masuk' || filter === 'transfer') { if (t.tipe !== filter) return false; }
    else if (filter.startsWith('acc:')) { const id = filter.slice(4); if (t.akun !== id && t.akun_tujuan !== id) return false; }
    if (nq) {
      const hay = normalize([t.catatan, t.kategori, accName(t.akun), t.akun_tujuan ? accName(t.akun_tujuan) : ''].join(' '));
      if (!hay.includes(nq)) return false;
    }
    return true;
  }).sort(byNewest);
}

// Nilai bersih per hari (untuk header): masuk − keluar; transfer hanya biaya admin
function dayNet(list, accFilter) {
  let s = 0;
  for (const t of list) {
    const n = num(t.nominal);
    if (t.tipe === 'masuk') s += n;
    else if (t.tipe === 'keluar') s -= n;
    else if (t.tipe === 'transfer') {
      if (accFilter) { if (t.akun === accFilter) s -= n + num(t.biaya_admin); if (t.akun_tujuan === accFilter) s += n; }
      else s -= num(t.biaya_admin);
    } else if (t.tipe === 'penyesuaian') s += n;
  }
  return s;
}

function listHTML(state) {
  const today = todayISO();
  const all = filtered(state);
  const from = q ? '' : `${addMonths(ym(today), -(months - 1))}-01`;
  const shown = from ? all.filter(t => t.tanggal >= from) : all;
  const more = from && all.length > shown.length;
  const groups = new Map();
  for (const t of shown) { if (!groups.has(t.tanggal)) groups.set(t.tanggal, []); groups.get(t.tanggal).push(t); }
  const accF = filter.startsWith('acc:') ? filter.slice(4) : null;
  let html = '';
  for (const [d, list] of groups) {
    const net = dayNet(list, accF);
    html += `<div class="sec-h" style="margin:16px 0 6px"><span class="muted" style="font-size:13px;font-weight:600">${esc(dayHeader(d, today))}</span>
      <span class="num muted" style="font-size:13px;font-weight:600">${rupiah(net, { sign: true })}</span></div>
      <div class="card" style="margin:0 16px;padding:2px 16px"><div class="rows">${list.map(t => txRow(t)).join('')}</div></div>`;
  }
  if (!shown.length) html = `<p class="empty" style="margin-top:24px">${q || filter !== 'all' ? 'Tidak ditemukan.' : 'Belum ada transaksi.'}</p>`;
  if (more) html += `<div class="pad" style="margin-top:14px"><button class="btn ghost big" data-act="more">Muat lagi</button></div>`;
  return { html, count: all.length };
}

export default {
  live: true,
  enter(query) {
    if (query.akun) { filter = `acc:${query.akun}`; months = 1; q = ''; }
  },
  render({ state }) {
    const accs = activeAccounts(state.rekening);
    const chips = [['all', 'Semua'], ['keluar', 'Pengeluaran'], ['masuk', 'Pemasukan'], ['transfer', 'Transfer'], ...accs.map(r => [`acc:${r.id}`, r.nama])];
    const { html, count } = listHTML(state);
    return `
      <div class="top"><div style="flex:1"><h1>Riwayat</h1><div class="sub" id="rw-count">${count} transaksi</div></div></div>
      <div class="pad">
        <label class="search"><span class="sr-only">Cari transaksi</span>${svg('search', 18)}
          <input id="rw-q" class="input" type="search" placeholder="Cari" value="${esc(q)}" autocomplete="off"></label>
      </div>
      <div class="chips scroll" style="padding:12px 16px 0">${chips.map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${esc(k)}" aria-pressed="${filter === k}">${esc(l)}</button>`).join('')}</div>
      <div id="rw-list">${html}</div>`;
  },
  bind(root, { state, go, rerender }) {
    const bindList = () => {
      root.querySelectorAll('[data-tx]').forEach(b => { b.onclick = () => go(`#/catat?id=${encodeURIComponent(b.dataset.tx)}`); });
      const more = root.querySelector('[data-act="more"]');
      if (more) more.onclick = () => { months++; refresh(); };
    };
    const refresh = () => {
      const { html, count } = listHTML(state);
      root.querySelector('#rw-list').innerHTML = html;
      root.querySelector('#rw-count').textContent = `${count} transaksi`;
      bindList();
    };
    root.querySelector('#rw-q').addEventListener('input', e => { q = e.target.value; refresh(); });
    root.querySelectorAll('[data-f]').forEach(b => { b.onclick = () => { filter = b.dataset.f; months = 1; rerender(); }; });
    bindList();
  },
};

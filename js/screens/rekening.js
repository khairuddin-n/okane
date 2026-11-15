import { svg } from '../icons.js';
import { esc, rupiah, fmtDayMonth, monthShort } from '../format.js';
import { todayISO, ym, diffDays, dayOf } from '../dates.js';
import { balances, activeAccounts, byNewest, nextAdminCharge, billsForMonth, unpaidTotal, num } from '../model.js';
import { txRow, JENIS, openSheet, toast, moneyInput, bindMoney, catTile, confirmSheet } from '../ui.js';
import { state, saveTx, saveBill } from '../store.js';

let tab = 'saldo';
let jenisF = 'all';
let selected = null;

function visibleAccounts() {
  return activeAccounts(state.rekening).filter(r => jenisF === 'all' || r.jenis === jenisF);
}

function billMeta(b, today) {
  if (b.lunas) return `Lunas · dari ${esc(accLabel(b.pembayaran?.akun || b.akun))}`;
  const d = diffDays(today, b.due);
  const when = d === 0 ? 'Hari ini' : d > 0 ? `${d} hari lagi` : `Lewat ${-d} hari`;
  return `${when} · dari ${esc(accLabel(b.akun))}`;
}
const accLabel = id => state.rekening.find(r => r.id === id)?.nama || '—';

function saldoTab(bal, today) {
  const accs = visibleAccounts();
  if (!accs.find(r => r.id === selected)) selected = accs[0]?.id || null;
  const r = accs.find(x => x.id === selected);
  let detail = '<p class="empty">Belum ada rekening.</p>';
  if (r) {
    const txs = state.transaksi.filter(t => !t.dihapus && (t.akun === r.id || t.akun_tujuan === r.id)).sort(byNewest).slice(0, 3);
    const next = nextAdminCharge(r, today);
    const sched = next ? `<div class="row sched">${catTile('keluar', r.admin_kategori || 'Biaya bank')}
      <span class="mid"><span class="ttl">Biaya admin bulanan</span><span class="meta">${esc(fmtDayMonth(next.tanggal))} · terjadwal otomatis</span></span>
      <span class="amt num">${rupiah(-next.nominal)}</span></div>` : '';
    detail = `
      <div class="pad"><div class="actions">
        <a class="act" href="#/catat?tipe=transfer&dari=${esc(r.id)}">${svg('transfer', 22)}Transfer</a>
        <button class="act" data-act="adjust">${svg('adjust', 22)}Sesuaikan saldo</button>
        <a class="act" href="#/rekening/atur/${esc(r.id)}">${svg('settings', 22)}Atur</a>
      </div></div>
      <div class="pad" style="margin-top:14px"><section class="card">
        <div class="card-h"><h2>Mutasi ${esc(r.nama)}</h2><a class="link" href="#/riwayat?akun=${esc(r.id)}">Semua</a></div>
        ${sched || txs.length ? `<div class="rows">${sched}${txs.map(t => txRow(t)).join('')}</div>` : '<p class="empty">Belum ada mutasi.</p>'}
      </section></div>`;
  }
  const chips = [['all', 'Semua'], ['bank', 'Bank'], ['ewallet', 'E-wallet'], ['tunai', 'Tunai']];
  return `
    <div class="chips scroll" style="padding:4px 16px 10px">${chips.map(([k, l]) => `<button class="chip ${jenisF === k ? 'on' : ''}" data-j="${k}" aria-pressed="${jenisF === k}">${l}</button>`).join('')}</div>
    <div class="carousel" id="car">
      ${accs.map(a => `<button class="acc-card k-${esc(a.jenis)} ${a.id === selected ? 'on' : ''}" data-card="${esc(a.id)}">
        <span class="top-l"><span><span class="nm" style="display:block">${esc(a.nama)}</span><span class="ket">${esc(a.keterangan || '')}</span></span><span class="jn">${JENIS[a.jenis] || ''}</span></span>
        <span class="sl-l">Saldo</span><span class="sl num">${rupiah(bal.get(a.id))}</span></button>`).join('')}
      ${accs.length ? '' : `<a class="acc-card on" href="#/rekening/atur/baru" style="background:var(--surface);color:var(--text);border:1.5px dashed var(--border);align-items:center;justify-content:center;gap:8px">${svg('plus', 26)}<b>Tambah rekening</b></a>`}
    </div>
    <div class="dots">${accs.map(a => `<i class="${a.id === selected ? 'on' : ''}"></i>`).join('')}</div>
    ${detail}`;
}

function tagihanTab(total, today) {
  const m = ym(today);
  const bills = billsForMonth(state.tagihan, state.transaksi, m);
  const unpaid = unpaidTotal(bills);
  const free = total - unpaid;
  const freeShare = total > 0 ? Math.max(0, Math.min(1, free / total)) : 0;
  return `<div class="pad stack">
    <section class="card">
      <div class="muted" style="font-size:13px;font-weight:600">Saldo bebas setelah tagihan</div>
      <div class="num" style="font-size:24px;font-weight:800;margin:2px 0 10px">${rupiah(free)}</div>
      <div class="split"><i style="flex:${freeShare};background:var(--primary)"></i><i style="flex:${1 - freeShare};background:var(--warn)"></i></div>
      <div class="legend"><span><i style="background:var(--primary)"></i>Bebas ${rupiah(free)}</span><span><i style="background:var(--warn)"></i>Tagihan belum dibayar ${rupiah(unpaid)}</span></div>
    </section>
    <section class="card" style="padding:6px 16px">
      ${bills.length ? `<div class="rows">${bills.map(b => {
        const soon = !b.lunas && diffDays(today, b.due) <= 7;
        return `<div class="row">
          <button class="bill-date ${b.lunas ? 'paid' : soon ? 'soon' : ''}" data-bill="${esc(b.id)}" aria-label="Ubah tagihan ${esc(b.nama)}"><b>${dayOf(b.due)}</b><small>${monthShort(m)}</small></button>
          <button class="mid" data-bill="${esc(b.id)}" style="text-align:left"><span class="ttl" style="display:block">${esc(b.nama)}</span><span class="meta" style="display:block">${billMeta(b, today)}</span></button>
          <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><b class="num" style="font-size:14px">${rupiah(b.nominal)}</b>
          ${b.lunas ? '<span class="paid-tag">Lunas ✓</span>' : `<a class="btn primary sm" href="#/catat?tagihan=${esc(b.id)}&periode=${m}">Bayar</a>`}</span>
        </div>`;
      }).join('')}</div>` : '<p class="empty">Belum ada tagihan. Tambahkan tagihan rutin seperti listrik, internet, atau kos lewat tombol +.</p>'}
    </section></div>`;
}

export function openBillSheet(id) {
  const b = state.tagihan.find(x => x.id === id) || { nama: '', nominal: 0, tanggal: dayOf(todayISO()), akun: activeAccounts(state.rekening)[0]?.id || '', kategori: 'Tagihan', aktif: true };
  const accs = activeAccounts(state.rekening);
  const kats = state.kategori.filter(k => k.tipe === 'keluar' && !k.arsip);
  openSheet({
    title: id ? 'Ubah tagihan' : 'Tagihan baru',
    body: `<form class="stack" id="bf">
      <label class="field"><span>Nama</span><input class="input" name="nama" required value="${esc(b.nama)}" placeholder="Contoh: Listrik" autofocus></label>
      <label class="field"><span>Nominal</span>${moneyInput('nominal', b.nominal)}</label>
      <div class="row2">
        <label class="field"><span>Tanggal jatuh tempo</span><input class="input" name="tanggal" type="number" min="1" max="31" inputmode="numeric" value="${num(b.tanggal) || 1}"></label>
        <label class="field"><span>Kategori</span><select class="input" name="kategori">${kats.map(k => `<option ${k.nama === b.kategori ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Dibayar dari</span><select class="input" name="akun">${accs.map(r => `<option value="${esc(r.id)}" ${r.id === b.akun ? 'selected' : ''}>${esc(r.nama)}</option>`).join('')}</select></label>
      <button class="btn primary big" type="submit">Simpan</button>
      ${id ? '<button class="btn danger-text big" type="button" data-act="off">Hapus tagihan</button>' : ''}
    </form>`,
    onMount(el, close) {
      const money = bindMoney(el.querySelector('[name="nominal"]'));
      el.querySelector('#bf').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const nama = String(fd.get('nama')).trim();
        if (!nama || !(money.get() > 0)) { toast('Isi nama dan nominal'); return; }
        await saveBill({ ...b, nama, nominal: money.get(), tanggal: Math.max(1, Math.min(31, Number(fd.get('tanggal')) || 1)), kategori: fd.get('kategori'), akun: fd.get('akun'), aktif: true });
        close(); toast('Tagihan tersimpan');
      };
      const off = el.querySelector('[data-act="off"]');
      if (off) off.onclick = async () => {
        close();
        if (await confirmSheet({ title: 'Hapus tagihan?', text: 'Tagihan tidak lagi muncul. Pembayaran yang sudah dicatat tetap ada.', ok: 'Hapus', danger: true })) {
          await saveBill({ ...b, aktif: false }); toast('Tagihan dihapus');
        }
      };
    },
  });
}

function openAdjust(r, current) {
  openSheet({
    title: `Sesuaikan saldo ${r.nama}`,
    body: `<form class="stack" id="af">
      <p class="muted" style="font-size:13.5px">Saldo di okane: <b class="num">${rupiah(current)}</b></p>
      <label class="field"><span>Saldo sebenarnya</span>${moneyInput('real', current, 'autofocus')}</label>
      <button class="btn primary big" type="submit">Simpan</button></form>`,
    onMount(el, close) {
      const money = bindMoney(el.querySelector('[name="real"]'));
      el.querySelector('#af').onsubmit = async e => {
        e.preventDefault();
        const diff = money.get() - current;
        close();
        if (!diff) { toast('Saldo sudah cocok'); return; }
        const now = new Date();
        await saveTx({ tanggal: todayISO(), jam: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, tipe: 'penyesuaian', nominal: diff, akun: r.id, catatan: 'Penyesuaian saldo' });
        toast('Saldo disesuaikan');
      };
    },
  });
}

export default {
  live: true,
  enter(query) {
    if (query.id) { selected = query.id; tab = 'saldo'; jenisF = 'all'; }
    if (query.tab === 'tagihan') tab = 'tagihan';
  },
  render({ state: s }) {
    const today = todayISO();
    const bal = balances(s.rekening, s.transaksi);
    const accs = activeAccounts(s.rekening);
    const total = accs.reduce((t, r) => t + bal.get(r.id), 0);
    const unpaidCount = billsForMonth(s.tagihan, s.transaksi, ym(today)).filter(b => !b.lunas).length;
    return `
      <div class="top"><div style="flex:1"><h1>Rekening</h1><div class="sub"><span class="num">Total ${rupiah(total)}</span> · ${accs.length} rekening</div></div>
        <button class="icon-btn solid" data-act="add" aria-label="${tab === 'saldo' ? 'Tambah rekening' : 'Tambah tagihan'}">${svg('plus')}</button></div>
      <div class="pad" style="margin:6px 0 12px"><div class="seg" role="tablist">
        <button role="tab" data-tab="saldo" class="${tab === 'saldo' ? 'on' : ''}" aria-selected="${tab === 'saldo'}">Saldo</button>
        <button role="tab" data-tab="tagihan" class="${tab === 'tagihan' ? 'on' : ''}" aria-selected="${tab === 'tagihan'}">Tagihan${unpaidCount ? ` · ${unpaidCount}` : ''}</button>
      </div></div>
      ${tab === 'saldo' ? saldoTab(bal, today) : tagihanTab(total, today)}`;
  },
  bind(root, { go, rerender }) {
    root.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { tab = b.dataset.tab; rerender(); }; });
    root.querySelector('[data-act="add"]').onclick = () => (tab === 'saldo' ? go('#/rekening/atur/baru') : openBillSheet(null));
    root.querySelectorAll('[data-bill]').forEach(b => { b.onclick = () => openBillSheet(b.dataset.bill); });
    root.querySelectorAll('[data-tx]').forEach(b => { b.onclick = () => go(`#/catat?id=${encodeURIComponent(b.dataset.tx)}`); });
    if (tab !== 'saldo') return;
    root.querySelectorAll('[data-j]').forEach(b => { b.onclick = () => { jenisF = b.dataset.j; selected = null; rerender(); }; });

    const car = root.querySelector('#car');
    const cards = [...car.querySelectorAll('[data-card]')];
    const idx = cards.findIndex(c => c.dataset.card === selected);
    if (idx > 0) car.scrollLeft = cards[idx].offsetLeft - (car.clientWidth - cards[idx].offsetWidth) / 2;
    let t;
    car.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const mid = car.scrollLeft + car.clientWidth / 2;
        let best = null, bd = Infinity;
        for (const c of cards) { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = c; } }
        if (best && best.dataset.card !== selected) { selected = best.dataset.card; rerender(); }
      }, 120);
    }, { passive: true });
    cards.forEach(c => { c.onclick = () => { if (c.dataset.card !== selected) { selected = c.dataset.card; rerender(); } }; });

    const adj = root.querySelector('[data-act="adjust"]');
    if (adj) adj.onclick = () => {
      const r = state.rekening.find(x => x.id === selected);
      openAdjust(r, balances(state.rekening, state.transaksi).get(r.id));
    };
  },
};

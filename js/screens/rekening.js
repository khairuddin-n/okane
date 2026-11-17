import { svg } from '../icons.js';
import { esc, rupiah, fmtDayMonth, monthShort, initials, dayHeader } from '../format.js';
import { todayISO, ym, diffDays, dayOf } from '../dates.js';
import { ADMIN_CATEGORY, BILL_CATEGORY, balances, activeAccounts, byNewest, nextAdminCharge, billsForMonth, unpaidTotal, num, openDebts, debtTotal, isInstallment } from '../model.js';
import { txRow, JENIS, openSheet, toast, undoToast, moneyInput, bindMoney, catTile, confirmSheet, money, accChip } from '../ui.js';
import { state, saveTx, saveBill, settleDebt, withUndo } from '../store.js';
import { targetTab, bindTarget, openTargetSheet } from './target.js';

let tab = 'saldo';
let jenisF = 'all';
let selected = null;
const PIUTANG = '__piutang'; // kartu virtual di akhir carousel

function visibleAccounts() {
  return activeAccounts(state.rekening).filter(r => jenisF === 'all' || r.jenis === jenisF);
}

function billMeta(b, today) {
  if (b.lunas) return 'Paid';
  const d = diffDays(today, b.due);
  return d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : d > 0 ? `Due in ${d} days` : `${-d} days overdue`;
}

function piutangDetail(debts, today) {
  return `<div class="pad"><section class="card" style="padding:6px 16px"><div class="rows">${debts.map(p => `<div class="row">
    <span class="tile c-violet" style="font-weight:800;font-size:13px">${esc(initials(p.nama))}</span>
    <span class="mid"><span class="ttl">${esc(p.nama)}</span><span class="meta">${esc([p.catatan, dayHeader(p.tanggal, today).split(' · ')[0]].filter(Boolean).join(' · '))}</span></span>
    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><b class="num" style="font-size:14px">${rupiah(p.nominal)}</b>
      <button class="btn primary sm" data-lunas="${esc(p.id)}">Paid back</button></span></div>`).join('')}</div></section></div>`;
}

function openSettle(p) {
  const bal = balances(state.rekening, state.transaksi);
  const accs = activeAccounts(state.rekening);
  let akun = accs[0]?.id || '';
  const chips = () => accs.map(r => accChip(r, r.id === akun, bal.get(r.id))).join('');
  openSheet({
    title: `${p.nama} · ${rupiah(p.nominal, { raw: true })}`,
    body: `<div class="stack"><div><div class="label">Received in</div><div class="chips scroll" id="sacc">${chips()}</div></div>
      <button class="btn primary big" data-ok>Mark as paid back</button></div>`,
    onMount(el, close) {
      const bind = () => el.querySelectorAll('[data-acc]').forEach(b => { b.onclick = () => { akun = b.dataset.acc; el.querySelector('#sacc').innerHTML = chips(); bind(); }; });
      bind();
      el.querySelector('[data-ok]').onclick = async () => {
        if (!akun) return;
        close();
        const undo = await withUndo(() => settleDebt(p.id, akun));
        undoToast('Marked as paid back', undo);
      };
    },
  });
}

function saldoTab(bal, today) {
  const accs = visibleAccounts();
  const debts = jenisF === 'all' ? openDebts(state.piutang, state.transaksi) : [];
  if (selected === PIUTANG && !debts.length) selected = null;
  if (selected !== PIUTANG && !accs.find(r => r.id === selected)) selected = accs[0]?.id || null;
  const r = accs.find(x => x.id === selected);
  let detail = '<p class="empty">No accounts yet.</p>';
  if (selected === PIUTANG) detail = piutangDetail(debts, today);
  else if (r) {
    const txs = state.transaksi.filter(t => !t.dihapus && (t.akun === r.id || t.akun_tujuan === r.id)).sort(byNewest).slice(0, 3);
    const next = nextAdminCharge(r, today);
    const sched = next ? `<div class="row sched">${catTile('keluar', r.admin_kategori || ADMIN_CATEGORY)}
      <span class="mid"><span class="ttl">Monthly admin fee</span><span class="meta">${esc(fmtDayMonth(next.tanggal))} · scheduled</span></span>
      <span class="amt num">${rupiah(-next.nominal)}</span></div>` : '';
    detail = `
      <div class="pad"><div class="actions">
        <a class="act" href="#/catat?tipe=transfer&dari=${esc(r.id)}"><span class="ib">${svg('transfer', 22)}</span>Transfer</a>
        <button class="act" data-act="adjust"><span class="ib">${svg('check', 22)}</span>Adjust</button>
        <a class="act" href="#/rekening/atur/${esc(r.id)}"><span class="ib">${svg('settings', 22)}</span>Edit</a>
      </div></div>
      <div class="pad" style="margin-top:14px"><section class="card">
        <div class="card-h"><h2>Activity</h2><a class="link" href="#/riwayat?akun=${esc(r.id)}">All ${svg('chevronRight', 16)}</a></div>
        ${sched || txs.length ? `<div class="rows">${sched}${txs.map(t => txRow(t)).join('')}</div>` : '<p class="empty">No activity yet.</p>'}
      </section></div>`;
  }
  const chips = [['all', 'All'], ['bank', 'Bank'], ['ewallet', 'E-wallet'], ['tunai', 'Cash']];
  return `
    <div class="chips scroll" style="padding:4px 16px 10px">${chips.map(([k, l]) => `<button class="chip ${jenisF === k ? 'on' : ''}" data-j="${k}" aria-pressed="${jenisF === k}">${l}</button>`).join('')}</div>
    <div class="carousel" id="car">
      ${accs.map(a => `<button class="acc-card k-${esc(a.jenis)} ${a.id === selected ? 'on' : ''}" data-card="${esc(a.id)}">
        <span class="top-l"><span><span class="nm" style="display:block">${esc(a.nama)}</span><span class="ket">${esc(a.keterangan || '')}</span></span><span class="jn">${JENIS[a.jenis] || ''}</span></span>
        <span class="sl num">${money(bal.get(a.id))}</span></button>`).join('')}
      ${debts.length ? `<button class="acc-card k-piutang ${selected === PIUTANG ? 'on' : ''}" data-card="${PIUTANG}">
        <span class="top-l"><span><span class="nm" style="display:block">Owed to you</span><span class="ket">Not paid back yet</span></span><span class="jn">${new Set(debts.map(p => String(p.nama).toLowerCase())).size} people</span></span>
        <span class="sl num">${money(debtTotal(debts))}</span></button>` : ''}
      ${accs.length ? '' : `<a class="acc-card on" href="#/rekening/atur/baru" style="background:var(--chip-bg);color:var(--text);align-items:center;justify-content:center;gap:8px;box-shadow:none">${svg('plus', 26)}<b>Add account</b></a>`}
    </div>
    <div class="dots">${[...accs.map(a => a.id), ...(debts.length ? [PIUTANG] : [])].map(id => `<i class="${id === selected ? 'on' : ''}"></i>`).join('')}</div>
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
      <div class="muted" style="font-size:13px;font-weight:500">Free after bills</div>
      <div class="num" style="font-size:28px;font-weight:800;letter-spacing:-.03em;margin:2px 0 12px">${money(free)}</div>
      <div class="split"><i style="flex:${freeShare};background:var(--primary)"></i><i style="flex:${1 - freeShare};background:var(--warn)"></i></div>
      <div class="legend"><span><i style="background:var(--warn)"></i>Unpaid<b class="num">${rupiah(unpaid)}</b></span></div>
    </section>
    <section class="card" style="padding:6px 16px">
      ${bills.length ? `<div class="rows">${bills.map(b => {
        const soon = !b.lunas && diffDays(today, b.due) <= 7;
        return `<div class="row">
          <button class="bill-date ${b.lunas ? 'paid' : soon ? 'soon' : ''}" data-bill="${esc(b.id)}" aria-label="Edit bill ${esc(b.nama)}"><b>${dayOf(b.due)}</b><small>${monthShort(m)}</small></button>
          <button class="mid" data-bill="${esc(b.id)}" style="text-align:left"><span class="ttl" style="display:block">${esc(b.nama)}</span><span class="meta" style="display:block">${billMeta(b, today)}</span>${b.cicilan ? `<span class="inst"><span class="bar thin"><i style="width:${Math.min(100, (b.cicilan.paid / b.cicilan.tenor) * 100)}%"></i></span><small>Installment ${Math.min(b.cicilan.tenor, b.cicilan.paid + (b.lunas ? 0 : 1))} of ${b.cicilan.tenor}</small></span>` : ''}</button>
          <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><b class="num" style="font-size:14px">${rupiah(b.nominal)}</b>
          ${b.lunas ? `<span class="paid-tag">${svg('check', 14)}Paid</span>` : `<a class="btn primary sm" href="#/catat?tagihan=${esc(b.id)}&periode=${m}">Pay</a>`}</span>
        </div>`;
      }).join('')}</div>` : '<p class="empty">No bills yet.</p>'}
    </section></div>`;
}

export function openBillSheet(id) {
  const b = state.tagihan.find(x => x.id === id) || { nama: '', nominal: 0, tanggal: dayOf(todayISO()), akun: activeAccounts(state.rekening)[0]?.id || '', kategori: BILL_CATEGORY, aktif: true, tenor: 0, cicilan_mulai: '' };
  let cicil = isInstallment(b);
  const cicilHTML = () => (cicil ? `<div class="row2">
      <label class="field"><span>Months</span><input class="input" name="tenor" type="number" min="1" max="600" inputmode="numeric" value="${num(b.tenor) || 12}"></label>
      <label class="field"><span>Starts</span><input class="input" name="cicilan_mulai" type="month" value="${esc(b.cicilan_mulai || ym(todayISO()))}"></label></div>` : '');
  const accs = activeAccounts(state.rekening);
  const kats = state.kategori.filter(k => k.tipe === 'keluar' && !k.arsip);
  openSheet({
    title: id ? 'Edit bill' : 'New bill',
    body: `<form class="stack" id="bf">
      <label class="field"><span>Name</span><input class="input" name="nama" required value="${esc(b.nama)}" placeholder="e.g. Rent, Electricity" autofocus></label>
      <label class="field"><span>Amount</span>${moneyInput('nominal', b.nominal)}</label>
      <div class="row2">
        <label class="field"><span>Due day</span><input class="input" name="tanggal" type="number" min="1" max="31" inputmode="numeric" value="${num(b.tanggal) || 1}"></label>
        <label class="field"><span>Category</span><select class="input" name="kategori">${kats.map(k => `<option ${k.nama === b.kategori ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Paid from</span><select class="input" name="akun">${accs.map(r => `<option value="${esc(r.id)}" ${r.id === b.akun ? 'selected' : ''}>${esc(r.nama)}</option>`).join('')}</select></label>
      <label class="inline-field" style="min-height:44px"><span>Installment</span>
        <span class="switch"><input type="checkbox" name="cicil" ${cicil ? 'checked' : ''} aria-label="Installment"><i></i></span></label>
      <div id="cicil">${cicilHTML()}</div>
      <button class="btn primary big" type="submit">Save</button>
      ${id ? '<button class="btn danger-text big" type="button" data-act="off">Delete bill</button>' : ''}
    </form>`,
    onMount(el, close) {
      const money = bindMoney(el.querySelector('[name="nominal"]'));
      el.querySelector('[name="cicil"]').onchange = e => { cicil = e.target.checked; el.querySelector('#cicil').innerHTML = cicilHTML(); };
      el.querySelector('#bf').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const nama = String(fd.get('nama')).trim();
        if (!nama || !(money.get() > 0)) { toast('Enter a name and amount'); return; }
        const tenor = cicil ? Math.max(1, Math.min(600, Math.round(Number(fd.get('tenor')) || 0))) : 0;
        const mulai = cicil && /^\d{4}-\d{2}$/.test(String(fd.get('cicilan_mulai') || '')) ? String(fd.get('cicilan_mulai')) : (cicil ? ym(todayISO()) : '');
        await saveBill({ ...b, nama, nominal: money.get(), tanggal: Math.max(1, Math.min(31, Number(fd.get('tanggal')) || 1)), kategori: fd.get('kategori'), akun: fd.get('akun'), aktif: true, tenor, cicilan_mulai: mulai });
        close(); toast('Bill saved');
      };
      const off = el.querySelector('[data-act="off"]');
      if (off) off.onclick = async () => {
        close();
        if (await confirmSheet({ title: 'Delete bill?', text: 'The bill will no longer show. Payments you already logged are kept.', ok: 'Delete', danger: true })) {
          await saveBill({ ...b, aktif: false }); toast('Bill deleted');
        }
      };
    },
  });
}

function openAdjust(r, current) {
  openSheet({
    title: `Adjust ${r.nama} balance`,
    body: `<form class="stack" id="af">
      <p class="muted" style="font-size:13.5px">Balance in okane: <b class="num">${rupiah(current)}</b></p>
      <label class="field"><span>Actual balance</span>${moneyInput('real', current, 'autofocus')}</label>
      <button class="btn primary big" type="submit">Save</button></form>`,
    onMount(el, close) {
      const money = bindMoney(el.querySelector('[name="real"]'));
      el.querySelector('#af').onsubmit = async e => {
        e.preventDefault();
        const diff = money.get() - current;
        close();
        if (!diff) { toast('Balance already matches'); return; }
        const now = new Date();
        await saveTx({ tanggal: todayISO(), jam: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, tipe: 'penyesuaian', nominal: diff, akun: r.id, catatan: 'Balance adjustment' });
        toast('Balance adjusted');
      };
    },
  });
}

export default {
  live: true,
  enter(query) {
    if (query.id) { selected = query.id; tab = 'saldo'; jenisF = 'all'; }
    if (query.tab === 'tagihan' || query.tab === 'target') tab = query.tab;
  },
  render({ state: s }) {
    const today = todayISO();
    const bal = balances(s.rekening, s.transaksi);
    const accs = activeAccounts(s.rekening);
    const total = accs.reduce((t, r) => t + bal.get(r.id), 0);
    const unpaidCount = billsForMonth(s.tagihan, s.transaksi, ym(today)).filter(b => !b.lunas).length;
    return `
      <div class="top"><div style="flex:1"><h1>Accounts</h1><div class="sub"><span class="num">Total ${rupiah(total)}</span> · ${accs.length} accounts</div></div>
        <button class="icon-btn solid" data-act="add" aria-label="${tab === 'saldo' ? 'Add account' : tab === 'tagihan' ? 'Add bill' : 'New goal'}">${svg('plus')}</button></div>
      <div class="pad" style="margin:6px 0 12px"><div class="seg" role="tablist">
        <button role="tab" data-tab="saldo" class="${tab === 'saldo' ? 'on' : ''}" aria-selected="${tab === 'saldo'}">Balances</button>
        <button role="tab" data-tab="tagihan" class="${tab === 'tagihan' ? 'on' : ''}" aria-selected="${tab === 'tagihan'}">Bills${unpaidCount ? ` · ${unpaidCount}` : ''}</button>
        <button role="tab" data-tab="target" class="${tab === 'target' ? 'on' : ''}" aria-selected="${tab === 'target'}">Goals</button>
      </div></div>
      ${tab === 'saldo' ? saldoTab(bal, today) : tab === 'tagihan' ? tagihanTab(total, today) : targetTab(today)}`;
  },
  bind(root, { go, rerender }) {
    root.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { tab = b.dataset.tab; rerender(); }; });
    root.querySelector('[data-act="add"]').onclick = () => (tab === 'saldo' ? go('#/rekening/atur/baru') : tab === 'tagihan' ? openBillSheet(null) : openTargetSheet(null));
    if (tab === 'target') { bindTarget(root); return; }
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

    root.querySelectorAll('[data-lunas]').forEach(b => {
      b.onclick = () => { const p = state.piutang.find(x => x.id === b.dataset.lunas); if (p) openSettle(p); };
    });
    const adj = root.querySelector('[data-act="adjust"]');
    if (adj) adj.onclick = () => {
      const r = state.rekening.find(x => x.id === selected);
      openAdjust(r, balances(state.rekening, state.transaksi).get(r.id));
    };
  },
};

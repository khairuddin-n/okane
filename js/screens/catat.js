import { svg } from '../icons.js';
import { esc, rupiah, compact, group, parseAmount } from '../format.js';
import { todayISO, hhmm, isoDate, nowISO, addDays } from '../dates.js';
import { BILL_CATEGORY, balances, activeAccounts, frequentEntries, matchNotes, guessCategory, applyGuess, guessLabel, num, liveDebts, debtNames, splitEven, scheduleFrom, scheduleLabel } from '../model.js';
import { tile, accChip, toast, undoToast, catTile, accName } from '../ui.js';
import { state, saveTx, deleteTx, saveDebts, saveRule, withUndo, runAutomations, findAccount } from '../store.js';

const TABS = [['keluar', 'Expense'], ['masuk', 'Income'], ['transfer', 'Transfer']];
const READ_ONLY = { penyesuaian: 'Balance adjustment', pelunasan: 'Repayment received' };
let f; // form state

function freshForm(query) {
  const accs = activeAccounts(state.rekening);
  const now = new Date();
  const base = {
    id: null, original: null, tipe: 'keluar', nominal: 0, catatan: '',
    sel: { kategori: '', manual: false, auto: null }, akun: accs[0]?.id || '', akunManual: false,
    akunTujuan: accs[1]?.id || '', biaya: 0, tanggal: isoDate(now), jam: hhmm(now),
    tagihan_id: '', periode: '',
    ulang: '',                    // '' | 'bulanan' | 'mingguan'
    talangan: false, orang: [],   // [{ id?, nama, nominal, lunas }]
    hadDebts: false,
  };
  if (query.id) {
    const t = state.transaksi.find(x => x.id === query.id);
    if (t) {
      const orang = liveDebts(state.piutang, state.transaksi).filter(p => p.transaksi_id === t.id)
        .map(p => ({ id: p.id, nama: p.nama, nominal: num(p.nominal), lunas: p.lunas }));
      Object.assign(base, {
        id: t.id, original: t, tipe: t.tipe, nominal: num(t.nominal), catatan: t.catatan || '',
        sel: { kategori: t.kategori, manual: true, auto: null }, akun: t.akun, akunManual: true,
        akunTujuan: t.akun_tujuan || base.akunTujuan, biaya: num(t.biaya_admin), tanggal: t.tanggal, jam: t.jam || '00:00',
        tagihan_id: t.tagihan_id || '', periode: t.periode || '',
        talangan: orang.length > 0, orang, hadDebts: orang.length > 0,
      });
      return base;
    }
  }
  if (['keluar', 'masuk', 'transfer'].includes(query.tipe)) base.tipe = query.tipe;
  if (query.dari && findAccount(query.dari)) {
    base.akun = query.dari; base.akunManual = true;
    if (base.akunTujuan === base.akun) base.akunTujuan = accs.find(r => r.id !== base.akun)?.id || '';
  }
  if (query.tagihan) {
    const b = state.tagihan.find(x => x.id === query.tagihan);
    if (b) Object.assign(base, {
      tipe: 'keluar', nominal: num(b.nominal), catatan: b.nama, sel: { kategori: b.kategori || BILL_CATEGORY, manual: true, auto: null },
      akun: b.akun || base.akun, akunManual: true, tagihan_id: b.id, periode: query.periode || '',
    });
  }
  if (base.tipe !== 'transfer' && !base.sel.kategori) base.sel.kategori = defaultCat(base.tipe);
  return base;
}

const cats = tipe => state.kategori.filter(k => k.tipe === tipe && !k.arsip).sort((a, b) => num(a.urutan) - num(b.urutan));
const defaultCat = tipe => (cats(tipe)[0] || {}).nama || '';

function accChips(selected, attr) {
  const bal = balances(state.rekening, state.transaksi);
  return activeAccounts(state.rekening).map(r => accChip(r, r.id === selected, bal.get(r.id)).replace('data-acc=', `data-${attr}=`)).join('');
}

// Grid ringkas: kategori yang paling sering dipakai (90 hari) + yang terpilih, sisanya di balik "More".
const SHORT = 7;
let showAllCats = false;
function shortList(list) {
  const from = addDays(todayISO(), -90);
  const used = new Map();
  for (const t of state.transaksi) if (!t.dihapus && t.tipe === f.tipe && t.tanggal >= from) used.set(t.kategori, (used.get(t.kategori) || 0) + 1);
  const top = [...list].sort((a, b) => (used.get(b.nama) || 0) - (used.get(a.nama) || 0) || num(a.urutan) - num(b.urutan)).slice(0, SHORT).map(k => k.nama);
  const keep = new Set([...top, f.sel.kategori]);
  return list.filter(k => keep.has(k.nama));
}
function catsHTML() {
  const all = cats(f.tipe);
  const list = showAllCats || all.length <= SHORT + 1 ? all : shortList(all);
  const btn = k => `<button type="button" class="cat ${k.nama === f.sel.kategori ? 'on' : ''}" data-cat="${esc(k.nama)}" aria-pressed="${k.nama === f.sel.kategori}">
    ${tile(k.ikon, k.warna, 'sm')}<span>${esc(k.nama)}</span></button>`;
  const toggle = all.length > SHORT + 1 ? `<button type="button" class="cat more" data-act="cats-more" aria-expanded="${showAllCats}">
    <span class="tile sm">${svg(showAllCats ? 'chevronUpSm' : 'grid', 16)}</span><span>${showAllCats ? 'Less' : `All ${all.length}`}</span></button>` : '';
  return list.map(btn).join('') + toggle;
}

function suggestions() {
  const today = todayISO();
  const list = f.catatan.trim().length >= 2
    ? matchNotes(state.transaksi, f.catatan, f.tipe, 3)
    : (f.catatan.trim() ? [] : frequentEntries(state.transaksi, 60, 3, today, f.tipe));
  return list.filter(s => s.catatan.trim().toLowerCase() !== f.catatan.trim().toLowerCase() || !f.catatan);
}

function suggHTML() {
  return suggestions().map((s, i) => `<button type="button" class="chip" data-sugg="${i}">${esc(s.catatan)}${state.privacy ? '' : ` <small>${compact(s.nominal)}</small>`}</button>`).join('');
}

// ----- Talangan -----
const talTotal = () => f.orang.reduce((s, o) => s + num(o.nominal), 0);
const myShare = () => Math.max(0, f.nominal - talTotal());

function talHTML() {
  const names = debtNames(state.piutang);
  return `<section class="card tal">
    <div class="label" style="letter-spacing:.04em">PAID ON BEHALF OF</div>
    ${f.orang.map((o, i) => o.lunas
      ? `<div class="tal-row"><b style="flex:1">${esc(o.nama)}</b><span class="paid-tag">${svg('check', 14)}Paid back</span><b class="num">${rupiah(o.nominal, { raw: true })}</b></div>`
      : `<div class="tal-row">
        <input class="input" data-tn="${i}" list="tal-names" placeholder="Name" autocomplete="off" value="${esc(o.nama)}" aria-label="Person ${i + 1} name">
        <div class="money"><input class="input num" data-ta="${i}" inputmode="numeric" autocomplete="off" placeholder="0" value="${o.nominal ? group(o.nominal) : ''}" aria-label="Person ${i + 1} amount"></div>
        <button type="button" class="icon-btn" data-td="${i}" aria-label="Remove person ${i + 1}">${svg('x', 18)}</button></div>`).join('')}
    <datalist id="tal-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="row2"><button type="button" class="btn sm" data-act="tal-add">${svg('plus', 16)} Add person</button>
      <button type="button" class="btn sm" data-act="tal-split">Split evenly</button></div>
    <div class="tal-me"><span>Your share</span><b class="num" id="tal-me">${rupiah(myShare(), { raw: true })}</b></div>
  </section>`;
}

function optsHTML() {
  const editing = !!f.id;
  const canRepeat = !editing && !f.tagihan_id;
  const canTal = f.tipe === 'keluar';
  if (!canRepeat && !canTal) return '';
  const label = f.ulang ? scheduleLabel(scheduleFrom(f.ulang, f.tanggal)) : '';
  return `<div>
    <div class="chips">
      ${canRepeat ? `<button type="button" class="chip opt ${f.ulang ? 'on' : ''}" data-opt="ulang" aria-pressed="${!!f.ulang}">${svg('repeat', 16)}Repeat</button>` : ''}
      ${canTal ? `<button type="button" class="chip opt ${f.talangan ? 'on' : ''}" data-opt="talangan" aria-pressed="${f.talangan}">${svg('people', 16)}Paid for others</button>` : ''}
    </div>
    ${canRepeat && f.ulang ? `<div class="seg" style="margin-top:10px"><button type="button" data-ulang="bulanan" class="${f.ulang === 'bulanan' ? 'on' : ''}">Monthly</button><button type="button" data-ulang="mingguan" class="${f.ulang === 'mingguan' ? 'on' : ''}">Weekly</button></div>
      <p class="muted" style="font-size:13px;margin-top:6px" id="ulang-l">${esc(label)} · logged automatically</p>` : ''}
    ${canTal && f.talangan ? `<div style="margin-top:10px">${talHTML()}</div>` : ''}
  </div>`;
}

function render() {
  const editing = !!f.id;
  const isTransfer = f.tipe === 'transfer';
  if (READ_ONLY[f.tipe]) {
    const t = f.original;
    return `<div class="catat">
      <div class="top with-back"><button class="icon-btn" data-act="close" aria-label="Close">${svg('x')}</button><h1>${READ_ONLY[f.tipe]}</h1></div>
      <div class="pad stack">
        <div class="card" style="display:flex;gap:12px;align-items:center">${catTile(f.tipe)}
          <div style="flex:1;min-width:0"><b>${esc(f.tipe === 'pelunasan' ? (t.catatan || accName(t.akun)) : accName(t.akun))}</b><div class="muted" style="font-size:13px">${f.tipe === 'pelunasan' ? `${esc(accName(t.akun))} · ` : ''}${esc(t.tanggal)} · ${esc(t.jam)}</div></div>
          <b class="num">${rupiah(t.nominal, { sign: true })}</b></div>
        <button class="btn danger-text big" data-act="delete">${svg('trash', 18)} Delete</button>
      </div></div>`;
  }
  return `<div class="catat">
    <div class="top with-back">
      <button class="icon-btn" data-act="close" aria-label="Close">${svg('x')}</button>
      <h1>${editing ? 'Edit transaction' : 'New transaction'}</h1>
      ${editing ? `<button class="icon-btn" data-act="delete" aria-label="Delete transaction" style="color:var(--expense)">${svg('trash')}</button>` : ''}
    </div>
    <div class="pad"><div class="seg" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tipe="${k}" class="${f.tipe === k ? 'on' : ''}" aria-selected="${f.tipe === k}">${l}</button>`).join('')}</div></div>

    <label class="amount ${f.tipe}"><span>Rp</span>
      <input id="amt" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="Amount" value="${f.nominal ? group(f.nominal) : ''}"></label>
    <div class="chips quick">${[10000, 25000, 50000, 100000].map(v => `<button type="button" class="chip" data-quick="${v}">${v / 1000}K</button>`).join('')}</div>

    <div class="pad stack" style="margin-top:10px">
      ${isTransfer ? `
        <p class="hint">Between your own accounts. Paying someone? Use Expense.</p>
        <div><div class="label">From</div><div class="chips scroll" id="from">${accChips(f.akun, 'from')}</div></div>
        <div class="swap-row"><button type="button" class="icon-btn" data-act="swap" aria-label="Swap accounts" style="background:var(--surface);box-shadow:var(--shadow)">${svg('swap')}</button></div>
        <div><div class="label">To</div><div class="chips scroll" id="to">${accChips(f.akunTujuan, 'to')}</div></div>
        <label class="field"><span>Transfer fee</span>
          <div class="money"><input id="fee" class="input num" inputmode="numeric" autocomplete="off" placeholder="0" value="${f.biaya ? group(f.biaya) : ''}"></div></label>
        <label class="field"><span>Note</span><input id="note" class="input" autocomplete="off" placeholder="—" value="${esc(f.catatan)}"></label>
      ` : `
        <div><label class="field"><span>Note</span>
          <input id="note" class="input" autocomplete="off" placeholder="${f.tipe === 'keluar' ? 'Lunch, fuel, gym…' : 'Salary, bonus…'}" value="${esc(f.catatan)}"></label>
          <div class="chips scroll sugg" id="sugg">${suggHTML()}</div></div>
        <div><div class="label-row"><span class="label">Category</span><span class="auto-badge" id="badge">${esc(guessLabel(f.sel.auto))}</span></div>
          <div class="cat-grid" id="cats">${catsHTML()}</div></div>
        <div><div class="label">${f.tipe === 'keluar' ? 'Paid from' : 'Received in'}</div><div class="chips scroll" id="accs">${accChips(f.akun, 'acc')}</div></div>
      `}
      ${optsHTML()}
      <div class="card" style="padding:4px 14px"><label class="inline-field"><span>Date</span>
        <input id="when" type="datetime-local" value="${esc(f.tanggal)}T${esc(f.jam)}"></label></div>
    </div>
    <div class="save-bar"><button class="btn primary big" data-act="save">Save</button></div>
  </div>`;
}

export default {
  live: false,
  enter(query) { f = freshForm(query); showAllCats = false; },
  render: () => render(),
  bind(root, ctx) {
    const $ = s => root.querySelector(s);
    const rerender = () => { root.innerHTML = render(); this.bind(root, ctx); };

    $('[data-act="close"]').onclick = () => ctx.back();
    const del = $('[data-act="delete"]');
    if (del) del.onclick = async () => {
      ctx.userAction?.();
      const undo = await withUndo(() => deleteTx(f.id));
      undoToast('Transaction deleted', undo);
      ctx.back();
    };
    if (READ_ONLY[f.tipe]) return;

    root.querySelectorAll('[data-tipe]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.tipe === f.tipe) return;
        f.tipe = b.dataset.tipe;
        f.sel = { kategori: f.tipe === 'transfer' ? '' : defaultCat(f.tipe), manual: false, auto: null };
        if (f.tipe !== 'transfer' && f.catatan) f.sel = applyGuess(f.sel, guessCategory(f.catatan, f.tipe, state.transaksi, state.kategori));
        if (f.tipe === 'transfer' && f.akunTujuan === f.akun) f.akunTujuan = activeAccounts(state.rekening).find(r => r.id !== f.akun)?.id || '';
        rerender();
      };
    });

    const updShare = () => { const el = $('#tal-me'); if (el) el.textContent = rupiah(myShare(), { raw: true }); };
    const amt = $('#amt');
    const fit = () => { amt.style.width = `${Math.max(1, amt.value.length) * 0.62 + 0.4}em`; };
    amt.addEventListener('input', () => {
      const v = parseAmount(amt.value);
      amt.value = v ? group(v) : '';
      f.nominal = v;
      fit(); updShare();
    });
    fit();
    root.querySelectorAll('[data-quick]').forEach(b => { b.onclick = () => { f.nominal = Number(b.dataset.quick); amt.value = group(f.nominal); fit(); updShare(); }; });

    const note = $('#note');
    note.addEventListener('input', () => {
      f.catatan = note.value;
      if (f.tipe === 'transfer') return;
      const g = guessCategory(f.catatan, f.tipe, state.transaksi, state.kategori);
      const before = f.sel.kategori;
      f.sel = applyGuess(f.sel, f.catatan.trim() ? g : null);
      if (!f.sel.manual && !f.akunManual && g?.akun && findAccount(g.akun) && !findAccount(g.akun).arsip) {
        f.akun = g.akun; $('#accs').innerHTML = accChips(f.akun, 'acc'); bindAccs();
      }
      $('#badge').textContent = guessLabel(f.sel.auto);
      if (before !== f.sel.kategori) { $('#cats').innerHTML = catsHTML(); bindCats(); }
      $('#sugg').innerHTML = suggHTML(); bindSugg();
    });

    const bindCats = () => {
      root.querySelectorAll('[data-cat]').forEach(b => {
        b.onclick = () => { f.sel = { kategori: b.dataset.cat, manual: true, auto: null }; $('#badge').textContent = ''; $('#cats').innerHTML = catsHTML(); bindCats(); };
      });
      const more = $('[data-act="cats-more"]');
      if (more) more.onclick = () => { showAllCats = !showAllCats; $('#cats').innerHTML = catsHTML(); bindCats(); };
    };
    const bindAccs = () => root.querySelectorAll('[data-acc]').forEach(b => {
      b.onclick = () => { f.akun = b.dataset.acc; f.akunManual = true; $('#accs').innerHTML = accChips(f.akun, 'acc'); bindAccs(); };
    });
    const bindSugg = () => {
      const list = suggestions();
      root.querySelectorAll('[data-sugg]').forEach(b => {
        b.onclick = () => {
          const s = list[Number(b.dataset.sugg)];
          if (!s) return;
          Object.assign(f, { catatan: s.catatan, nominal: s.nominal, sel: { kategori: s.kategori, manual: true, auto: null } });
          if (findAccount(s.akun) && !findAccount(s.akun).arsip) { f.akun = s.akun; f.akunManual = true; }
          rerender();
        };
      });
    };
    if (f.tipe !== 'transfer') { bindCats(); bindAccs(); bindSugg(); }
    else {
      const bindTr = () => {
        root.querySelectorAll('[data-from]').forEach(b => { b.onclick = () => { f.akun = b.dataset.from; $('#from').innerHTML = accChips(f.akun, 'from'); bindTr(); }; });
        root.querySelectorAll('[data-to]').forEach(b => { b.onclick = () => { f.akunTujuan = b.dataset.to; $('#to').innerHTML = accChips(f.akunTujuan, 'to'); bindTr(); }; });
      };
      bindTr();
      $('[data-act="swap"]').onclick = () => {
        [f.akun, f.akunTujuan] = [f.akunTujuan, f.akun];
        $('#from').innerHTML = accChips(f.akun, 'from'); $('#to').innerHTML = accChips(f.akunTujuan, 'to'); bindTr();
      };
      const fee = $('#fee');
      fee.addEventListener('input', () => { const v = parseAmount(fee.value); fee.value = v ? group(v) : ''; f.biaya = v; });
    }

    // ----- Opsi: Ulangi & Talangan -----
    root.querySelectorAll('[data-opt]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.opt === 'ulang') f.ulang = f.ulang ? '' : 'bulanan';
        else {
          if (f.talangan && f.orang.some(o => o.lunas)) { toast('Someone has already paid you back'); return; }
          f.talangan = !f.talangan;
          if (f.talangan && !f.orang.length) f.orang.push({ nama: '', nominal: 0 });
        }
        rerender();
        if (b.dataset.opt === 'talangan' && f.talangan) root.querySelector('[data-tn]')?.focus();
      };
    });
    root.querySelectorAll('[data-ulang]').forEach(b => { b.onclick = () => { f.ulang = b.dataset.ulang; rerender(); }; });
    root.querySelectorAll('[data-tn]').forEach(i => { i.addEventListener('input', () => { f.orang[Number(i.dataset.tn)].nama = i.value; }); });
    root.querySelectorAll('[data-ta]').forEach(i => {
      i.addEventListener('input', () => {
        const v = parseAmount(i.value);
        i.value = v ? group(v) : '';
        f.orang[Number(i.dataset.ta)].nominal = v;
        updShare();
      });
    });
    root.querySelectorAll('[data-td]').forEach(b => {
      b.onclick = () => { f.orang.splice(Number(b.dataset.td), 1); if (!f.orang.length) f.talangan = false; rerender(); };
    });
    const add = $('[data-act="tal-add"]');
    if (add) add.onclick = () => { f.orang.push({ nama: '', nominal: 0 }); rerender(); const all = root.querySelectorAll('[data-tn]'); all[all.length - 1]?.focus(); };
    const split = $('[data-act="tal-split"]');
    if (split) split.onclick = () => {
      if (!(f.nominal > 0)) { toast('Enter an amount first'); amt.focus(); return; }
      const open = f.orang.filter(o => !o.lunas);
      const locked = f.orang.filter(o => o.lunas).reduce((s, o) => s + num(o.nominal), 0);
      const each = splitEven(f.nominal - locked, open.length);
      for (const o of open) o.nominal = each;
      rerender();
    };

    $('#when').addEventListener('change', e => {
      const [d, t] = String(e.target.value).split('T');
      if (d) { f.tanggal = d; f.jam = (t || '00:00').slice(0, 5); }
      const l = $('#ulang-l');
      if (l && f.ulang) l.textContent = `${scheduleLabel(scheduleFrom(f.ulang, f.tanggal))} · logged automatically`;
    });

    $('[data-act="save"]').onclick = async () => {
      ctx.userAction?.();
      if (!(f.nominal > 0)) { toast('Enter an amount first'); amt.focus(); return; }
      if (!f.akun || !findAccount(f.akun)) { toast('Choose an account first'); return; }
      if (f.tipe === 'transfer') {
        if (!f.akunTujuan || f.akunTujuan === f.akun) { toast('Choose a different destination account'); return; }
      } else if (!f.sel.kategori) { toast('Choose a category first'); return; }

      // talangan: baris kosong diabaikan
      const useTal = f.tipe === 'keluar' && f.talangan;
      const orang = useTal ? f.orang.filter(o => o.lunas || String(o.nama).trim() || num(o.nominal) > 0) : [];
      if (orang.some(o => !String(o.nama).trim())) { toast('Enter each person\'s name'); return; }
      if (orang.some(o => !(num(o.nominal) > 0))) { toast('Enter how much each person owes'); return; }
      if (orang.reduce((s, o) => s + num(o.nominal), 0) > f.nominal) { toast('Amounts owed exceed the total'); return; }

      const repeat = !f.id && !f.tagihan_id && f.ulang;
      const ruleId = repeat ? crypto.randomUUID() : '';
      const kategori = f.tipe === 'transfer' ? '' : f.sel.kategori;
      const tx = {
        ...(f.original || {}),
        id: f.id || crypto.randomUUID(), tanggal: f.tanggal, jam: f.jam, tipe: f.tipe, nominal: f.nominal,
        kategori, akun: f.akun,
        akun_tujuan: f.tipe === 'transfer' ? f.akunTujuan : '', biaya_admin: f.tipe === 'transfer' ? f.biaya : 0,
        catatan: f.catatan.trim(), tagihan_id: f.tagihan_id, periode: f.periode,
        diubah: nowISO(),
      };
      if (ruleId) tx.berulang_id = ruleId;
      const undo = await withUndo(async () => {
        await saveTx(tx);
        if (orang.length || f.hadDebts) await saveDebts(tx, orang);
        // transaksi ini jadi yang pertama; aturan mulai berlaku sehari setelahnya
        if (ruleId) await saveRule({
          id: ruleId, nama: tx.catatan || kategori || `${accName(tx.akun)} → ${accName(tx.akun_tujuan)}`, tipe: tx.tipe, nominal: tx.nominal,
          kategori, akun: tx.akun, akun_tujuan: tx.akun_tujuan, jadwal: scheduleFrom(f.ulang, f.tanggal), mulai: addDays(f.tanggal, 1),
        });
      });
      try { navigator.vibrate?.(12); } catch {}
      undoToast(ruleId ? 'Saved · repeating' : 'Saved', undo);
      if (ruleId) runAutomations().catch(console.warn); // tanggal mundur: periode yang terlewat langsung dicatat
      ctx.back();
    };

    if (!f.id && !f.nominal) setTimeout(() => amt.focus({ preventScroll: true }), 50);
  },
};

// Pengaturan → Transaksi berulang: dicatat otomatis sesuai jadwal (mekanisme sama dengan admin bulanan).
import { svg } from '../icons.js';
import { esc, rupiah } from '../format.js';
import { todayISO, dayOf } from '../dates.js';
import { activeAccounts, scheduleLabel, parseSchedule, num, OTHER_CATEGORY } from '../model.js';
import { catTile, openSheet, toast, moneyInput, bindMoney, confirmSheet, accName } from '../ui.js';
import { state, saveRule, runAutomations } from '../store.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIPE = [['keluar', 'Expense'], ['masuk', 'Income'], ['transfer', 'Transfer']];

function where(r) {
  if (r.tipe === 'transfer') return `${accName(r.akun)} → ${accName(r.akun_tujuan)}`;
  return r.tipe === 'masuk' ? `into ${accName(r.akun)}` : `from ${accName(r.akun)}`;
}

function openRule(id) {
  const existing = state.berulang.find(x => x.id === id);
  const accs = activeAccounts(state.rekening);
  const today = todayISO();
  const r = existing ? { ...existing } : { nama: '', tipe: 'keluar', nominal: 0, kategori: '', akun: accs[0]?.id || '', akun_tujuan: accs[1]?.id || '', jadwal: `bulanan:${Math.min(28, dayOf(today))}`, mulai: today, aktif: true };
  const p = parseSchedule(r.jadwal) || { kind: 'bulanan', day: 1 };
  const s = { kind: p.kind, day: p.akhir ? 31 : (p.day || 1), dow: p.dow || 1 };
  const kats = () => state.kategori.filter(k => k.tipe === r.tipe && !k.arsip);
  const accOpts = sel => accs.map(a => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.nama)}</option>`).join('');
  const dyn = () => `
    ${r.tipe === 'transfer' ? `<div class="row2">
        <label class="field"><span>From</span><select class="input" name="akun">${accOpts(r.akun)}</select></label>
        <label class="field"><span>To</span><select class="input" name="akun_tujuan">${accOpts(r.akun_tujuan)}</select></label></div>`
      : `<div class="row2">
        <label class="field"><span>Category</span><select class="input" name="kategori">${kats().map(k => `<option ${k.nama === r.kategori ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>
        <label class="field"><span>${r.tipe === 'masuk' ? 'Into' : 'From'}</span><select class="input" name="akun">${accOpts(r.akun)}</select></label></div>`}
    <div><div class="label">Schedule</div>
      <div class="seg"><button type="button" data-kind="bulanan" class="${s.kind === 'bulanan' ? 'on' : ''}">Monthly</button><button type="button" data-kind="mingguan" class="${s.kind === 'mingguan' ? 'on' : ''}">Weekly</button></div>
      <div style="margin-top:10px">${s.kind === 'bulanan'
        ? `<label class="field"><span>Day of month</span><select class="input" name="day">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${s.day === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}<option value="31" ${s.day > 28 ? 'selected' : ''}>Month end</option></select></label>`
        : `<label class="field"><span>Day</span><select class="input" name="dow">${DAYS.map((d, i) => `<option value="${i + 1}" ${s.dow === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select></label>`}</div></div>`;
  openSheet({
    title: existing ? 'Edit recurring' : 'New recurring',
    body: `<form class="stack" id="rf">
      <div class="seg">${TIPE.map(([k, l]) => `<button type="button" data-rt="${k}" class="${r.tipe === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="field"><span>Name</span><input class="input" name="nama" required value="${esc(r.nama)}" placeholder="Salary, rent, gym…" ${existing ? '' : 'autofocus'}></label>
      <label class="field"><span>Amount</span>${moneyInput('nominal', r.nominal)}</label>
      <div id="dyn" class="stack">${dyn()}</div>
      <button class="btn primary big" type="submit">Save</button>
      ${existing ? '<button class="btn danger-text big" type="button" data-act="del">Delete</button>' : ''}
    </form>`,
    onMount(el, close) {
      const money = bindMoney(el.querySelector('[name="nominal"]'));
      const form = el.querySelector('#rf');
      const read = () => { // simpan isian sebelum bagian dinamis digambar ulang
        const fd = new FormData(form);
        for (const k of ['kategori', 'akun', 'akun_tujuan']) if (fd.has(k)) r[k] = String(fd.get(k));
        if (fd.has('day')) s.day = Number(fd.get('day'));
        if (fd.has('dow')) s.dow = Number(fd.get('dow'));
      };
      const redraw = () => { el.querySelector('#dyn').innerHTML = dyn(); bind(); };
      const bind = () => el.querySelectorAll('[data-kind]').forEach(b => { b.onclick = () => { read(); s.kind = b.dataset.kind; redraw(); }; });
      bind();
      el.querySelectorAll('[data-rt]').forEach(b => {
        b.onclick = () => {
          read(); r.tipe = b.dataset.rt; r.kategori = '';
          el.querySelectorAll('[data-rt]').forEach(x => x.classList.toggle('on', x === b));
          redraw();
        };
      });
      form.onsubmit = async e => {
        e.preventDefault();
        read();
        const nama = String(new FormData(form).get('nama')).trim();
        if (!nama || !(money.get() > 0)) { toast('Enter a name and amount'); return; }
        if (!r.akun) { toast('Choose an account first'); return; }
        if (r.tipe === 'transfer' && (!r.akun_tujuan || r.akun_tujuan === r.akun)) { toast('Choose a different destination account'); return; }
        const jadwal = s.kind === 'mingguan' ? `mingguan:${s.dow}` : (s.day > 28 ? 'bulanan:akhir' : `bulanan:${s.day}`);
        await saveRule({
          ...r, nama, nominal: money.get(), jadwal,
          kategori: r.tipe === 'transfer' ? '' : (r.kategori || kats()[0]?.nama || OTHER_CATEGORY),
          akun_tujuan: r.tipe === 'transfer' ? r.akun_tujuan : '',
        });
        close(); toast('Saved');
        runAutomations().catch(console.warn); // kalau jatuh temponya hari ini, langsung dicatat
      };
      const del = el.querySelector('[data-act="del"]');
      if (del) del.onclick = async () => {
        close();
        if (await confirmSheet({ title: `Delete ${r.nama}?`, text: 'It won’t be logged automatically anymore. Past transactions are kept.', ok: 'Delete', danger: true })) {
          await saveRule({ ...existing, aktif: false, dihapus: true }); toast('Deleted');
        }
      };
    },
  });
}

export default {
  live: true,
  render() {
    const list = state.berulang.filter(r => !r.dihapus).sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
    return `
      <div class="top with-back"><button class="icon-btn" data-act="back" aria-label="Back">${svg('back')}</button><h1>Recurring</h1>
        <button class="icon-btn solid" data-act="new" aria-label="New recurring transaction">${svg('plus')}</button></div>
      <p class="muted pad" style="font-size:13px;margin:2px 4px 12px">Logged automatically on schedule. Bills wait until you tap Pay.</p>
      ${list.length ? `<div class="list">${list.map(r => `<div class="li">
        <button class="rule" data-rule="${esc(r.id)}" aria-label="Edit ${esc(r.nama)}">${catTile(r.tipe, r.kategori)}
          <span class="mid"><span class="ttl">${esc(r.nama)}</span><span class="meta">${esc(scheduleLabel(r.jadwal))} · ${esc(where(r))}</span></span>
          <b class="num ${r.tipe === 'masuk' ? 't-income' : r.tipe === 'keluar' ? 't-expense' : 't-transfer'}">${rupiah(r.tipe === 'keluar' ? -num(r.nominal) : num(r.nominal), { sign: r.tipe === 'masuk' })}</b></button>
        <span class="switch"><input type="checkbox" data-on="${esc(r.id)}" ${r.aktif !== false ? 'checked' : ''} aria-label="Enable ${esc(r.nama)}"><i></i></span></div>`).join('')}</div>`
      : '<p class="empty">Nothing yet. Tap + or use Repeat when adding a transaction.</p>'}`;
  },
  bind(root, ctx) {
    root.querySelector('[data-act="back"]').onclick = () => ctx.back();
    root.querySelector('[data-act="new"]').onclick = () => openRule(null);
    root.querySelectorAll('[data-rule]').forEach(b => { b.onclick = () => openRule(b.dataset.rule); });
    root.querySelectorAll('[data-on]').forEach(i => {
      i.onchange = async () => {
        const r = state.berulang.find(x => x.id === i.dataset.on);
        if (!r) return;
        // diaktifkan lagi: mulai dari hari ini, supaya periode selama nonaktif tidak ikut dicatat
        await saveRule({ ...r, aktif: i.checked, ...(i.checked ? { mulai: todayISO() } : {}) });
        if (i.checked) runAutomations().catch(console.warn);
      };
    });
  },
};

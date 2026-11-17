// Cek saldo mingguan: bandingkan saldo okane dengan saldo sebenarnya, lalu sesuaikan yang selisih.
import { esc, rupiah, group, parseAmount } from './format.js';
import { todayISO, addDays, hhmm } from './dates.js';
import { balances, activeAccounts, balanceCheckDue } from './model.js';
import { openSheet, toast, undoToast } from './ui.js';
import { state, saveTx, setMeta, withUndo } from './store.js';

const KEY_OFF = 'bc_off', KEY_SNOOZE = 'bc_snooze';
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

export const balanceCheckEnabled = () => ls.get(KEY_OFF) !== '1';
export const setBalanceCheckEnabled = on => ls.set(KEY_OFF, on ? '0' : '1');

let open = false;

// Dipanggil saat Beranda tampil. Muncul kalau sudah ≥ 7 hari sejak cek terakhir.
export function maybeBalanceCheck() {
  if (open || !state.mode || state.privacy || !balanceCheckEnabled()) return;
  if (document.querySelector('.sheet-wrap, .lock')) return;
  const accs = activeAccounts(state.rekening);
  if (!accs.length) return;
  const today = todayISO();
  const last = state.meta.last_balance_check;
  if (!last) { setMeta('last_balance_check', today); return; } // hitungan 7 hari mulai dari sekarang
  if (!balanceCheckDue(last, today, ls.get(KEY_SNOOZE))) return;
  show(accs, today);
}

function show(accs, today) {
  const bal = balances(state.rekening, state.transaksi);
  const real = new Map(); // id → saldo sebenarnya (hanya yang diisi)
  let all = accs.length <= 3;
  const diffs = () => accs.filter(r => real.has(r.id) && real.get(r.id) !== bal.get(r.id));
  const status = r => {
    if (!real.has(r.id)) return '';
    const d = real.get(r.id) - bal.get(r.id);
    return d === 0 ? '<span class="ok">Matches</span>' : `<span class="warn num">Off by ${rupiah(d, { sign: true, raw: true })}</span>`;
  };
  const rows = () => (all ? accs : accs.slice(0, 3)).map(r => `<div class="bc-row">
      <div class="mid"><b>${esc(r.nama)}</b><span class="num">In okane ${rupiah(bal.get(r.id), { raw: true })}</span></div>
      <div class="bc-in"><div class="money"><input class="input num" data-bc="${esc(r.id)}" inputmode="numeric" autocomplete="off" placeholder="Same" value="${real.has(r.id) ? group(real.get(r.id)) : ''}" aria-label="Actual ${esc(r.nama)} balance"></div>
        <small data-st="${esc(r.id)}">${status(r)}</small></div></div>`).join('')
    + (all ? '' : `<button class="btn ghost" type="button" data-act="more">Show ${accs.length - 3} more accounts</button>`);
  const okLabel = () => { const n = diffs().length; return n ? `Adjust ${n} ${n === 1 ? 'account' : 'accounts'}` : 'All match'; };
  open = true;
  let acted = false;
  openSheet({
    title: 'Weekly balance check',
    body: `<div class="stack"><div id="bc-rows" class="stack">${rows()}</div>
      <div class="row2"><button class="btn ghost" type="button" data-act="later">Later</button><button class="btn primary" type="button" data-act="ok">${okLabel()}</button></div></div>`,
    onMount(el, close) {
      const bind = () => {
        el.querySelectorAll('[data-bc]').forEach(i => {
          i.addEventListener('input', () => {
            const id = i.dataset.bc;
            const digits = i.value.replace(/[^\d]/g, '');
            if (digits === '') real.delete(id); else { const v = parseAmount(digits); real.set(id, v); i.value = group(v) || '0'; }
            el.querySelector(`[data-st="${CSS.escape(id)}"]`).innerHTML = status(accs.find(r => r.id === id));
            el.querySelector('[data-act="ok"]').textContent = okLabel();
          });
        });
        const more = el.querySelector('[data-act="more"]');
        if (more) more.onclick = () => { all = true; el.querySelector('#bc-rows').innerHTML = rows(); bind(); };
      };
      bind();
      el.querySelector('[data-act="later"]').onclick = () => { acted = true; ls.set(KEY_SNOOZE, addDays(today, 2)); close(); };
      el.querySelector('[data-act="ok"]').onclick = async () => {
        acted = true;
        const list = diffs();
        close();
        const jam = hhmm(new Date());
        const undo = await withUndo(async () => {
          for (const r of list) await saveTx({ tanggal: today, jam, tipe: 'penyesuaian', nominal: real.get(r.id) - bal.get(r.id), akun: r.id, catatan: 'Weekly balance check' });
          await setMeta('last_balance_check', today);
        });
        if (list.length) undoToast(`${list.length} ${list.length === 1 ? 'account' : 'accounts'} adjusted`, undo); else toast('All match');
      };
    },
    // ditutup tanpa memilih = tunda 2 hari
    onClose() { open = false; if (!acted) ls.set(KEY_SNOOZE, addDays(today, 2)); },
  });
}

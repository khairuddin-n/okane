import { svg, CATEGORY_ICONS, ICON_KEYS } from '../icons.js';
import { esc, initials, fmtDayMonth } from '../format.js';
import { getPref, setPref } from '../theme.js';
import { tile, syncLabel, openSheet, toast, confirmSheet } from '../ui.js';
import { state, setPrivacy, saveCategory } from '../store.js';
import { COLOR_CHOICES } from '../schema.js';
import { num } from '../model.js';
import * as lock from '../lock.js';
import { balanceCheckEnabled, setBalanceCheckEnabled } from '../balance-check.js';

const APP_VERSION = window.APP_VERSION || 'dev';
let katTab = 'keluar';
let sec = { lock: false, bio: false, bioOk: false }; // status kunci (dibaca async dari IndexedDB)
const loadSec = async () => { sec = { lock: await lock.hasLock(), bio: await lock.hasBio(), bioOk: await lock.bioAvailable() }; };

function lastSyncText() {
  if (!state.lastSync) return 'Never';
  const d = new Date(state.lastSync);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `Last synced ${fmtDayMonth(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function mainView() {
  const pref = getPref();
  const s = syncLabel();
  const privOnOpen = localStorage.getItem('privacyOnOpen') === '1';
  const isGoogle = state.mode === 'google';
  return `
    <div class="top with-back"><button class="icon-btn" data-act="back" aria-label="Back">${svg('back')}</button><h1>Settings</h1></div>
    <div class="acct">
      <span class="av">${esc(initials(state.user?.name || state.user?.email || 'ok'))}</span>
      <div style="flex:1;min-width:0"><div style="font-weight:700;overflow:hidden;text-overflow:ellipsis">${esc(isGoogle ? (state.user?.email || 'Google account') : 'Data on this device')}</div>
        <div style="margin-top:4px"><span class="badge ${s.cls}">${esc(s.text)}</span></div></div>
    </div>

    <div class="group-t">APPEARANCE</div>
    <div class="list">
      <div><div class="li" style="min-height:40px;padding-bottom:0"><span class="mid"><span class="ttl">Theme</span></span></div>
        <div class="themes">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button class="theme-opt ${pref === k ? 'on' : ''}" data-theme-opt="${k}" aria-pressed="${pref === k}"><span class="sw ${k}"></span>${l}</button>`).join('')}</div>
        </div>
    </div>

    <div class="group-t">SECURITY</div>
    <div class="list">
      <label class="li">${svg('lock')}<span class="mid"><span class="ttl">App lock</span></span>
        <span class="switch"><input type="checkbox" data-act="lock" ${sec.lock ? 'checked' : ''} aria-label="App lock"><i></i></span></label>
      ${sec.lock && sec.bioOk ? `<label class="li">${svg('finger')}<span class="mid"><span class="ttl">Fingerprint</span></span>
        <span class="switch"><input type="checkbox" data-act="bio" ${sec.bio ? 'checked' : ''} aria-label="Unlock with fingerprint"><i></i></span></label>` : ''}
      <label class="li">${svg('eyeOff')}<span class="mid"><span class="ttl">Hide amounts on open</span></span>
        <span class="switch"><input type="checkbox" data-act="privOnOpen" ${privOnOpen ? 'checked' : ''} aria-label="Hide amounts on open"><i></i></span></label>
    </div>

    <div class="group-t">DATA</div>
    <div class="list">
      ${isGoogle ? `<button class="li" data-act="sync">${svg('sync')}<span class="mid"><span class="ttl">Sync now</span><span class="meta" style="display:block">${esc(lastSyncText())}</span></span></button>
      <a class="li" href="https://docs.google.com/spreadsheets/d/${esc(state.spreadsheetId || '')}" target="_blank" rel="noopener">${svg('sheet')}<span class="mid"><span class="ttl">Open in Google Sheets</span></span>${svg('chevronRight', 18)}</a>` : ''}
      <a class="li" href="#/pengaturan/kategori">${svg('tag')}<span class="mid"><span class="ttl">Categories</span></span>${svg('chevronRight', 18)}</a>
      <a class="li" href="#/pengaturan/berulang">${svg('repeat')}<span class="mid"><span class="ttl">Recurring transactions</span></span>${svg('chevronRight', 18)}</a>
      <label class="li">${svg('check')}<span class="mid"><span class="ttl">Weekly balance check</span></span>
        <span class="switch"><input type="checkbox" data-act="bc" ${balanceCheckEnabled() ? 'checked' : ''} aria-label="Weekly balance check"><i></i></span></label>
      <button class="li" data-act="csv">${svg('download')}<span class="mid"><span class="ttl">Export CSV</span></span></button>
    </div>

    <p class="privacy-note">${svg('lock', 14)}<span>${isGoogle ? 'Your data lives only in your own Google Drive.' : 'Your data lives only on this device.'} okane has no server, so the developer can’t see it. <a href="./privacy.html" target="_blank" rel="noopener">Privacy</a></span></p>
    <div class="pad" style="margin-top:18px"><button class="btn big" data-act="logout" style="color:var(--expense)">${svg('logout', 18)} Sign out</button></div>
    <div class="version">okane v${esc(APP_VERSION)}</div>`;
}

function katView() {
  const list = state.kategori.filter(k => k.tipe === katTab && !k.arsip).sort((a, b) => num(a.urutan) - num(b.urutan));
  return `
    <div class="top with-back"><button class="icon-btn" data-act="back" aria-label="Back">${svg('back')}</button><h1>Categories</h1>
      <button class="icon-btn solid" data-act="new" aria-label="New category">${svg('plus')}</button></div>
    <div class="pad" style="margin:6px 0 12px"><div class="seg">
      <button data-kt="keluar" class="${katTab === 'keluar' ? 'on' : ''}">Expense</button><button data-kt="masuk" class="${katTab === 'masuk' ? 'on' : ''}">Income</button></div></div>
    <div class="list">${list.map(k => `<button class="li" data-kat="${esc(k.nama)}">${tile(k.ikon, k.warna)}<span class="mid"><span class="ttl">${esc(k.nama)}</span></span>${svg('chevronRight', 18)}</button>`).join('')}</div>`;
}

function openKatEditor(nama) {
  const existing = state.kategori.find(k => k.tipe === katTab && k.nama === nama);
  const k = existing ? { ...existing } : { nama: '', tipe: katTab, ikon: 'rumah', warna: 'biru', arsip: false };
  const picker = () => `
    <div class="icon-grid c-${esc(k.warna)}">${ICON_KEYS.map(i => `<button type="button" data-ic="${i}" class="${k.ikon === i ? 'on' : ''}" aria-label="Icon ${i}" aria-pressed="${k.ikon === i}">${svg(i, 20)}</button>`).join('')}</div>
    <div class="label" style="margin-top:14px">Color</div>
    <div class="colors">${COLOR_CHOICES.map(c => `<button type="button" class="c-${c} ${k.warna === c ? 'on' : ''}" data-col="${c}" aria-label="Color ${c}" aria-pressed="${k.warna === c}">${k.warna === c ? svg('check', 16) : ''}</button>`).join('')}</div>`;
  openSheet({
    title: existing ? 'Edit category' : 'New category',
    body: `<form id="kf" class="stack">
      <div style="display:flex;gap:12px;align-items:center"><span id="kprev">${tile(k.ikon, k.warna, 'lg')}</span>
        <label class="field" style="flex:1"><span>Name</span><input class="input" name="nama" value="${esc(k.nama)}" ${existing ? 'readonly' : 'autofocus'} required></label></div>
      <div><div class="label">Icon</div><div id="pick">${picker()}</div></div>
      <button class="btn primary big" type="submit">Save</button>
      ${existing ? '<button class="btn danger-text big" type="button" data-act="arch">Archive category</button>' : ''}</form>`,
    onMount(el, close) {
      const bindPick = () => {
        el.querySelectorAll('[data-ic]').forEach(b => { b.onclick = () => { k.ikon = b.dataset.ic; refresh(); }; });
        el.querySelectorAll('[data-col]').forEach(b => { b.onclick = () => { k.warna = b.dataset.col; refresh(); }; });
      };
      const refresh = () => { el.querySelector('#pick').innerHTML = picker(); el.querySelector('#kprev').innerHTML = tile(k.ikon, k.warna, 'lg'); bindPick(); };
      bindPick();
      el.querySelector('#kf').onsubmit = async e => {
        e.preventDefault();
        const n = String(new FormData(e.target).get('nama') || '').trim();
        if (!n) return;
        if (!existing) {
          const dup = state.kategori.find(x => x.tipe === katTab && x.nama.toLowerCase() === n.toLowerCase());
          if (dup && !dup.arsip) { toast('That category already exists'); return; }
          if (dup) { await saveCategory({ ...dup, ikon: k.ikon, warna: k.warna, arsip: false }); close(); toast('Category restored'); return; }
        }
        await saveCategory({ ...k, nama: n });
        close(); toast('Category saved');
      };
      const arch = el.querySelector('[data-act="arch"]');
      if (arch) arch.onclick = async () => {
        close();
        if (await confirmSheet({ title: `Archive ${k.nama}?`, text: 'It won’t appear when adding transactions. Past transactions keep this category.', ok: 'Archive', danger: true })) {
          await saveCategory({ ...k, arsip: true }); toast('Category archived');
        }
      };
    },
  });
}

function exportCSV() {
  const cols = ['tanggal', 'jam', 'tipe', 'nominal', 'kategori', 'akun', 'akun_tujuan', 'biaya_admin', 'catatan', 'sumber', 'id'];
  const head = ['date', 'time', 'type', 'amount', 'category', 'account', 'to_account', 'fee', 'note', 'source', 'id'];
  const TYPE = { keluar: 'expense', masuk: 'income', transfer: 'transfer', penyesuaian: 'adjustment', pelunasan: 'repayment' };
  const SRC = { manual: 'manual', otomatis: 'auto' };
  const name = id => state.rekening.find(r => r.id === id)?.nama || id || '';
  const q = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = state.transaksi.filter(t => !t.dihapus).sort((a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam))
    .map(t => cols.map(c => q(c === 'akun' || c === 'akun_tujuan' ? name(t[c]) : c === 'tipe' ? (TYPE[t[c]] || t[c]) : c === 'sumber' ? (SRC[t[c]] || t[c]) : t[c])).join(','));
  const blob = new Blob(['﻿' + [head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `okane-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('CSV downloaded');
}

export default {
  live: true,
  enter() { loadSec().then(() => { if (location.hash.startsWith('#/pengaturan')) window.dispatchEvent(new Event('okane:rerender')); }); },
  render({ params }) { return params.sub === 'kategori' ? katView() : mainView(); },
  bind(root, ctx) {
    root.querySelector('[data-act="back"]').onclick = () => ctx.back();
    if (ctx.params.sub === 'kategori') {
      root.querySelectorAll('[data-kt]').forEach(b => { b.onclick = () => { katTab = b.dataset.kt; ctx.rerender(); }; });
      root.querySelectorAll('[data-kat]').forEach(b => { b.onclick = () => openKatEditor(b.dataset.kat); });
      root.querySelector('[data-act="new"]').onclick = () => openKatEditor(null);
      return;
    }
    root.querySelectorAll('[data-theme-opt]').forEach(b => { b.onclick = () => { setPref(b.dataset.themeOpt); ctx.rerender(); }; });
    root.querySelector('[data-act="privOnOpen"]').onchange = e => {
      try { localStorage.setItem('privacyOnOpen', e.target.checked ? '1' : '0'); } catch {}
      if (e.target.checked) setPrivacy(true);
    };
    root.querySelector('[data-act="csv"]').onclick = exportCSV;
    root.querySelector('[data-act="bc"]').onchange = e => setBalanceCheckEnabled(e.target.checked);
    const refresh = async () => { await loadSec(); ctx.rerender(); };
    root.querySelector('[data-act="lock"]').onchange = async e => {
      if (e.target.checked) {
        const pin = await lock.createPin();
        if (pin) { await lock.setPin(pin); toast('App lock on'); }
      } else { await lock.clearLock(); toast('App lock off'); }
      refresh();
    };
    const bio = root.querySelector('[data-act="bio"]');
    if (bio) bio.onchange = async e => {
      try { if (e.target.checked) await lock.enableBio(); else await lock.disableBio(); } catch { toast('Couldn’t enable fingerprint'); }
      refresh();
    };
    const sync = root.querySelector('[data-act="sync"]');
    if (sync) sync.onclick = () => ctx.syncNow?.({ interactive: true });
    root.querySelector('[data-act="logout"]').onclick = () => ctx.logout?.();
  },
};

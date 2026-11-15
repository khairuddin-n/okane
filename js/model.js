// FUNGSI MURNI: saldo, budget, statistik, admin otomatis, tebak kategori.
// Tidak boleh menyentuh DOM, IndexedDB, atau jaringan. Dites dengan `node --test`.
import { ym, dayOf, daysInMonth, addMonths, addDays, dateIn, diffDays, pad } from './dates.js';
import { CATEGORY_KEYWORDS } from './category-keywords.js';

export const ADMIN_CATEGORY = 'Biaya bank';
export const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const alive = t => t && !t.dihapus;
export const monthRange = m => [`${m}-01`, `${m}-${pad(daysInMonth(m))}`];

// ---------- Saldo ----------

function applyTx(map, t) {
  const n = num(t.nominal);
  const add = (id, v) => { if (id && map.has(id)) map.set(id, map.get(id) + v); };
  switch (t.tipe) {
    case 'masuk': add(t.akun, n); break;
    case 'keluar': add(t.akun, -n); break;
    case 'transfer':
      add(t.akun, -(n + num(t.biaya_admin)));
      add(t.akun_tujuan, n);
      break;
    case 'penyesuaian': add(t.akun, n); break;
  }
}

// Peta id rekening → saldo (semua rekening, termasuk arsip)
export function balances(rekening, transaksi) {
  const map = new Map(rekening.map(r => [r.id, num(r.saldo_awal)]));
  for (const t of transaksi) if (alive(t)) applyTx(map, t);
  return map;
}

export function balanceOf(accountId, rekening, transaksi) {
  return balances(rekening.filter(r => r.id === accountId), transaksi).get(accountId) ?? 0;
}

export function activeAccounts(rekening) {
  return rekening.filter(r => !r.arsip).sort((a, b) => num(a.urutan) - num(b.urutan) || String(a.dibuat).localeCompare(String(b.dibuat)));
}

export function totalBalance(rekening, transaksi) {
  const map = balances(rekening, transaksi);
  return rekening.filter(r => !r.arsip).reduce((s, r) => s + map.get(r.id), 0);
}

// ---------- Statistik ----------

// Item pengeluaran: tipe keluar + biaya_admin transfer (sebagai "Biaya bank").
export function expenseItems(transaksi, from, to) {
  const out = [];
  for (const t of transaksi) {
    if (!alive(t)) continue;
    if (from && t.tanggal < from) continue;
    if (to && t.tanggal > to) continue;
    if (t.tipe === 'keluar') out.push({ tanggal: t.tanggal, kategori: t.kategori || 'Lainnya', nominal: num(t.nominal) });
    else if (t.tipe === 'transfer' && num(t.biaya_admin) > 0) out.push({ tanggal: t.tanggal, kategori: ADMIN_CATEGORY, nominal: num(t.biaya_admin) });
  }
  return out;
}

export const spentIn = (transaksi, from, to) => expenseItems(transaksi, from, to).reduce((s, x) => s + x.nominal, 0);
export const spentInMonth = (transaksi, month) => spentIn(transaksi, ...monthRange(month));

export function incomeInMonth(transaksi, month) {
  const [from, to] = monthRange(month);
  return transaksi.filter(t => alive(t) && t.tipe === 'masuk' && t.tanggal >= from && t.tanggal <= to).reduce((s, t) => s + num(t.nominal), 0);
}

// { kategori: total } untuk bulan tertentu
export function spentByCategory(transaksi, month) {
  const out = {};
  for (const x of expenseItems(transaksi, ...monthRange(month))) out[x.kategori] = (out[x.kategori] || 0) + x.nominal;
  return out;
}

// Array panjang = jumlah hari; index 0 = tanggal 1
export function dailySpending(transaksi, month) {
  const arr = new Array(daysInMonth(month)).fill(0);
  for (const x of expenseItems(transaksi, ...monthRange(month))) arr[dayOf(x.tanggal) - 1] += x.nominal;
  return arr;
}

// n bulan berakhir di endMonth (urut lama → baru)
export function monthlyTotals(transaksi, endMonth, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    out.push({ month: m, total: spentInMonth(transaksi, m) });
  }
  return out;
}

// ---------- Budget ----------

// Batas per kategori untuk bulan tertentu. Bulan tanpa baris memakai bulan terakhir yang ada (carry forward).
export function budgetFor(budget, month) {
  let src = null;
  for (const b of budget) if (b.bulan <= month && (!src || b.bulan > src)) src = b.bulan;
  const out = {};
  if (!src) return out;
  for (const b of budget) if (b.bulan === src && num(b.batas) > 0) out[b.kategori] = num(b.batas);
  return out;
}

export const totalBudget = map => Object.values(map).reduce((s, v) => s + num(v), 0);
export const daysLeftInclToday = today => daysInMonth(ym(today)) - dayOf(today) + 1;
export const safeDaily = (total, spent, today) => Math.max(0, (total - spent) / daysLeftInclToday(today));
export const idealPct = today => dayOf(today) / daysInMonth(ym(today));

// ---------- Saran catatan & tebak kategori ----------

export function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const isManualTx = t => alive(t) && (t.tipe === 'keluar' || t.tipe === 'masuk') && t.sumber !== 'otomatis' && String(t.catatan || '').trim();
const stamp = t => `${t.tanggal} ${t.jam || ''} ${t.dibuat || ''}`;

// Kombinasi (catatan, kategori, akun, nominal) paling sering dalam `days` hari terakhir.
export function frequentEntries(transaksi, days = 60, n = 3, today, tipe) {
  const from = addDays(today, -days);
  const map = new Map();
  for (const t of transaksi) {
    if (!isManualTx(t) || t.tanggal < from || t.tanggal > today) continue;
    if (tipe && t.tipe !== tipe) continue;
    const key = JSON.stringify([normalize(t.catatan), t.kategori, t.akun, num(t.nominal), t.tipe]);
    const cur = map.get(key);
    if (!cur) map.set(key, { count: 1, last: stamp(t), tx: t });
    else { cur.count++; if (stamp(t) > cur.last) { cur.last = stamp(t); cur.tx = t; } }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, n)
    .map(({ tx, count }) => ({ catatan: tx.catatan, kategori: tx.kategori, akun: tx.akun, nominal: num(tx.nominal), tipe: tx.tipe, count }));
}

// Catatan lama yang cocok dengan ketikan (awal catatan atau awal kata)
export function matchNotes(transaksi, query, tipe, n = 3) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const map = new Map();
  for (const t of transaksi) {
    if (!isManualTx(t) || (tipe && t.tipe !== tipe)) continue;
    const c = normalize(t.catatan);
    if (!(c.startsWith(q) || c.includes(' ' + q))) continue;
    const cur = map.get(c);
    if (!cur) map.set(c, { count: 1, last: stamp(t), tx: t, starts: c.startsWith(q) });
    else { cur.count++; if (stamp(t) > cur.last) { cur.last = stamp(t); cur.tx = t; } }
  }
  return [...map.values()]
    .sort((a, b) => (b.starts - a.starts) || b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, n)
    .map(({ tx }) => ({ catatan: tx.catatan, kategori: tx.kategori, akun: tx.akun, nominal: num(tx.nominal), tipe: tx.tipe }));
}

function mostCommon(list, keyFn) {
  const counts = new Map();
  for (const x of list) {
    const k = keyFn(x);
    const c = counts.get(k) || { k, n: 0, last: '' };
    c.n++; if (stamp(x) > c.last) c.last = stamp(x);
    counts.set(k, c);
  }
  let best = null, total = 0;
  for (const c of counts.values()) {
    total += c.n;
    if (!best || c.n > best.n || (c.n === best.n && c.last > best.last)) best = c;
  }
  return best ? { key: best.k, count: best.n, total } : null;
}

// Kecocokan kamus: frasa terpanjang menang.
export function dictionaryMatch(n, tipe, kategori, dict = CATEGORY_KEYWORDS) {
  const active = new Set(kategori.filter(k => k.tipe === tipe && !k.arsip).map(k => k.nama));
  const hay = ` ${n} `;
  const words = n.split(' ');
  let best = null;
  for (const [kat, list] of Object.entries(dict)) {
    if (!active.has(kat)) continue;
    for (const kw of list) {
      const k = normalize(kw);
      if (!k) continue;
      const whole = hay.includes(` ${k} `);
      const prefix = !whole && k.length >= 4 && !k.includes(' ') && words.some(w => w.startsWith(k));
      if (!whole && !prefix) continue;
      const score = k.length + (whole ? 0.5 : 0);
      if (!best || score > best.score) best = { kategori: kat, kata: kw, score, phrase: k };
    }
  }
  return best;
}

/**
 * Tebak kategori dari catatan. Mengembalikan { kategori, alasan, kata?, akun? } atau null.
 * Prioritas: riwayat pengguna → kata yang sering → kamus bawaan.
 */
export function guessCategory(catatan, tipe, transaksi, kategori, dict = CATEGORY_KEYWORDS) {
  if (tipe !== 'keluar' && tipe !== 'masuk') return null;
  const n = normalize(catatan);
  if (!n) return null;
  const active = new Set(kategori.filter(k => k.tipe === tipe && !k.arsip).map(k => k.nama));
  const hist = transaksi.filter(t => isManualTx(t) && t.tipe === tipe && active.has(t.kategori));

  // 1. Riwayat: catatan sama, lalu berawalan sama
  let matches = hist.filter(t => normalize(t.catatan) === n);
  if (!matches.length && n.length >= 3) {
    matches = hist.filter(t => {
      const c = normalize(t.catatan);
      return c.startsWith(n) || (c.length >= 3 && n.startsWith(c + ' '));
    });
  }
  if (matches.length) {
    const top = mostCommon(matches, t => t.kategori);
    const recent = matches.filter(t => t.kategori === top.key).sort((a, b) => stamp(b).localeCompare(stamp(a)))[0];
    return { kategori: top.key, alasan: 'riwayat', akun: recent?.akun || undefined };
  }

  // 2. Kata yang paling sering muncul bersama kategori (≥2 kali, dominan ≥70%)
  const dictHit = dictionaryMatch(n, tipe, kategori, dict);
  const phraseWords = dictHit && dictHit.phrase.includes(' ') ? new Set(dictHit.phrase.split(' ')) : new Set();
  const words = [...new Set(n.split(' ').filter(w => w.length >= 3))].filter(w => !phraseWords.has(w));
  let bestWord = null;
  if (words.length) {
    const tokenized = hist.map(t => ({ t, words: new Set(normalize(t.catatan).split(' ')) }));
    for (const w of words) {
      const withWord = tokenized.filter(x => x.words.has(w)).map(x => x.t);
      if (withWord.length < 2) continue;
      const top = mostCommon(withWord, t => t.kategori);
      if (top.count >= 2 && top.count / top.total >= 0.7 && (!bestWord || top.count > bestWord.count)) {
        bestWord = { kategori: top.key, kata: w, count: top.count };
      }
    }
  }
  if (bestWord) return { kategori: bestWord.kategori, alasan: 'kata', kata: bestWord.kata };

  // 3. Kamus bawaan
  if (dictHit) return { kategori: dictHit.kategori, alasan: 'kamus', kata: dictHit.kata };
  return null;
}

// Status pilihan kategori di layar Catat. Pilihan manual selalu menang.
export function applyGuess(sel, guess) {
  if (sel.manual) return sel;
  if (!guess) return { ...sel, auto: null };
  return { kategori: guess.kategori, manual: false, auto: guess };
}

export function guessLabel(g) {
  if (!g) return '';
  return g.alasan === 'riwayat' ? '✦ Otomatis dari riwayat' : `✦ Otomatis dari "${g.kata}"`;
}

// ---------- Tagihan ----------

export const isActiveBill = b => b.aktif !== false && b.aktif !== 'FALSE';

export function billsForMonth(tagihan, transaksi, month) {
  return tagihan.filter(isActiveBill).map(b => {
    const due = dateIn(month, num(b.tanggal) || 1);
    const pay = transaksi.find(t => alive(t) && t.tagihan_id === b.id && t.periode === month) || null;
    return { ...b, due, lunas: !!pay, pembayaran: pay };
  }).sort((a, b) => a.due.localeCompare(b.due) || String(a.nama).localeCompare(String(b.nama)));
}

export const unpaidTotal = bills => bills.filter(b => !b.lunas).reduce((s, b) => s + num(b.nominal), 0);
export const freeBalance = (total, bills) => total - unpaidTotal(bills);
export const billsDueSoon = (bills, today, days = 3) => bills.filter(b => !b.lunas && diffDays(today, b.due) <= days);

// ---------- Admin otomatis ----------

export function adminDate(jadwal, month) {
  if (jadwal === 'akhir') return dateIn(month, 31);
  const m = /^tgl:(\d{1,2})$/.exec(String(jadwal || ''));
  return m ? dateIn(month, Number(m[1])) : null;
}

const hasAdmin = r => !r.arsip && num(r.admin_nominal) > 0 && adminDate(r.admin_jadwal, '2000-01');
const createdDate = (r, today) => String(r.dibuat || today).slice(0, 10);
export const adminId = (accId, month) => `admin-${accId}-${month}`;

/**
 * Transaksi admin yang sudah jatuh tempo tapi belum tercatat (termasuk catch-up bulan terlewat).
 * Potongan dihitung untuk tanggal setelah rekening dibuat, sampai hari ini.
 * id deterministik `admin-<rekeningId>-<YYYY-MM>` → idempoten.
 */
export function dueAdminCharges(rekening, transaksi, today) {
  const ids = new Set(transaksi.map(t => t.id));
  const out = [];
  const end = ym(today);
  for (const r of rekening) {
    if (!hasAdmin(r)) continue;
    const created = createdDate(r, today);
    for (let m = ym(created); m <= end; m = addMonths(m, 1)) {
      const d = adminDate(r.admin_jadwal, m);
      if (!d || d <= created || d > today) continue;
      const id = adminId(r.id, m);
      if (ids.has(id)) continue;
      out.push({
        id, tanggal: d, jam: '00:00', tipe: 'keluar', nominal: num(r.admin_nominal),
        kategori: r.admin_kategori || ADMIN_CATEGORY, akun: r.id, akun_tujuan: '', biaya_admin: 0,
        catatan: 'Biaya admin bulanan', tagihan_id: '', periode: m, sumber: 'otomatis', dihapus: false,
      });
    }
  }
  return out;
}

// Potongan admin berikutnya (setelah hari ini)
export function nextAdminCharge(r, today) {
  if (!r || num(r.admin_nominal) <= 0 || !adminDate(r.admin_jadwal, '2000-01')) return null;
  const created = createdDate(r, today);
  for (let i = 0; i < 14; i++) {
    const m = addMonths(ym(today), i);
    const d = adminDate(r.admin_jadwal, m);
    if (d > today && d > created) return { tanggal: d, periode: m, nominal: num(r.admin_nominal), kategori: r.admin_kategori || ADMIN_CATEGORY };
  }
  return null;
}

// ---------- Insight ----------

export function categoryReport(transaksi, budget, month) {
  const spent = spentByCategory(transaksi, month);
  const lim = budgetFor(budget, month);
  const names = new Set([...Object.keys(spent), ...Object.keys(lim)]);
  const total = Object.values(spent).reduce((s, v) => s + v, 0);
  return [...names].map(k => {
    const s = spent[k] || 0, b = lim[k] || 0;
    return { kategori: k, spent: s, batas: b, share: total ? s / total : 0, pct: b ? s / b : null };
  }).sort((a, b) => b.spent - a.spent || b.batas - a.batas);
}

export function insights(transaksi, budget, month, today) {
  const cur = ym(today);
  const upto = month === cur ? dayOf(today) : (month < cur ? daysInMonth(month) : 0);
  const perluDirem = categoryReport(transaksi, budget, month)
    .filter(x => x.batas > 0 && x.pct >= 0.9)
    .sort((a, b) => b.pct - a.pct);
  const prev = addMonths(month, -1);
  const thisTotal = upto ? spentIn(transaksi, `${month}-01`, dateIn(month, upto)) : 0;
  const prevTotal = upto ? spentIn(transaksi, `${prev}-01`, dateIn(prev, upto)) : 0;
  const diff = thisTotal - prevTotal;
  return {
    perluDirem,
    banding: { thisTotal, prevTotal, diff, pct: prevTotal > 0 ? diff / prevTotal : null, hemat: diff <= 0, upto, prev },
  };
}

// Urutkan transaksi terbaru dulu
export const byNewest = (a, b) => (b.tanggal + (b.jam || '')).localeCompare(a.tanggal + (a.jam || '')) || String(b.dibuat || '').localeCompare(String(a.dibuat || ''));

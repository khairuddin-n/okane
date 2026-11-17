// FUNGSI MURNI: saldo, budget, statistik, admin otomatis, tebak kategori.
// Tidak boleh menyentuh DOM, IndexedDB, atau jaringan. Dites dengan `node --test`.
import { ym, dayOf, daysInMonth, addMonths, addDays, dateIn, diffDays, pad, parseISO } from './dates.js';
import { CATEGORY_KEYWORDS } from './category-keywords.js';

export const ADMIN_CATEGORY = 'Bank Fees';
export const OTHER_CATEGORY = 'Other';
export const BILL_CATEGORY = 'Utilities';
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
    case 'pelunasan': add(t.akun, n); break; // piutang dikembalikan: saldo naik, bukan pemasukan
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
    if (t.tipe === 'keluar') out.push({ tanggal: t.tanggal, kategori: t.kategori || OTHER_CATEGORY, nominal: num(t.nominal) });
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

// cache normalisasi per objek transaksi (objek diganti saat diubah, jadi aman)
const normCache = new WeakMap();
const normTx = t => { let v = normCache.get(t); if (v === undefined) { v = normalize(t.catatan); normCache.set(t, v); } return v; };
const wordCache = new WeakMap();
const wordsTx = t => { let v = wordCache.get(t); if (!v) { v = new Set(normTx(t).split(' ')); wordCache.set(t, v); } return v; };

const isManualTx = t => alive(t) && (t.tipe === 'keluar' || t.tipe === 'masuk') && t.sumber !== 'otomatis' && String(t.catatan || '').trim();
const stamp = t => `${t.tanggal} ${t.jam || ''} ${t.dibuat || ''}`;

// Kombinasi (catatan, kategori, akun, nominal) paling sering dalam `days` hari terakhir.
export function frequentEntries(transaksi, days = 60, n = 3, today, tipe) {
  const from = addDays(today, -days);
  const map = new Map();
  for (const t of transaksi) {
    if (!isManualTx(t) || t.tanggal < from || t.tanggal > today) continue;
    if (tipe && t.tipe !== tipe) continue;
    const key = JSON.stringify([normTx(t), t.kategori, t.akun, num(t.nominal), t.tipe]);
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
    const c = normTx(t);
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
  let matches = hist.filter(t => normTx(t) === n);
  if (!matches.length && n.length >= 3) {
    matches = hist.filter(t => {
      const c = normTx(t);
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
    for (const w of words) {
      const withWord = hist.filter(t => wordsTx(t).has(w));
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
  return g.alasan === 'riwayat' ? '✦ From history' : `✦ From "${g.kata}"`;
}

// ---------- Tagihan ----------

export const isActiveBill = b => b.aktif !== false && b.aktif !== 'FALSE';

// ---------- Cicilan ----------

export const isInstallment = b => num(b.tenor) > 0;
const monthDiff = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));

/**
 * Progres cicilan: { paid, tenor, done, start }. Dihitung dari periode yang sudah lunas.
 * Periode sebelum tagihan dibuat di okane dianggap sudah dibayar (cicilan yang sudah berjalan).
 */
export function installmentInfo(b, transaksi) {
  if (!isInstallment(b)) return null;
  const tenor = Math.round(num(b.tenor));
  const start = /^\d{4}-\d{2}$/.test(String(b.cicilan_mulai || '')) ? b.cicilan_mulai : '';
  const paid = new Set();
  for (const t of transaksi) if (alive(t) && t.tagihan_id === b.id && t.periode && (!start || t.periode >= start)) paid.add(t.periode);
  let assumed = 0;
  const created = ym(String(b.dibuat || ''));
  if (start && /^\d{4}-\d{2}$/.test(created)) for (let m = start; m < created; m = addMonths(m, 1)) if (!paid.has(m)) assumed++;
  const n = Math.min(tenor, paid.size + assumed);
  return { paid: n, tenor, done: n >= tenor, start };
}

export function billsForMonth(tagihan, transaksi, month) {
  return tagihan.filter(isActiveBill).map(b => {
    const due = dateIn(month, num(b.tanggal) || 1);
    const pay = transaksi.find(t => alive(t) && t.tagihan_id === b.id && t.periode === month) || null;
    return { ...b, due, lunas: !!pay, pembayaran: pay, cicilan: installmentInfo(b, transaksi) };
  }).filter(b => {
    // cicilan: belum mulai → sembunyi; sudah lunas semua → otomatis tidak aktif (kecuali baru dibayar bulan ini)
    if (!b.cicilan) return true;
    if (b.cicilan.start && month < b.cicilan.start) return false;
    return !b.cicilan.done || b.lunas;
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
 * Saldo pada tanggal potong ≤ 0 → tidak dipotong; saldo kurang dari biaya → dipotong sebesar sisa saldo.
 * id deterministik `admin-<rekeningId>-<YYYY-MM>` → idempoten.
 */
export function dueAdminCharges(rekening, transaksi, today) {
  const ids = new Set(transaksi.map(t => t.id));
  const out = [];
  const end = ym(today);
  for (const r of rekening) {
    if (!hasAdmin(r)) continue;
    const created = createdDate(r, today);
    const added = [];
    for (let m = ym(created); m <= end; m = addMonths(m, 1)) {
      const d = adminDate(r.admin_jadwal, m);
      if (!d || d <= created || d > today) continue;
      const id = adminId(r.id, m);
      if (ids.has(id)) continue;
      const upto = transaksi.filter(t => alive(t) && String(t.tanggal) <= d).concat(added);
      const saldo = balances([r], upto).get(r.id);
      if (saldo <= 0) continue;
      const tx = {
        id, tanggal: d, jam: '00:00', tipe: 'keluar', nominal: Math.min(num(r.admin_nominal), saldo),
        kategori: r.admin_kategori || ADMIN_CATEGORY, akun: r.id, akun_tujuan: '', biaya_admin: 0,
        catatan: 'Monthly admin fee', tagihan_id: '', periode: m, sumber: 'otomatis', dihapus: false,
      };
      added.push(tx); out.push(tx);
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

// ---------- Transaksi berulang ----------

// 'bulanan:N' | 'bulanan:akhir' | 'mingguan:1-7' (1 = Senin … 7 = Minggu)
export function parseSchedule(jadwal) {
  const s = String(jadwal || '');
  if (s === 'bulanan:akhir') return { kind: 'bulanan', day: 31, akhir: true };
  let m = /^bulanan:(\d{1,2})$/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) return { kind: 'bulanan', day: Number(m[1]), akhir: false };
  m = /^mingguan:([1-7])$/.exec(s);
  if (m) return { kind: 'mingguan', dow: Number(m[1]) };
  return null;
}

const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ordinal = n => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
export function scheduleLabel(jadwal) {
  const p = parseSchedule(jadwal);
  if (!p) return '';
  if (p.kind === 'mingguan') return `Every ${DOW[p.dow - 1]}`;
  return p.akhir ? 'Monthly, last day' : `Monthly on the ${ordinal(p.day)}`;
}

// Jadwal dari sebuah tanggal: bulanan → tanggal itu, mingguan → hari itu
export function scheduleFrom(kind, iso) {
  if (kind === 'mingguan') return `mingguan:${((parseISO(iso).getDay() + 6) % 7) + 1}`;
  return dayOf(iso) > 28 && dayOf(iso) >= daysInMonth(ym(iso)) ? 'bulanan:akhir' : `bulanan:${dayOf(iso)}`;
}

// Semua jatuh tempo di rentang [from, to]: { tanggal, periode }. Periode bulanan = YYYY-MM, mingguan = tanggalnya.
export function occurrences(jadwal, from, to, max = 600) {
  const p = parseSchedule(jadwal);
  const out = [];
  if (!p || !from || !to || from > to) return out;
  if (p.kind === 'bulanan') {
    for (let m = ym(from); m <= ym(to) && out.length < max; m = addMonths(m, 1)) {
      const d = dateIn(m, p.day);
      if (d >= from && d <= to) out.push({ tanggal: d, periode: m });
    }
    return out;
  }
  const shift = ((p.dow % 7) - parseISO(from).getDay() + 7) % 7;
  for (let d = addDays(from, shift); d <= to && out.length < max; d = addDays(d, 7)) out.push({ tanggal: d, periode: d });
  return out;
}

export const ruleTxId = (ruleId, periode) => `rule-${ruleId}-${periode}`;
const ruleStart = (r, today) => String(r.mulai || r.dibuat || today).slice(0, 10);
const validRule = r => !r.dihapus && isActiveBill(r) && parseSchedule(r.jadwal) && num(r.nominal) > 0 && r.akun && ['keluar', 'masuk', 'transfer'].includes(r.tipe);

/**
 * Transaksi berulang yang sudah jatuh tempo tapi belum tercatat (termasuk catch-up).
 * Mekanisme sama dengan admin otomatis: id deterministik `rule-<id>-<periode>` → idempoten.
 * Kalau `rekening` diberikan, aturan yang rekeningnya sudah diarsipkan/hilang dilewati.
 */
export function dueRecurring(berulang, transaksi, today, rekening) {
  const ids = new Set(transaksi.map(t => t.id));
  const okAcc = rekening ? new Set(rekening.filter(r => !r.arsip).map(r => r.id)) : null;
  const out = [];
  for (const r of berulang) {
    if (!validRule(r)) continue;
    const transfer = r.tipe === 'transfer';
    if (transfer && (!r.akun_tujuan || r.akun_tujuan === r.akun)) continue;
    if (okAcc && (!okAcc.has(r.akun) || (transfer && !okAcc.has(r.akun_tujuan)))) continue;
    for (const o of occurrences(r.jadwal, ruleStart(r, today), today)) {
      const id = ruleTxId(r.id, o.periode);
      if (ids.has(id)) continue;
      out.push({
        id, tanggal: o.tanggal, jam: '00:00', tipe: r.tipe, nominal: num(r.nominal),
        kategori: transfer ? '' : (r.kategori || OTHER_CATEGORY), akun: r.akun, akun_tujuan: transfer ? r.akun_tujuan : '', biaya_admin: 0,
        catatan: r.nama || '', tagihan_id: '', periode: o.periode, sumber: 'otomatis', dihapus: false, berulang_id: r.id,
      });
    }
  }
  return out;
}

// Jatuh tempo berikutnya (setelah hari ini)
export function nextOccurrence(r, today) {
  if (!validRule(r)) return null;
  const start = ruleStart(r, today);
  const from = start > today ? start : addDays(today, 1);
  return occurrences(r.jadwal, from, addDays(from, 62), 1)[0] || null;
}

// ---------- Talangan & piutang ----------

// Piutang yang masih berlaku (+ status lunas). Transaksi asal dihapus → piutang ikut gugur.
// Lunas = punya transaksi pelunasan yang masih ada.
export function liveDebts(piutang, transaksi) {
  const byId = new Map(transaksi.map(t => [t.id, t]));
  const out = [];
  for (const p of piutang || []) {
    if (!p || p.dihapus || num(p.nominal) <= 0) continue;
    if (p.transaksi_id && !alive(byId.get(p.transaksi_id))) continue;
    const pay = p.lunas_transaksi_id ? byId.get(p.lunas_transaksi_id) : null;
    out.push({ ...p, lunas: !!alive(pay) });
  }
  return out;
}
export const openDebts = (piutang, transaksi) => liveDebts(piutang, transaksi).filter(p => !p.lunas)
  .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || String(a.nama).localeCompare(String(b.nama)));
export const debtTotal = list => list.reduce((s, p) => s + num(p.nominal), 0);

/**
 * Transaksi untuk STATISTIK: pengeluaran yang ditalangi hanya dihitung bagianmu
 * (nominal − total piutang transaksi itu). Saldo tetap memakai transaksi asli.
 */
export function applyShares(transaksi, piutang) {
  if (!piutang?.length) return transaksi;
  const sum = new Map();
  for (const p of liveDebts(piutang, transaksi)) if (p.transaksi_id) sum.set(p.transaksi_id, (sum.get(p.transaksi_id) || 0) + num(p.nominal));
  if (!sum.size) return transaksi;
  return transaksi.map(t => (t.tipe === 'keluar' && sum.has(t.id) ? { ...t, nominal: Math.max(0, num(t.nominal) - sum.get(t.id)) } : t));
}

// Nama orang yang pernah dipakai (paling sering dulu)
export function debtNames(piutang) {
  const map = new Map();
  for (const p of piutang || []) {
    const n = String(p?.nama || '').trim();
    if (!n || p.dihapus) continue;
    const k = n.toLowerCase();
    const c = map.get(k) || { nama: n, n: 0, last: '' };
    c.n++; if (String(p.tanggal) >= c.last) { c.last = String(p.tanggal); c.nama = n; }
    map.set(k, c);
  }
  return [...map.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).map(c => c.nama);
}

// Bagi rata antara kamu + n orang: bagian tiap orang (dibulatkan ke bawah, sisanya jadi bagianmu)
export const splitEven = (total, people) => (people > 0 ? Math.floor(num(total) / (people + 1)) : 0);

// ---------- Target tabungan ----------

export function targetProgress(t, rekening, transaksi) {
  const goal = num(t.target_nominal);
  const linked = !!t.rekening_id && rekening.some(r => r.id === t.rekening_id);
  const terkumpul = linked ? Math.max(0, balanceOf(t.rekening_id, rekening, transaksi)) : Math.max(0, num(t.terkumpul_manual));
  return { goal, terkumpul, linked, kurang: Math.max(0, goal - terkumpul), pct: goal > 0 ? terkumpul / goal : 0, done: goal > 0 && terkumpul >= goal };
}

/**
 * Perkiraan target:
 *  - ada target_tanggal → { kind:'tenggat', kurang, perBulan, bulan } (atau kind:'lewat');
 *  - terhubung rekening tanpa tanggal → rata-rata kenaikan 3 bulan penuh terakhir → { kind:'eta', bulan, perBulan };
 *  - data belum cukup / tidak naik → null.
 */
export function targetForecast(t, rekening, transaksi, today) {
  const p = targetProgress(t, rekening, transaksi);
  if (p.goal <= 0 || p.done) return null;
  const cur = ym(today);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(t.target_tanggal || ''))) {
    if (t.target_tanggal < today) return { kind: 'lewat', kurang: p.kurang };
    const months = Math.max(1, monthDiff(cur, ym(t.target_tanggal)));
    return { kind: 'tenggat', kurang: p.kurang, perBulan: Math.ceil(p.kurang / months), bulan: ym(t.target_tanggal) };
  }
  if (!p.linked) return null;
  const r = rekening.find(x => x.id === t.rekening_id);
  const mine = transaksi.filter(x => alive(x) && (x.akun === r.id || x.akun_tujuan === r.id));
  const first = [String(r.dibuat || '').slice(0, 10), ...mine.map(x => String(x.tanggal))].filter(Boolean).sort()[0];
  if (!first || first > `${addMonths(cur, -3)}-01`) return null; // belum punya 3 bulan penuh
  const at = m => balances([r], mine.filter(x => x.tanggal <= monthRange(m)[1])).get(r.id);
  const rise = (at(addMonths(cur, -1)) - at(addMonths(cur, -4))) / 3;
  if (!(rise > 0)) return null;
  return { kind: 'eta', perBulan: Math.round(rise), bulan: addMonths(cur, Math.ceil(p.kurang / rise)) };
}

// ---------- Rekap bulanan & arus kas ----------

export function recap(transaksi, month) {
  const masuk = incomeInMonth(transaksi, month);
  const by = spentByCategory(transaksi, month);
  const keluar = Object.values(by).reduce((s, v) => s + v, 0);
  const top = Object.entries(by).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([kategori, total]) => ({ kategori, total, share: keluar ? total / keluar : 0 }));
  const prev = addMonths(month, -1);
  const prevKeluar = spentInMonth(transaksi, prev);
  const [from, to] = monthRange(month);
  const count = transaksi.filter(t => alive(t) && t.tanggal >= from && t.tanggal <= to).length;
  return {
    month, prev, masuk, keluar, sisa: masuk - keluar, top, prevKeluar, count,
    hemat: prevKeluar > 0 ? (prevKeluar - keluar) / prevKeluar : null, // > 0 = lebih hemat
    tabung: masuk > 0 ? (masuk - keluar) / masuk : null,
  };
}

// n bulan berakhir di endMonth (lama → baru): { month, masuk, keluar }
export function cashflow(transaksi, endMonth, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    out.push({ month: m, masuk: incomeInMonth(transaksi, m), keluar: spentInMonth(transaksi, m) });
  }
  return out;
}

// ---------- Cek saldo mingguan ----------

// Sudah ≥ 7 hari sejak cek terakhir, dan tidak sedang ditunda.
export function balanceCheckDue(last, today, snoozeUntil) {
  if (snoozeUntil && today < snoozeUntil) return false;
  const d = String(last || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return diffDays(d, today) >= 7;
}

// ====================== Analitik (v2) ======================

// Saldo total (rekening aktif) di akhir tiap hari dalam rentang [from, to].
export function balanceSeries(rekening, transaksi, from, to) {
  const active = rekening.filter(r => !r.arsip);
  const zero = () => new Map(active.map(r => [r.id, 0]));
  const delta = new Map(); // tanggal → perubahan total
  let total = active.reduce((s, r) => s + num(r.saldo_awal), 0);
  for (const t of transaksi) {
    if (!alive(t)) continue;
    const m = zero();
    applyTx(m, t);
    let d = 0;
    for (const v of m.values()) d += v;
    if (!d) continue;
    if (t.tanggal <= to) total += d;
    if (t.tanggal > from && t.tanggal <= to) delta.set(t.tanggal, (delta.get(t.tanggal) || 0) + d);
  }
  const out = [];
  for (let day = to; day >= from; day = addDays(day, -1)) {
    out.push({ tanggal: day, total });
    total -= delta.get(day) || 0;
  }
  return out.reverse();
}

// Pengeluaran kumulatif per hari (index 0 = tanggal 1)
export function cumulativeSpending(transaksi, month) {
  let s = 0;
  return dailySpending(transaksi, month).map(v => (s += v));
}

// Perkiraan pengeluaran sampai akhir bulan berjalan, dari laju sejauh ini.
export function forecastMonth(transaksi, month, today) {
  const spent = spentInMonth(transaksi, month);
  const dim = daysInMonth(month);
  if (month !== ym(today)) return { spent, projected: spent, avg: spent / dim, days: dim };
  const d = dayOf(today);
  const avg = spent / d;
  return { spent, projected: Math.round(avg * dim), avg, days: d };
}

export function biggestExpense(transaksi, month) {
  const [from, to] = monthRange(month);
  let best = null;
  for (const t of transaksi) if (alive(t) && t.tipe === 'keluar' && t.tanggal >= from && t.tanggal <= to && (!best || num(t.nominal) > num(best.nominal))) best = t;
  return best;
}

// Catatan yang paling sering muncul bulan ini: [{ catatan, count, total }]
export function topNotes(transaksi, month, n = 3) {
  const [from, to] = monthRange(month);
  const map = new Map();
  for (const t of transaksi) {
    if (!alive(t) || t.tipe !== 'keluar' || t.tanggal < from || t.tanggal > to) continue;
    const k = normalize(t.catatan);
    if (!k) continue;
    const c = map.get(k) || { catatan: t.catatan, count: 0, total: 0 };
    c.count++; c.total += num(t.nominal);
    map.set(k, c);
  }
  return [...map.values()].filter(c => c.count >= 2).sort((a, b) => b.count - a.count || b.total - a.total).slice(0, n);
}

// Rata-rata pengeluaran per hari dalam seminggu (index 0 = Senin). { avg, total, days }
export function weekdayPattern(transaksi, from, to) {
  const out = Array.from({ length: 7 }, () => ({ total: 0, days: 0, avg: 0 }));
  if (!from || !to || from > to) return out;
  const idx = iso => (parseISO(iso).getDay() + 6) % 7;
  for (let d = from; d <= to; d = addDays(d, 1)) out[idx(d)].days++;
  for (const x of expenseItems(transaksi, from, to)) out[idx(x.tanggal)].total += x.nominal;
  for (const o of out) o.avg = o.days ? o.total / o.days : 0;
  return out;
}

// Jumlah hari tanpa pengeluaran sejak awal bulan sampai hari ini (atau sebulan penuh untuk bulan lalu)
export function noSpendDays(transaksi, month, today) {
  const data = dailySpending(transaksi, month);
  const upto = month === ym(today) ? dayOf(today) : (month < ym(today) ? data.length : 0);
  return data.slice(0, upto).filter(v => v <= 0).length;
}

// Berapa hari berturut-turut mencatat (boleh belum mencatat hari ini)
export function logStreak(transaksi, today) {
  const days = new Set();
  for (const t of transaksi) if (alive(t) && t.sumber !== 'otomatis') days.add(t.tanggal);
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

// Kategori yang paling berubah dibanding periode yang sama bulan lalu: [{ kategori, cur, prev, diff }]
export function categoryMovers(transaksi, month, today) {
  const cur = ym(today);
  const upto = month === cur ? dayOf(today) : daysInMonth(month);
  const prevM = addMonths(month, -1);
  const sum = (m) => {
    const o = {};
    for (const x of expenseItems(transaksi, `${m}-01`, dateIn(m, upto))) o[x.kategori] = (o[x.kategori] || 0) + x.nominal;
    return o;
  };
  const a = sum(month), b = sum(prevM);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map(k => ({ kategori: k, cur: a[k] || 0, prev: b[k] || 0, diff: (a[k] || 0) - (b[k] || 0) }))
    // kategori yang belum dipakai bulan ini tidak dibandingkan ("turun 100%" tidak berguna)
    .filter(x => x.prev > 0 && x.cur > 0 && x.diff !== 0)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}

// Rekening yang saldonya di bawah saldo minimum
export function lowBalances(rekening, transaksi) {
  const bal = balances(rekening, transaksi);
  return rekening.filter(r => !r.arsip && num(r.saldo_minimum) > 0 && bal.get(r.id) < num(r.saldo_minimum))
    .map(r => ({ ...r, saldo: bal.get(r.id) }));
}

/**
 * Yang akan datang dalam `days` hari (termasuk hari ini dan tagihan yang sudah lewat tapi belum dibayar):
 * tagihan belum lunas, transaksi berulang, dan admin bulanan. Urut tanggal.
 */
export function upcoming(tagihan, berulang, rekening, transaksi, today, days = 7) {
  const until = addDays(today, days);
  const out = [];
  for (const m of [ym(today), ...(ym(until) !== ym(today) ? [ym(until)] : [])]) {
    for (const b of billsForMonth(tagihan, transaksi, m)) {
      if (b.lunas || b.due > until) continue;
      if (b.due < today && m !== ym(today)) continue;
      out.push({ jenis: 'tagihan', id: b.id, tanggal: b.due, nama: b.nama, nominal: num(b.nominal), tipe: 'keluar', kategori: b.kategori || BILL_CATEGORY, periode: m, lewat: b.due < today });
    }
  }
  const okAcc = new Set(rekening.filter(r => !r.arsip).map(r => r.id));
  for (const r of berulang) {
    if (!okAcc.has(r.akun)) continue;
    const n = nextOccurrence(r, today);
    if (n && n.tanggal <= until) out.push({ jenis: 'berulang', id: r.id, tanggal: n.tanggal, nama: r.nama, nominal: num(r.nominal), tipe: r.tipe, kategori: r.kategori });
  }
  for (const r of rekening) {
    if (r.arsip) continue;
    const n = nextAdminCharge(r, today);
    if (n && n.tanggal <= until) out.push({ jenis: 'admin', id: r.id, tanggal: n.tanggal, nama: `${r.nama} admin fee`, nominal: n.nominal, tipe: 'keluar', kategori: n.kategori });
  }
  return out.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || b.nominal - a.nominal);
}

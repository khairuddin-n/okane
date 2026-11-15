// Cari atau buat spreadsheet "okane – Data" di Drive pengguna (scope drive.file).
import { api, getSpreadsheet, batchGet, batchUpdate, valuesBatchUpdate, append } from './sheets.js';
import { SHEETS, SHEET_BY_NAME, SCHEMA_VERSION, DEFAULT_CATEGORIES, toRow } from './schema.js';
import { nowISO } from './dates.js';

const DRIVE = 'https://www.googleapis.com/drive/v3';
export const FILE_NAME = 'okane – Data';

export async function aboutUser() {
  const r = await api(`${DRIVE}/about?fields=user(emailAddress,displayName)`);
  return { email: r.user?.emailAddress || '', name: r.user?.displayName || '' };
}

export async function findOrCreate() {
  const q = "appProperties has { key='app' and value='okane' } and trashed=false";
  const found = await api(`${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime&spaces=drive`);
  if (found.files?.length) {
    const id = found.files[0].id;
    await ensureStructure(id);
    return { id, created: false };
  }
  const f = await api(`${DRIVE}/files?fields=id`, {
    method: 'POST',
    body: { name: FILE_NAME, mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { app: 'okane' } },
  });
  await ensureStructure(f.id);
  return { id: f.id, created: true };
}

// Pastikan semua sheet, header, Meta, dan kategori default ada. Aman dipanggil berulang.
export async function ensureStructure(id) {
  const meta = await getSpreadsheet(id);
  const existing = meta.sheets.map(s => s.properties);
  const titles = new Set(existing.map(p => p.title));
  const requests = [];
  SHEETS.forEach((s, i) => {
    if (titles.has(s.name)) return;
    if (i === 0 && existing.length === 1 && !SHEET_BY_NAME[existing[0].title]) {
      // ganti nama sheet default ("Sheet1") menjadi Transaksi
      requests.push({ updateSheetProperties: { properties: { sheetId: existing[0].sheetId, title: s.name, gridProperties: { frozenRowCount: 1 } }, fields: 'title,gridProperties.frozenRowCount' } });
    } else {
      requests.push({ addSheet: { properties: { title: s.name, gridProperties: { frozenRowCount: 1, columnCount: Math.max(26, s.cols.length) } } } });
    }
  });
  if (requests.length) await batchUpdate(id, requests);

  const res = await batchGet(id, [...SHEETS.map(s => `${s.name}!1:1`), 'Meta!A2:B', 'Kategori!A2:B']);
  const vr = res.valueRanges;
  const headers = [];
  SHEETS.forEach((s, i) => {
    const hdr = vr[i].values?.[0] || [];
    const isPrefix = s.cols.every((c, j) => hdr[j] === undefined || hdr[j] === '' || hdr[j] === c);
    if (isPrefix && hdr.length < s.cols.length) headers.push({ range: `${s.name}!A1`, values: [s.cols] });
  });
  if (headers.length) await valuesBatchUpdate(id, headers);

  const metaRows = vr[SHEETS.length].values || [];
  const metaMap = Object.fromEntries(metaRows.map(r => [r[0], r[1]]));
  if (!metaMap.schema_version) await append(id, 'Meta', [['schema_version', SCHEMA_VERSION], ['created_at', nowISO()]]);
  const katRows = vr[SHEETS.length + 1].values || [];
  if (!katRows.length) await append(id, 'Kategori', DEFAULT_CATEGORIES.map(k => toRow('kategori', k)));
  await migrate(id, Number(metaMap.schema_version) || SCHEMA_VERSION);
}

// Migrasi berdasarkan schema_version. Tambah kolom/sheet tanpa menghapus data lama.
const MIGRATIONS = {
  // 2: async id => { ... ; return 2 }
};
async function migrate(id, from) {
  let v = from;
  while (v < SCHEMA_VERSION && MIGRATIONS[v + 1]) { await MIGRATIONS[v + 1](id); v++; }
  if (v !== from) {
    const r = await batchGet(id, ['Meta!A:A']);
    const row = (r.valueRanges[0].values || []).findIndex(x => x[0] === 'schema_version') + 1;
    if (row > 0) await valuesBatchUpdate(id, [{ range: `Meta!B${row}`, values: [[v]] }]);
  }
}

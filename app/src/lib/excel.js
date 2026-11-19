// Read .xlsx / .csv into objects keyed by normalized header, and export CSV.
import { readSheet } from 'read-excel-file/browser';

export const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Zero-pad numeric codes that Excel turned into numbers (59 -> "00059"). */
export function padCode(v, len) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '');
  if (/^\d+$/.test(s) && s.length < len) s = s.padStart(len, '0');
  return s;
}
export const cell = (v) => (v === null || v === undefined ? '' : String(v).trim());

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

/** Returns { headers: [normalized], rows: [{normHeader: value}] } — empty rows dropped. */
export async function readTable(file) {
  let grid;
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') grid = parseCsv((await file.text()).replace(/^﻿/, ''));
  else grid = await readSheet(file);
  if (!grid?.length) return { headers: [], rows: [] };
  const headers = grid[0].map(norm);
  const rows = grid.slice(1)
    .filter((r) => r.some((v) => v !== null && v !== undefined && String(v).trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  return { headers, rows };
}

/** First present column among aliases. */
export const pick = (row, aliases) => {
  for (const a of aliases) if (row[a] !== undefined && row[a] !== null && String(row[a]).trim() !== '') return row[a];
  return undefined;
};
export const hasAny = (headers, aliases) => aliases.some((a) => headers.includes(a));

export function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [keys.join(';'), ...rows.map((r) => keys.map((k) => esc(r[k])).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Daftar nominatif honor -> .xlsx in the BPS Berau layout (header block, formulas, terbilang, signatures).
// ExcelJS is loaded only when the admin exports.

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
export function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) return `${terbilang(Math.floor(n / 10))} puluh ${terbilang(n % 10)}`.trim();
  if (n < 200) return `seratus ${terbilang(n - 100)}`.trim();
  if (n < 1000) return `${terbilang(Math.floor(n / 100))} ratus ${terbilang(n % 100)}`.trim();
  if (n < 2000) return `seribu ${terbilang(n - 1000)}`.trim();
  if (n < 1e6) return `${terbilang(Math.floor(n / 1000))} ribu ${terbilang(n % 1000)}`.trim();
  if (n < 1e9) return `${terbilang(Math.floor(n / 1e6))} juta ${terbilang(n % 1e6)}`.trim();
  if (n < 1e12) return `${terbilang(Math.floor(n / 1e9))} miliar ${terbilang(n % 1e9)}`.trim();
  return `${terbilang(Math.floor(n / 1e12))} triliun ${terbilang(n % 1e12)}`.trim();
}
export const terbilangRupiah = (n) => {
  const t = terbilang(n).replace(/\s+/g, ' ');
  return `${(t || 'nol').replace(/\b\w/g, (c) => c.toUpperCase())} Rupiah`;
};
export const bruto = (it) => (Number(it.honor_ob) || 0) * (Number(it.volume) || 0);
export const neto = (it) => bruto(it) - (Number(it.pph21) || 0);
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
export const tanggalPanjang = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};

const THIN = { style: 'thin' };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const NUM = '#,##0;-#,##0;"-"';
const sheetName = (s) => s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet';

function writeSheet(wb, name, k, items, { internal }) {
  const ws = wb.addWorksheet(sheetName(name), {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                 margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', ySplit: 16 }],
  });
  ws.properties.defaultRowHeight = 15;
  const widths = [11, 30, 13, 9, 15, 11, 16, 22, 20];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  if (internal) { ws.getColumn(10).width = 3; ws.getColumn(11).width = 24; ws.getColumn(12).width = 16; ws.getColumn(13).width = 14; ws.getColumn(14).width = 14; }
  const font = { name: 'Calibri', size: 11 };
  const put = (addr, v, extra = {}) => { const c = ws.getCell(addr); c.value = v; c.font = { ...font, ...(extra.font || {}) }; if (extra.alignment) c.alignment = extra.alignment; if (extra.border) c.border = extra.border; if (extra.numFmt) c.numFmt = extra.numFmt; return c; };
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells('A1:I1'); put('A1', 'DAFTAR NOMINATIF', { font: { bold: true }, alignment: center });
  ws.mergeCells('A2:I2'); put('A2', (k.judul || '').toUpperCase(), { font: { bold: true }, alignment: center });
  ws.mergeCells('A3:I3'); put('A3', k.sk || '', { alignment: center });
  [['PROGRAM', k.program], ['KEGIATAN', k.kegiatan], ['KRO', k.kro], ['RO', k.ro], ['KOMPONEN', k.komponen], ['AKUN', k.akun], ['BULAN', k.bulan_label]]
    .forEach(([l, v], i) => { put(`A${5 + i}`, l); ws.mergeCells(`B${5 + i}:I${5 + i}`); put(`B${5 + i}`, `: ${v || ''}`); });

  // table head (rows 13-16)
  [['A', 'No.'], ['B', 'NAMA'], ['H', 'Bank'], ['I', 'No Rekening']].forEach(([c, l]) => { ws.mergeCells(`${c}13:${c}15`); put(`${c}13`, l, { alignment: center }); });
  const heads = { C: ['Honor', 'OB', '(Rp)'], D: ['Volume', '(OB)', ''], E: ['Jumlah', 'bruto', '(Rp)'], F: ['Potongan', 'Pph 21', '(Rp)'], G: ['Jumlah yang', 'diterima', '(Rp)'] };
  Object.entries(heads).forEach(([c, ls]) => ls.forEach((l, i) => put(`${c}${13 + i}`, l, { alignment: center })));
  'ABCDEFGHI'.split('').forEach((c, i) => {
    for (let r = 13; r <= 15; r++) {
      const cell = ws.getCell(`${c}${r}`);
      cell.border = { left: THIN, right: THIN, top: r === 13 ? THIN : undefined, bottom: r === 15 ? THIN : undefined };
    }
    put(`${c}16`, `(${i + 1})`, { alignment: center, border: BOX, font: { italic: true, size: 10 } });
  });
  if (internal) ['PML', 'Korwil', 'Kelompok', 'Layak termin'].forEach((l, i) => put(`${'KLMN'[i]}14`, l, { font: { bold: true } }));

  // rows
  const first = 17;
  items.forEach((it, i) => {
    const r = first + i;
    put(`A${r}`, i + 1, { alignment: { horizontal: 'center' }, border: BOX });
    put(`B${r}`, it.nama, { border: BOX });
    put(`C${r}`, Number(it.honor_ob) || 0, { numFmt: NUM, border: BOX });
    put(`D${r}`, Number(it.volume) || 0, { numFmt: '0.##', alignment: { horizontal: 'center' }, border: BOX });
    put(`E${r}`, { formula: `C${r}*D${r}`, result: bruto(it) }, { numFmt: NUM, border: BOX });
    put(`F${r}`, Number(it.pph21) || 0, { numFmt: NUM, border: BOX });
    put(`G${r}`, { formula: `E${r}-F${r}`, result: neto(it) }, { numFmt: NUM, border: BOX });
    put(`H${r}`, it.bank || '', { border: BOX });
    const nr = put(`I${r}`, it.norek ? String(it.norek) : '', { border: BOX, alignment: { horizontal: 'center' } }); nr.numFmt = '@';
    if (internal) { put(`K${r}`, it.pml || ''); put(`L${r}`, it.korwil || ''); put(`M${r}`, it.kelompok || ''); put(`N${r}`, it.eligible ? 'v' : '', { alignment: { horizontal: 'center' } }); }
  });
  const last = first + Math.max(items.length, 1) - 1;
  const tr = last + 1;
  ws.mergeCells(`A${tr}:C${tr}`); put(`A${tr}`, 'Jumlah', { font: { bold: true }, alignment: center, border: BOX });
  const sum = (c, f) => put(`${c}${tr}`, { formula: `SUM(${c}${first}:${c}${last})`, result: items.reduce((a, it) => a + f(it), 0) }, { font: { bold: true }, numFmt: c === 'D' ? '0.##' : NUM, border: BOX, alignment: c === 'D' ? { horizontal: 'center' } : undefined });
  sum('D', (it) => Number(it.volume) || 0); sum('E', bruto); sum('F', (it) => Number(it.pph21) || 0); sum('G', neto);
  ['H', 'I'].forEach((c) => { ws.getCell(`${c}${tr}`).border = BOX; });

  const total = items.reduce((a, it) => a + neto(it), 0);
  const t = tr + 2;
  put(`A${t}`, 'Terbilang :', { alignment: { vertical: 'middle' } }); ws.mergeCells(`B${t}:I${t}`);
  put(`B${t}`, terbilangRupiah(total), { font: { italic: true, bold: true }, alignment: { horizontal: 'left', vertical: 'middle', wrapText: true } });
  ws.getRow(t).height = 30;

  const d = t + 2;
  ws.mergeCells(`G${d}:H${d}`); put(`G${d}`, `${k.tempat || 'Tanjung Redeb'},`, { alignment: { horizontal: 'right' } });
  put(`I${d}`, tanggalPanjang(k.tanggal));
  const s = d + 2;
  ws.mergeCells(`A${s}:B${s}`); put(`A${s}`, 'Lunas Pada Tanggal,', { alignment: center });
  ws.mergeCells(`G${s}:I${s}`); put(`G${s}`, 'Setuju Dibayar,', { alignment: center });
  ws.mergeCells(`A${s + 1}:B${s + 1}`); put(`A${s + 1}`, 'Bendahara Pengeluaran', { alignment: center });
  ws.mergeCells(`G${s + 1}:I${s + 1}`); put(`G${s + 1}`, 'Pejabat Pembuat Komitmen', { alignment: center });
  ws.mergeCells(`A${s + 2}:B${s + 2}`); put(`A${s + 2}`, 'BPS Kab Berau', { alignment: center });
  ws.mergeCells(`G${s + 2}:I${s + 2}`); put(`G${s + 2}`, 'BPS Kab Berau', { alignment: center });
  const n = s + 7;
  ws.mergeCells(`A${n}:B${n}`); put(`A${n}`, k.bendahara_nama || '', { font: { bold: true, underline: true }, alignment: center });
  ws.mergeCells(`G${n}:I${n}`); put(`G${n}`, k.ppk_nama || '', { font: { bold: true, underline: true }, alignment: center });
  ws.mergeCells(`A${n + 1}:B${n + 1}`); put(`A${n + 1}`, k.bendahara_nip ? `NIP. ${k.bendahara_nip}` : '', { alignment: center });
  ws.mergeCells(`G${n + 1}:I${n + 1}`); put(`G${n + 1}`, k.ppk_nip ? `NIP. ${k.ppk_nip}` : '', { alignment: center });

  ws.pageSetup.printArea = `A1:I${n + 1}`;
  ws.pageSetup.printTitlesRow = '13:16';
  return ws;
}

/**
 * items: [{ nama, honor_ob, volume, pph21, bank, norek, pml, korwil, kelompok, eligible }] in print order.
 * opts: { onlyEligible, byBank, byKelompok }
 */
export async function buildNominatif(k, allItems, opts = {}, ExcelJS = null) {
  ExcelJS = ExcelJS || (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SPKRT 2027 · BPS Kabupaten Berau';
  const items = opts.onlyEligible ? allItems.filter((it) => it.eligible) : allItems;
  writeSheet(wb, 'Master', k, items, { internal: true });
  const groupBy = (list, f) => { const m = new Map(); list.forEach((it) => { const key = f(it) || '(tanpa)'; if (!m.has(key)) m.set(key, []); m.get(key).push(it); }); return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)); };
  const bankShort = (b) => {
    const x = String(b || '').toUpperCase().replace(/^\(\d+\)\s*/, '').replace(/^BANK\s+/, '').trim();
    if (!x) return '(tanpa bank)';
    if (/SYARIAH INDONESIA|^BSI\b/.test(x)) return 'BSI';
    if (/PEMBANGUNAN DAERAH|^BPD\b|KALTIM/.test(x)) return 'BPD';
    if (/TABUNGAN NEGARA|^BTN\b/.test(x)) return 'BTN';
    if (/RAKYAT INDONESIA|^BRI\b/.test(x)) return 'BRI';
    if (/NEGARA INDONESIA|^BNI\b/.test(x)) return 'BNI';
    if (/CENTRAL ASIA|^BCA\b/.test(x)) return 'BCA';
    return x.split(/\s+/)[0];
  };
  const used = new Set(['Master']);
  const uniqueName = (nm) => { let x = sheetName(nm), i = 2; while (used.has(x)) x = sheetName(`${nm} ${i++}`); used.add(x); return x; };
  if (opts.byKelompok) {
    for (const [kel, list] of groupBy(items, (it) => it.kelompok)) {
      if (opts.byBank) for (const [bank, l2] of groupBy(list, (it) => bankShort(it.bank))) writeSheet(wb, uniqueName(`${kel}-${bank}`), k, l2, { internal: false });
      else writeSheet(wb, uniqueName(kel), k, list, { internal: false });
    }
  } else if (opts.byBank) {
    for (const [bank, list] of groupBy(items, (it) => bankShort(it.bank))) writeSheet(wb, uniqueName(bank), k, list, { internal: false });
  }
  return { wb, items };
}

export async function exportNominatif(k, allItems, opts = {}) {
  const { wb, items } = await buildNominatif(k, allItems, opts);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Nominatif - ${(k.judul || 'honor').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { sheets: wb.worksheets.length, rows: items.length };
}

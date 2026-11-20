// Reporting periods (device local time = WITA in Berau).
//  PPL pendataan : 3 periods per month  -> part 1 = 1–10, part 2 = 11–20, part 3 = 21–end
//  PML pengawasan: 1 period per month   -> part 0
// Change the rules here only.
export const PERIOD_RULE = { kunjungan: 'dasarian', pengawasan: 'bulan', surat_tugas: 'bulan' };

export const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
export const BULAN_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

export const lastDay = (y, m) => new Date(y, m, 0).getDate();
export const isMonthly = (kind) => PERIOD_RULE[kind] === 'bulan';

export function currentPeriod(kind = 'kunjungan', d = new Date()) {
  const day = d.getDate();
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    part: isMonthly(kind) ? 0 : day <= 10 ? 1 : day <= 20 ? 2 : 3,
  };
}

/** [first day, last day] of a period as local Date objects. */
export function periodRange({ year, month, part }) {
  if (!part) return [new Date(year, month - 1, 1), new Date(year, month - 1, lastDay(year, month))];
  const start = part === 1 ? 1 : part === 2 ? 11 : 21;
  const end = part === 1 ? 10 : part === 2 ? 20 : lastDay(year, month);
  return [new Date(year, month - 1, start), new Date(year, month - 1, end)];
}

export function shiftPeriod(p, delta) {
  if (!p.part) {
    const d = new Date(p.year, p.month - 1 + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, part: 0 };
  }
  const idx = (p.year * 12 + (p.month - 1)) * 3 + (p.part - 1) + delta;
  const mi = Math.floor(idx / 3);
  return { year: Math.floor(mi / 12), month: (mi % 12) + 1, part: (idx % 3) + 1 };
}

export const cmpPeriod = (a, b) => (a.year - b.year) || (a.month - b.month) || ((a.part || 0) - (b.part || 0));

export function periodTitle(p) {
  return p.part ? `Periode ${p.part} · ${BULAN_FULL[p.month - 1]}` : `${BULAN_FULL[p.month - 1]} ${p.year}`;
}
export function periodRangeLabel(p) {
  const [s, e] = periodRange(p);
  return `${s.getDate()}–${e.getDate()} ${BULAN[p.month - 1]} ${p.year}`;
}
export function periodDeadline(p) {
  const [, e] = periodRange(p);
  return `${HARI[e.getDay()]}, ${e.getDate()} ${BULAN[e.getMonth()]} pukul 23.59`;
}
export function inPeriod(date, p) {
  const [s, e] = periodRange(p);
  const t = new Date(date);
  const end = new Date(e); end.setDate(end.getDate() + 1);
  return t >= s && t < end;
}

/** Period from URL search params (?y=&m=&p=), falling back to the current one. */
export function periodFromParams(sp, kind) {
  const now = currentPeriod(kind);
  if (!sp.get('y')) return now;
  return { year: +sp.get('y'), month: +sp.get('m'), part: isMonthly(kind) ? 0 : +(sp.get('p') || 1) };
}
export const periodQuery = (p) => `y=${p.year}&m=${p.month}${p.part ? `&p=${p.part}` : ''}`;

export const monthLabel = (y, m) => `${BULAN_FULL[m - 1]} ${y}`;

export const fmtDateTime = (v) => v ? new Date(v).toLocaleString('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—';
export const fmtDate = (v) => v ? new Date(v).toLocaleDateString('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric',
}) : '—';

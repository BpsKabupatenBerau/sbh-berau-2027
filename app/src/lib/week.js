// ISO weeks (Monday–Sunday), computed in the device's local time (WITA in Berau).
const DAY = 86400000;
const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;            // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - dow);    // Thursday of this week decides the year
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return { year, week };
}

/** Monday (local date) of a given ISO year/week. */
export function weekStart(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7;
  const mon = new Date(year, 0, 4 - dow + 1);
  mon.setDate(mon.getDate() + (week - 1) * 7);
  return mon;
}

export function weeksInYear(year) {
  return isoWeek(new Date(year, 11, 28)).week; // Dec 28 is always in the last ISO week
}

export function shiftWeek({ year, week }, delta) {
  const d = weekStart(year, week);
  d.setDate(d.getDate() + delta * 7);
  return isoWeek(d);
}

export function cmpWeek(a, b) { return a.year !== b.year ? a.year - b.year : a.week - b.week; }

export function weekRange({ year, week }) {
  const s = weekStart(year, week);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  const left = s.getMonth() === e.getMonth() ? `${s.getDate()}` : `${s.getDate()} ${BULAN[s.getMonth()]}`;
  return `${left}–${e.getDate()} ${BULAN[e.getMonth()]} ${e.getFullYear()}`;
}

export function weekDeadline({ year, week }) {
  const e = weekStart(year, week); e.setDate(e.getDate() + 6);
  return `Minggu, ${e.getDate()} ${BULAN[e.getMonth()]} pukul 23.59`;
}

export const fmtDateTime = (v) => v ? new Date(v).toLocaleString('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—';

export const fmtDate = (v) => v ? new Date(v).toLocaleDateString('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric',
}) : '—';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { signedUrl } from '../lib/uploads';

/* ---------------- icons (inline, no icon font needed) ---------------- */
const P = {
  home: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  check: 'M9 11l3 3L22 4|M21 12v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11',
  clock: 'M12 7v5l3 2|C12,12,9',
  user: 'C12,8,4|M4 21a8 8 0 0 1 16 0',
  users: 'C9,8,3.5|M2 20a7 7 0 0 1 14 0|M16 4a3.5 3.5 0 0 1 0 7|M18 14a6 6 0 0 1 4 6',
  file: 'M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z|M14 2v6h6',
  camera: 'M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z|C12,13,4',
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4|M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  grid: 'M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h7v7h-7z',
  map: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z|C12,9,2.5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z|M9 12l2 2 4-4',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4|M10 17l-5-5 5-5|M5 12h11',
  search: 'C11,11,7|M21 21l-4.5-4.5',
  plus: 'M12 5v14|M5 12h14',
  x: 'M6 6l12 12|M18 6L6 18',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7|M20 4v7h-7',
  wifi: 'M2 9a15 15 0 0 1 20 0|M5 12.5a10 10 0 0 1 14 0|M8.5 16a5 5 0 0 1 7 0|C12,19.5,.8',
  download: 'M12 4v12m0 0l-4-4m4 4l4-4|M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1',
  key: 'C8,15,4|M10.8 12.2L20 3|M17 6l3 3',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  layers: 'M12 3l9 5-9 5-9-5z|M3 13l9 5 9-5',
  alert: 'M12 3l10 18H2z|M12 10v5|C12,18,.6',
  car: 'M5 17h14|M5 17v-5l2-5h10l2 5v5|C7.5,17,1.8|C16.5,17,1.8|M4 12h16',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3|M16 4h3a1 1 0 0 1 1 1v3|M20 16v3a1 1 0 0 1-1 1h-3|M8 20H5a1 1 0 0 1-1-1v-3|M7 12h10',
  inbox: 'M3 13l3-8h12l3 8|M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6|M3 13h5l1 3h6l1-3h5',
  coins: 'C9,8,5|M15 9.5a5 5 0 1 1-5.5 8',
  list: 'M8 6h13|M8 12h13|M8 18h13|C4,6,.8|C4,12,.8|C4,18,.8',
  send: 'M22 2L11 13|M22 2l-7 20-4-9-9-4z',
  menu: 'M4 6h16|M4 12h16|M4 18h16',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z|M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6|M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  login: 'M10 17l5-5-5-5|M15 12H3|M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4',
};
export function Icon({ name, size = 20, className = '' }) {
  const parts = (P[name] || '').split('|');
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {parts.map((d, i) => {
        if (d.startsWith('C')) { const [cx, cy, r] = d.slice(1).split(','); return <circle key={i} cx={cx} cy={cy} r={r} />; }
        return <path key={i} d={d} />;
      })}
    </svg>
  );
}

/* ---------------- status chip ---------------- */
export const STATUS = {
  none:     ['Belum', 'idle'],
  queued:   ['Antri kirim', 'info'],
  pending:  ['Menunggu', 'warn'],
  approved: ['Disetujui', 'ok'],
  rejected: ['Ditolak', 'err'],
  di_kantor: ['Sudah di kantor', 'info'],
};
export function Chip({ status, children }) {
  const [label, tone] = STATUS[status] || [status, 'idle'];
  return <span className={`chip chip-${tone}`}>{children || label}</span>;
}

/* ---------------- basics ---------------- */
export function Button({ variant = 'primary', icon, busy, children, className = '', ...rest }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy ? <Spinner small /> : icon ? <Icon name={icon} size={18} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}
export const Spinner = ({ small }) => <span className={`spin ${small ? 'spin-sm' : ''}`} aria-label="memuat" />;
export const Loading = ({ text = 'Memuat…' }) => <div className="loading"><Spinner /> {text}</div>;
export function Empty({ icon = 'layers', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={34} />
      <b>{title}</b>
      {children && <div>{children}</div>}
    </div>
  );
}
export const Card = ({ className = '', children, ...rest }) => <div className={`card ${className}`} {...rest}>{children}</div>;

export function Progress({ value, total, tone }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return <div className={`progress ${tone ? 'progress-' + tone : ''}`}><i style={{ width: pct + '%' }} /></div>;
}

/* ---------------- modal ---------------- */
export function Modal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    document.body.classList.add('noscroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('noscroll'); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- toast ---------------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, tone = 'dark') => {
    clearTimeout(timer.current);
    setT({ msg, tone, k: Date.now() });
    timer.current = setTimeout(() => setT(null), tone === 'err' ? 4500 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div key={t.k} className={`toast toast-${t.tone}`} role="status">{t.msg}</div>}
    </ToastCtx.Provider>
  );
}

/* ---------------- images from private storage ---------------- */
export function SignedImg({ path, url, alt = '', className = '', onClick }) {
  const [src, setSrc] = useState(url || null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    if (url) { setSrc(url); return; }
    setSrc(null); setErr(false);
    if (path) signedUrl(path).then((u) => { if (!live) return; u ? setSrc(u) : setErr(true); });
    return () => { live = false; };
  }, [path, url]);
  if (path?.endsWith('.pdf')) {
    return <a className={`thumb thumb-pdf ${className}`} href={src || '#'} target="_blank" rel="noreferrer"><Icon name="file" size={28} /><span>PDF</span></a>;
  }
  if (err) return <div className={`thumb thumb-err ${className}`}><Icon name="alert" /></div>;
  if (!src) return <div className={`thumb thumb-load ${className}`} />;
  return <img className={`thumb ${className}`} src={src} alt={alt} loading="lazy" onClick={onClick} />;
}

export function Lightbox({ src, path, caption, onClose }) {
  if (!src && !path) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="icon-btn lb-close" aria-label="Tutup"><Icon name="x" /></button>
      <div onClick={(e) => e.stopPropagation()} className="lb-inner">
        <SignedImg path={path} url={src} className="lb-img" />
        {caption && <div className="lb-cap">{caption}</div>}
      </div>
    </div>
  );
}

/* ---------------- page frame (blue bar on phone, heading on desktop) ---------------- */
export function Page({ title, subtitle, back, actions, children, wide }) {
  return (
    <div className={`page ${wide ? 'page-wide' : ''}`}>
      <header className="page-head">
        {back && <button className="icon-btn back" onClick={back} aria-label="Kembali"><Icon name="left" size={24} /></button>}
        <div className="page-title">
          <h1>{title}</h1>
          {subtitle && <small>{subtitle}</small>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      <div className="page-body">{children}</div>
    </div>
  );
}

export function PeriodPicker({ value, onChange, max, min, label, range }) {
  const eq = (a, b) => a && b && a.year === b.year && a.month === b.month && (a.part || 0) === (b.part || 0);
  const atMax = eq(value, max);
  const atMin = eq(value, min);
  return (
    <div className="weekpick">
      <button className="icon-btn soft" onClick={() => onChange(-1)} disabled={atMin} aria-label="Periode sebelumnya"><Icon name="left" /></button>
      <div className="weekpick-mid"><b>{label}</b><span>{range}</span></div>
      <button className="icon-btn soft" onClick={() => onChange(1)} disabled={atMax} aria-label="Periode berikutnya"><Icon name="right" /></button>
    </div>
  );
}

/** Month stepper used by office pages. value = { year, month } */
export function MonthPicker({ value, onChange, label }) {
  const BULAN_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const step = (d) => { const t = value.year * 12 + value.month - 1 + d; onChange({ year: Math.floor(t / 12), month: (t % 12) + 1 }); };
  return (
    <div className="weekpick monthpick">
      <button className="icon-btn soft" onClick={() => step(-1)} aria-label="Bulan sebelumnya"><Icon name="left" /></button>
      <div className="weekpick-mid"><b>{BULAN_FULL[value.month - 1]} {value.year}</b>{label && <span>{label}</span>}</div>
      <button className="icon-btn soft" onClick={() => step(1)} aria-label="Bulan berikutnya"><Icon name="right" /></button>
    </div>
  );
}

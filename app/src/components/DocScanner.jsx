import { useEffect, useRef, useState } from 'react';
import { Icon, Spinner, useToast } from './ui';
import { loadToCanvas, rotateCanvas, defaultCorners, warpQuad, applyFilter, canvasToBlob, pagesToPdf } from '../lib/scan';
import { fmtSize } from '../lib/media';

/**
 * Multi-page document scanner -> one PDF.
 * Each page: camera photo -> drag 4 corners to the paper edges -> straighten + scan filter.
 * onDone(pdfBlob, pageCount)
 */
export default function DocScanner({ open, onClose, onDone, title = 'Scan dokumen', maxPages = 6, hint }) {
  const toast = useToast();
  const [pages, setPages] = useState([]);        // [{ blob, url, w, h }]
  const [edit, setEdit] = useState(null);        // { canvas, url, corners }
  const [mode, setMode] = useState('doc');
  const [busy, setBusy] = useState('');
  const camRef = useRef(); const galRef = useRef();

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('noscroll');
    return () => document.body.classList.remove('noscroll');
  }, [open]);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line

  if (!open) return null;

  async function onPick(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setBusy('Memuat foto…');
    try {
      const canvas = await loadToCanvas(f);
      await openEditor(canvas);
    } catch { toast('Foto tidak dapat dibaca', 'err'); }
    setBusy('');
  }
  async function openEditor(canvas) {
    const blob = await canvasToBlob(canvas, 0.85);
    if (edit?.url) URL.revokeObjectURL(edit.url);
    setEdit({ canvas, url: URL.createObjectURL(blob), corners: defaultCorners(canvas.width, canvas.height) });
  }
  async function rotate() {
    setBusy('Memutar…');
    await openEditor(rotateCanvas(edit.canvas));
    setBusy('');
  }
  async function savePage() {
    setBusy('Merapikan halaman…');
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint before the heavy loop
    try {
      const out = applyFilter(warpQuad(edit.canvas, edit.corners), mode);
      const blob = await canvasToBlob(out, mode === 'doc' ? 0.72 : 0.8);
      setPages((p) => [...p, { blob, url: URL.createObjectURL(blob), w: out.width, h: out.height }]);
      URL.revokeObjectURL(edit.url);
      setEdit(null);
    } catch (err) { toast(err.message || 'Gagal memproses halaman', 'err'); }
    setBusy('');
  }
  function move(i, d) {
    setPages((p) => { const a = [...p]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  }
  function del(i) { setPages((p) => { URL.revokeObjectURL(p[i].url); return p.filter((_, k) => k !== i); }); }

  async function finish() {
    setBusy('Membuat PDF…');
    try {
      const pdf = await pagesToPdf(pages);
      if (pdf.size > 5 * 1048576) { toast(`PDF terlalu besar (${fmtSize(pdf.size)}). Kurangi halaman.`, 'err'); setBusy(''); return; }
      onDone(pdf, pages.length);
      pages.forEach((p) => URL.revokeObjectURL(p.url));
      setPages([]);
    } catch (err) { toast(err.message || 'Gagal membuat PDF', 'err'); }
    setBusy('');
  }

  function close() {
    if (pages.length && !window.confirm('Buang halaman yang sudah di-scan?')) return;
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    setPages([]); setEdit(null); onClose();
  }

  return (
    <div className="scanner">
      <div className="scan-top">
        <button className="icon-btn" onClick={edit ? () => setEdit(null) : close} aria-label="Kembali"><Icon name={edit ? 'left' : 'x'} size={22} /></button>
        <b>{edit ? `Halaman ${pages.length + 1} · atur sudut` : title}</b>
        <span className="grow" />
        {!edit && <small>{pages.length}/{maxPages}</small>}
      </div>

      {edit ? (
        <>
          <CornerEditor url={edit.url} w={edit.canvas.width} h={edit.canvas.height} corners={edit.corners}
                        onChange={(c) => setEdit((e) => ({ ...e, corners: c }))} />
          <div className="scan-tools">
            <button onClick={rotate}><Icon name="refresh" size={18} /> Putar</button>
            <button onClick={() => setEdit((e) => ({ ...e, corners: defaultCorners(e.canvas.width, e.canvas.height, 0) }))}><Icon name="grid" size={18} /> Penuh</button>
            <button className={mode === 'doc' ? 'on' : ''} onClick={() => setMode('doc')}>Hitam-putih</button>
            <button className={mode === 'color' ? 'on' : ''} onClick={() => setMode('color')}>Warna</button>
          </div>
          <div className="scan-foot">
            <button className="btn btn-ghost" onClick={() => camRef.current.click()}>Foto ulang</button>
            <button className="btn btn-primary" onClick={savePage}>Simpan halaman</button>
          </div>
          <p className="scan-hint">Geser 4 titik biru ke sudut kertas.</p>
        </>
      ) : (
        <>
          <div className="scan-body">
            {hint && <div className="alert alert-info">{hint}</div>}
            {pages.length === 0 ? (
              <div className="scan-empty">
                <Icon name="file" size={44} />
                <b>Belum ada halaman</b>
                <span>Foto setiap halaman di tempat terang, kertas di permukaan gelap/polos.</span>
              </div>
            ) : (
              <div className="scan-pages">
                {pages.map((p, i) => (
                  <div key={p.url} className="scan-page">
                    <img src={p.url} alt={`Halaman ${i + 1}`} />
                    <span className="pg-no">{i + 1}</span>
                    <div className="pg-act">
                      <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Geser kiri"><Icon name="left" size={16} /></button>
                      <button onClick={() => del(i)} aria-label="Hapus"><Icon name="x" size={16} /></button>
                      <button onClick={() => move(i, 1)} disabled={i === pages.length - 1} aria-label="Geser kanan"><Icon name="right" size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="scan-foot">
            {pages.length < maxPages && (
              <>
                <button className="btn btn-ghost" onClick={() => galRef.current.click()} title="Dari galeri"><Icon name="upload" size={18} /></button>
                <button className="btn btn-ghost grow" onClick={() => camRef.current.click()}><Icon name="camera" size={18} /> <span>{pages.length ? 'Tambah halaman' : 'Foto halaman 1'}</span></button>
              </>
            )}
            <button className="btn btn-primary grow" disabled={!pages.length} onClick={finish}>Selesai ({pages.length})</button>
          </div>
        </>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={onPick} />
      {busy && <div className="scan-busy"><Spinner /> {busy}</div>}
    </div>
  );
}

/** Image with 4 draggable corner handles. Corners are in source-image pixels. */
function CornerEditor({ url, w, h, corners, onChange }) {
  const wrap = useRef(); const drag = useRef(-1);
  const [box, setBox] = useState(null);

  const measure = () => { const r = wrap.current?.querySelector('img')?.getBoundingClientRect(); if (r) setBox(r); };
  useEffect(() => { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, []);

  const k = box ? box.width / w : 1;
  const toImg = (e) => {
    const r = wrap.current.querySelector('img').getBoundingClientRect();
    const x = Math.max(0, Math.min(w, (e.clientX - r.left) / (r.width / w)));
    const y = Math.max(0, Math.min(h, (e.clientY - r.top) / (r.height / h)));
    return { x, y };
  };
  const down = (i) => (e) => { e.preventDefault(); drag.current = i; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => {
    if (drag.current < 0) return;
    const p = toImg(e);
    onChange(corners.map((c, j) => (j === drag.current ? p : c)));
  };
  const up = () => { drag.current = -1; };
  const pts = corners.map((c) => `${c.x * k},${c.y * k}`).join(' ');

  return (
    <div className="corner-wrap" ref={wrap}>
      <div className="corner-stage">
        <img src={url} alt="" onLoad={measure} draggable={false} />
        {box && (
          <svg className="corner-svg" width={box.width} height={box.height} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <polygon points={pts} />
            {corners.map((c, i) => (
              <circle key={i} cx={c.x * k} cy={c.y * k} r="15" onPointerDown={down(i)} />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

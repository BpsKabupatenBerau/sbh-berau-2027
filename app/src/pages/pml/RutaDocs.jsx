import { useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { ymNow, monthLabel, triwulanOf, TRIWULAN, fmtDateTime } from '../../lib/period';
import { submitUpload, onQueueChange } from '../../lib/uploads';
import { Page, Card, Chip, Button, Icon, Loading, Empty, Modal, useToast } from '../../components/ui';
import DocScanner from '../../components/DocScanner';
import { loadMyRuta } from '../ppl/data';

const CFG = {
  bl: { title: 'BL', subtitle: 'Buku Lanjutan per ruta — bulanan', mode: 'bulan', hint: 'Unggah BL tiap ruta untuk bulan ini.' },
  hr: { title: 'HR', subtitle: 'Dokumen HR per ruta — triwulanan', mode: 'triwulan', hint: 'Unggah HR tiap ruta untuk triwulan ini.' },
};

// PML uploads a document (scan or file) per ruta: BL every month, HR every quarter.
export default function RutaDocs({ kind }) {
  const cfg = CFG[kind];
  const { uid } = useAuth();
  const toast = useToast();
  const now = ymNow();
  const nowTw = triwulanOf(now.month);
  const HR_MONTHS = [3, 6, 9, 12];                 // HR only collected at each quarter-end
  const hrOpen = kind !== 'hr' || HR_MONTHS.includes(now.month);
  const [per, setPer] = useState(kind === 'bl' ? { year: now.year, month: now.month } : { year: now.year, tw: nowTw });
  const [ruta, setRuta] = useState(null);
  const [ups, setUps] = useState({});
  const [sel, setSel] = useState(null);     // selected ruta
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);

  const pArgs = kind === 'bl' ? { year: per.year, month: per.month } : { year: per.year, part: per.tw };

  async function load() {
    setRuta(null);
    try {
      const { ruta: rs } = await loadMyRuta();
      let q = supabase.from('uploads').select('id, ruta_id, status, file_path, updated_at, review_note')
        .eq('kind', kind).eq('user_id', uid).eq('period_year', pArgs.year);
      q = kind === 'bl' ? q.eq('period_month', pArgs.month) : q.eq('period_part', pArgs.part);
      const { data, error } = await q;
      if (error) throw error;
      setRuta(rs); setUps(Object.fromEntries((data || []).map((u) => [u.ruta_id, u])));
    } catch (e) { toast(errMsg(e), 'err'); setRuta([]); setUps({}); }
  }
  useEffect(() => { load(); return onQueueChange(load); }, [pArgs.year, pArgs.month, pArgs.part]); // eslint-disable-line

  const groups = useMemo(() => {
    const g = {};
    (ruta || []).forEach((r) => { (g[r.nks] ||= { info: r.info, list: [] }).list.push(r); });
    return Object.entries(g);
  }, [ruta]);
  const done = ruta ? ruta.filter((r) => ups[r.id]).length : 0;

  // period bar (month for BL, quarter for HR), capped at now
  const atMax = kind === 'bl' ? (per.year === now.year && per.month === now.month) : (per.year === now.year && per.tw === nowTw);
  function step(d) {
    if (kind === 'bl') { const t = per.year * 12 + per.month - 1 + d; const n = { year: Math.floor(t / 12), month: (t % 12) + 1 }; if (n.year * 12 + n.month <= now.year * 12 + now.month) setPer(n); }
    else { const t = per.year * 4 + per.tw - 1 + d; const n = { year: Math.floor(t / 4), tw: (t % 4) + 1 }; if (n.year * 4 + n.tw <= now.year * 4 + nowTw) setPer(n); }
  }
  const periodLabel = kind === 'bl' ? monthLabel(per.year, per.month) : `Triwulan ${TRIWULAN[per.tw - 1]} ${per.year}`;

  async function send(blob, mime) {
    setBusy(true);
    try {
      const r = await submitUpload({ uid, kind, blob, mime,
        meta: { ruta_id: sel.id, nks: sel.nks, no_urut: sel.no_urut, label: `${cfg.title} ruta ${sel.no_urut}`, ...pArgs } });
      toast(r.queued ? 'Tidak ada sinyal — dikirim otomatis nanti' : 'Terkirim — menunggu verifikasi', r.queued ? 'dark' : 'ok');
      setSel(null); load();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }
  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const isPdf = f.type === 'application/pdf';
    if (!isPdf && !f.type.startsWith('image/')) return toast('Pilih PDF atau foto', 'err');
    if (f.size > 5 * 1048576) return toast('Berkas maksimal 5 MB', 'err');
    send(f, isPdf ? 'application/pdf' : f.type);
  }

  const cur = sel && ups[sel.id];
  const locked = cur?.status === 'approved' || cur?.status === 'di_kantor';

  return (
    <Page title={cfg.title} subtitle={ruta ? `${done} dari ${ruta.length} ruta sudah unggah` : cfg.subtitle}>
      <div className="weekpick monthpick">
        <button className="icon-btn soft" onClick={() => step(-1)} disabled={kind === 'hr'} aria-label="Sebelumnya"><Icon name="left" /></button>
        <div className="weekpick-mid"><b>{periodLabel}</b><span>{kind === 'bl' ? '1 BL per ruta per bulan' : '1 HR per ruta per triwulan'}</span></div>
        <button className="icon-btn soft" onClick={() => step(1)} disabled={kind === 'hr' || atMax} aria-label="Berikutnya"><Icon name="right" /></button>
      </div>

      {!hrOpen ? (
        <Empty icon="inbox" title="HR belum dibuka">HR hanya dibuka tiap akhir triwulan: <b>Maret, Juni, September, Desember</b>. Silakan kembali pada bulan tersebut.</Empty>
      ) : !ruta ? <Loading /> : !ruta.length ? (
        <Empty icon="map" title="Belum ada ruta">Hubungi admin untuk penugasan sampel.</Empty>
      ) : groups.map(([nks, g]) => (
        <div key={nks}>
          {groups.length > 1 && <h2 className="sec">NKS {nks} · {g.info?.desa}</h2>}
          <Card className="list">
            {g.list.map((r, i) => {
              const u = ups[r.id];
              return (
                <button key={r.id} className="row" onClick={() => setSel(r)}>
                  <span className={`num num-${u?.status || 'none'}`}>{(u?.status === 'approved' || u?.status === 'di_kantor') ? '✓' : String(i + 1).padStart(2, '0')}</span>
                  <span className="row-tx"><b>{r.nama_krt || '(tanpa nama)'}</b><small>No. sampel {r.no_urut}</small></span>
                  <Chip status={u?.status || 'none'} />
                  <Icon name="right" className="row-arw" />
                </button>
              );
            })}
          </Card>
        </div>
      ))}
      <p className="hint center">{cfg.hint}</p>

      <Modal open={!!sel} title={sel ? `${cfg.title} · Ruta ${sel.no_urut}` : ''} onClose={() => setSel(null)}>
        {sel && (
          <div className="form">
            <div className="kv"><span>Nama KRT</span><b>{sel.nama_krt || '—'}</b></div>
            <div className="kv"><span>Periode</span><b>{periodLabel}</b></div>
            <div className="kv"><span>Status</span><b><Chip status={cur?.status || 'none'} /></b></div>
            {cur && <div className="kv"><span>Diunggah</span><b>{fmtDateTime(cur.updated_at)}</b></div>}
            {cur?.status === 'rejected' && <div className="alert alert-err" style={{ margin: 0 }}><Icon name="alert" /><span><b>Ditolak:</b> {cur.review_note}</span></div>}
            {cur && <a className="linkish" href="#" onClick={(e) => { e.preventDefault(); openCur(cur); }}><Icon name="file" size={16} /> Buka berkas terunggah</a>}
            {locked ? (
              <div className="alert alert-ok" style={{ margin: 0 }}><Icon name="shield" /><span>Sudah <b>disetujui</b>, tidak dapat diganti.</span></div>
            ) : (
              <div className="two-act">
                <button className="drop" onClick={() => setScan(true)}><Icon name="scan" size={30} /><b>Scan dokumen</b><small>Kamera / galeri → PDF</small></button>
                <label className="drop"><Icon name="upload" size={30} /><b>Pilih berkas</b><small>PDF atau foto</small>
                  <input type="file" accept="image/*,application/pdf" hidden onChange={onFile} disabled={busy} /></label>
              </div>
            )}
          </div>
        )}
      </Modal>

      <DocScanner open={scan} onClose={() => setScan(false)} title={`Scan ${cfg.title}`} maxPages={10}
        hint="Foto/scan tiap halaman. Dari galeri bisa pilih banyak sekaligus."
        onDone={(blob) => { setScan(false); send(blob, 'application/pdf'); }} />
    </Page>
  );

  async function openCur(u) {
    const w = window.open('', '_blank');
    const { data } = await supabase.storage.from('uploads').createSignedUrl(u.file_path, 3600);
    if (data?.signedUrl) { if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl; }
    else { w?.close(); toast('Berkas tidak bisa dibuka', 'err'); }
  }
}

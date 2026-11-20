import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { BULAN, monthLabel, fmtDateTime, fmtDate } from '../../lib/period';
import { compressImage, fmtSize } from '../../lib/media';
import { submitUpload, queuedFor, onQueueChange } from '../../lib/uploads';
import { Page, Card, Chip, Button, Icon, Loading, Empty, SignedImg, Lightbox, useToast } from '../../components/ui';
import DocScanner from '../../components/DocScanner';

// Surat tugas per month. Admin issues a nomor per petugas per month; the petugas scans & uploads the signed copy.
export default function SuratTugas() {
  const { uid, profile } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState(null);       // [{ tahun, bulan, nomor, tanggal, upload, queued }]
  const [pick, setPick] = useState(null);       // { blob, mime, url, name, pages }
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);

  async function load() {
    const [{ data: nos, error }, { data: ups }, q] = await Promise.all([
      supabase.from('surat_tugas_nomor').select('*').eq('user_id', uid).order('tahun', { ascending: false }).order('bulan', { ascending: false }),
      supabase.from('uploads').select('*').eq('kind', 'surat_tugas').eq('user_id', uid),
      queuedFor(uid),
    ]);
    if (error) { toast(errMsg(error), 'err'); setRows([]); return; }
    const byKey = Object.fromEntries((ups || []).map((u) => [`${u.period_year}-${u.period_month}`, u]));
    setRows((nos || []).map((n) => ({
      ...n, upload: byKey[`${n.tahun}-${n.bulan}`] || null,
      queued: q.some((j) => j.kind === 'surat_tugas' && j.args.p_year === n.tahun && j.args.p_month === n.bulan),
    })));
  }
  useEffect(() => { load(); return onQueueChange(load); }, []); // eslint-disable-line

  const sel = rows && (rows.find((r) => `${r.tahun}-${r.bulan}` === sp.get('b')) || rows[0]);
  const choose = (r) => { setPick(null); setSp({ b: `${r.tahun}-${r.bulan}` }, { replace: true }); };

  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.type === 'application/pdf') {
      if (f.size > 5 * 1048576) return toast('PDF maksimal 5 MB', 'err');
      setPick({ blob: f, mime: 'application/pdf', url: null, name: f.name, size: f.size });
      return;
    }
    if (!f.type.startsWith('image/')) return toast('Gunakan foto atau PDF', 'err');
    setBusy(true);
    try {
      const blob = await compressImage(f);
      setPick({ blob, mime: 'image/jpeg', url: URL.createObjectURL(blob), name: f.name, size: blob.size });
    } catch { toast('Foto tidak dapat dibaca', 'err'); }
    setBusy(false);
  }

  async function send() {
    setBusy(true);
    try {
      const r = await submitUpload({
        uid, kind: 'surat_tugas', blob: pick.blob, mime: pick.mime,
        meta: { year: sel.tahun, month: sel.bulan, label: `Surat tugas ${monthLabel(sel.tahun, sel.bulan)}` },
      });
      toast(r.queued ? 'Tidak ada sinyal — dikirim otomatis nanti' : 'Surat tugas terkirim', r.queued ? 'dark' : 'ok');
      setPick(null); load();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }

  const back = () => nav('/');
  if (!rows) return <Page title="Surat Tugas" back={back}><Loading /></Page>;

  return (
    <Page title="Surat Tugas" subtitle={`${profile.role.toUpperCase()} · ${profile.full_name || profile.username}`} back={back}>
      {!rows.length ? (
        <Empty icon="file" title="Belum ada nomor surat tugas">Admin belum menginput nomor surat tugas untuk Anda. Surat tugas bisa diunggah setelah nomornya ada.</Empty>
      ) : (
        <>
          <div className="mchips">
            {rows.map((r) => (
              <button key={`${r.tahun}-${r.bulan}`} className={`mchip ${r === sel ? 'on' : ''}`} onClick={() => choose(r)}>
                <b>{BULAN[r.bulan - 1]} {r.tahun}</b>
                <Chip status={r.queued ? 'queued' : r.upload?.status || 'none'} />
              </button>
            ))}
          </div>

          <Card className="pad">
            <div className="kv"><span>Bulan</span><b>{monthLabel(sel.tahun, sel.bulan)}</b></div>
            <div className="kv"><span>Status</span><b><Chip status={sel.queued ? 'queued' : sel.upload?.status || 'none'} /></b></div>
            {sel.tanggal && <div className="kv"><span>Tanggal surat</span><b>{fmtDate(sel.tanggal)}</b></div>}
            {sel.upload && <div className="kv"><span>Diunggah</span><b>{fmtDateTime(sel.upload.updated_at)}</b></div>}
          </Card>
          <p className="hint">Nomor surat tugas bulan ini:</p>
          <div className="nomor">{sel.nomor}</div>

          {sel.upload?.status === 'rejected' && <div className="alert alert-err mt"><Icon name="alert" /><span><b>Ditolak:</b> {sel.upload.review_note}</span></div>}

          {sel.upload && !pick && (
            <>
              <h2 className="sec">Berkas terkirim</h2>
              {sel.upload.file_path.endsWith('.pdf')
                ? <Card className="pad file-pick"><SignedImg path={sel.upload.file_path} className="row-thumb" /><span>Surat tugas (PDF)<small>Ketuk untuk membuka</small></span></Card>
                : <div className="photo" onClick={() => setZoom(true)}><SignedImg path={sel.upload.file_path} className="photo-img" /></div>}
              {zoom && <Lightbox path={sel.upload.file_path} onClose={() => setZoom(false)} />}
            </>
          )}

          {sel.upload?.status === 'approved' ? (
            <div className="alert alert-ok mt"><Icon name="shield" /><span>Surat tugas bulan ini sudah <b>disetujui</b>.</span></div>
          ) : pick ? (
            <>
              <h2 className="sec">Berkas baru</h2>
              {pick.url ? <div className="photo"><img src={pick.url} className="photo-img" alt="" /></div>
                        : <Card className="pad file-pick"><Icon name="file" size={28} /><span>{pick.name}<small>{pick.pages ? `${pick.pages} halaman · ` : ''}{fmtSize(pick.size)}</small></span></Card>}
              <div className="btn-row mt">
                <Button variant="ghost" onClick={() => setPick(null)}>Batal</Button>
                <Button busy={busy} icon="upload" onClick={send}>{sel.upload ? 'Kirim & ganti' : 'Kirim'}</Button>
              </div>
            </>
          ) : (
            <div className="two-act mt">
              <button className="drop" onClick={() => setScan(true)}>
                <Icon name="scan" size={34} /><b>Scan dokumen</b><small>Kamera, 1–6 halaman → PDF</small>
              </button>
              <label className="drop">
                <Icon name="upload" size={34} /><b>Pilih berkas</b><small>PDF atau foto</small>
                <input type="file" accept="image/*,application/pdf" onChange={onFile} hidden />
              </label>
            </div>
          )}
          {busy && !pick && <Loading text="Memproses…" />}
        </>
      )}

      <DocScanner open={scan} onClose={() => setScan(false)} title={`Surat tugas ${sel ? monthLabel(sel.tahun, sel.bulan) : ''}`}
        hint="Foto setiap halaman surat tugas (biasanya 2–4 halaman), lalu tekan Selesai."
        onDone={(blob, n) => { setScan(false); setPick({ blob, mime: 'application/pdf', url: null, name: `Surat tugas ${sel ? monthLabel(sel.tahun, sel.bulan) : ''}.pdf`, size: blob.size, pages: n }); }} />
    </Page>
  );
}

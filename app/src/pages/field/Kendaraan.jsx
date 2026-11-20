import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { fmtDate, fmtDateTime } from '../../lib/period';
import { compressImage, getPosition, fmtSize } from '../../lib/media';
import { submitUpload, onQueueChange } from '../../lib/uploads';
import { Page, Card, Chip, Button, Icon, Loading, SignedImg, Lightbox, useToast } from '../../components/ui';
import DocScanner from '../../components/DocScanner';
import { loadVehicle } from '../ppl/data';

const JENIS = ['Motor', 'Mobil'];

// STNK + photo of the vehicle used in the field (one each), verified by admin.
export default function Kendaraan() {
  const { uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [v, setV] = useState(null);
  const [form, setForm] = useState({ nomor_polisi: '', jenis: 'Motor', berlaku: '' });
  const [pick, setPick] = useState({});      // { stnk: {...}, kendaraan: {...} }
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState('');
  const [zoom, setZoom] = useState(null);

  async function load() {
    const x = await loadVehicle(uid);
    setV(x);
    const m = x.stnk?.meta || x.kendaraan?.meta;
    if (m) setForm((f) => (f.nomor_polisi ? f : { nomor_polisi: m.nomor_polisi || '', jenis: m.jenis || 'Motor', berlaku: m.berlaku || '' }));
  }
  useEffect(() => { load(); return onQueueChange(load); }, []); // eslint-disable-line

  const extra = () => ({ nomor_polisi: form.nomor_polisi.trim().toUpperCase().replace(/\s+/g, ' '), jenis: form.jenis, berlaku: form.berlaku || null });

  async function onFile(kind, e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.type === 'application/pdf') {
      if (kind !== 'stnk') return toast('Foto kendaraan harus berupa foto', 'err');
      if (f.size > 5 * 1048576) return toast('PDF maksimal 5 MB', 'err');
      setPick((p) => ({ ...p, [kind]: { blob: f, mime: 'application/pdf', name: f.name, size: f.size } }));
      return;
    }
    try {
      const blob = await compressImage(f);
      setPick((p) => ({ ...p, [kind]: { blob, mime: 'image/jpeg', url: URL.createObjectURL(blob), size: blob.size } }));
    } catch { toast('Foto tidak dapat dibaca', 'err'); }
  }

  async function send(kind) {
    if (!form.nomor_polisi.trim()) return toast('Isi nomor polisi dulu', 'err');
    if (kind === 'stnk' && !form.berlaku) return toast('Isi masa berlaku STNK', 'err');
    setBusy(kind);
    try {
      const gps = kind === 'kendaraan' ? await getPosition(8000) : null;
      const r = await submitUpload({
        uid, kind, blob: pick[kind].blob, mime: pick[kind].mime,
        meta: { lat: gps?.lat, lng: gps?.lng, acc: gps?.acc, extra: extra(), label: kind === 'stnk' ? 'STNK' : 'Foto kendaraan' },
      });
      toast(r.queued ? 'Tidak ada sinyal — dikirim otomatis nanti' : 'Terkirim — menunggu verifikasi', r.queued ? 'dark' : 'ok');
      setPick((p) => ({ ...p, [kind]: null })); load();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy('');
  }

  if (!v) return <Page title="Kendaraan" back={() => nav('/')}><Loading /></Page>;
  const expired = form.berlaku && new Date(form.berlaku) < new Date();

  const block = (kind, title, desc) => {
    const cur = v[kind]; const p = pick[kind];
    return (
      <div className="sub-card">
        <h2 className="sec">{title}</h2>
        <Card className="pad">
          <div className="kv"><span>Status</span><b><Chip status={cur?.status || 'none'} /></b></div>
          {cur && <div className="kv"><span>Diunggah</span><b>{fmtDateTime(cur.updated_at)}</b></div>}
        </Card>
        {cur?.status === 'rejected' && <div className="alert alert-err mt"><Icon name="alert" /><span><b>Ditolak:</b> {cur.review_note}</span></div>}
        {cur && !p && (
          cur.file_path.endsWith('.pdf')
            ? <Card className="pad file-pick mt"><SignedImg path={cur.file_path} className="row-thumb" /><span>{title} (PDF)<small>Ketuk untuk membuka</small></span></Card>
            : <div className="photo mt" onClick={() => setZoom(cur.file_path)}><SignedImg path={cur.file_path} className="photo-img" /></div>
        )}
        {cur?.status === 'approved' ? null : p ? (
          <>
            {p.url ? <div className="photo mt"><img src={p.url} className="photo-img" alt="" /></div>
                   : <Card className="pad file-pick mt"><Icon name="file" size={28} /><span>{p.name}<small>{fmtSize(p.size)}</small></span></Card>}
            <div className="btn-row mt">
              <Button variant="ghost" onClick={() => setPick((x) => ({ ...x, [kind]: null }))}>Batal</Button>
              <Button busy={busy === kind} icon="upload" onClick={() => send(kind)}>{cur ? 'Kirim & ganti' : 'Kirim'}</Button>
            </div>
          </>
        ) : kind === 'stnk' ? (
          <div className="two-act mt">
            <button className="drop" onClick={() => setScan(true)}><Icon name="scan" size={30} /><b>Scan STNK</b><small>{desc}</small></button>
            <label className="drop"><Icon name="upload" size={30} /><b>Pilih berkas</b><small>PDF atau foto</small>
              <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => onFile('stnk', e)} /></label>
          </div>
        ) : (
          <label className="drop mt"><Icon name="camera" size={34} /><b>Foto kendaraan</b><small>{desc}</small>
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile('kendaraan', e)} /></label>
        )}
      </div>
    );
  };

  return (
    <Page title="Kendaraan" subtitle="STNK & foto kendaraan untuk pendataan" back={() => nav('/')}>
      <Card className="pad">
        <div className="form" style={{ padding: '8px 0' }}>
          <label>Nomor polisi
            <input value={form.nomor_polisi} placeholder="KT 1234 AB" autoCapitalize="characters"
                   onChange={(e) => setForm((f) => ({ ...f, nomor_polisi: e.target.value }))} /></label>
          <div className="grid2 form">
            <label>Jenis
              <select value={form.jenis} onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value }))}>
                {JENIS.map((j) => <option key={j}>{j}</option>)}
              </select></label>
            <label>STNK berlaku s.d.
              <input type="date" value={form.berlaku} onChange={(e) => setForm((f) => ({ ...f, berlaku: e.target.value }))} /></label>
          </div>
          {expired && <div className="alert alert-warn" style={{ margin: 0 }}><Icon name="alert" /><span>STNK sudah lewat masa berlaku ({fmtDate(form.berlaku)}).</span></div>}
        </div>
      </Card>

      {block('stnk', 'STNK', 'Kamera, depan & belakang')}
      {block('kendaraan', 'Foto kendaraan', 'Pelat nomor harus terlihat jelas')}

      {zoom && <Lightbox path={zoom} onClose={() => setZoom(null)} />}
      <DocScanner open={scan} onClose={() => setScan(false)} title="Scan STNK" maxPages={2}
        hint="Foto sisi depan STNK (dan belakang bila perlu)."
        onDone={(blob, n) => { setScan(false); setPick((p) => ({ ...p, stnk: { blob, mime: 'application/pdf', name: `STNK (${n} halaman).pdf`, size: blob.size } })); }} />
    </Page>
  );
}

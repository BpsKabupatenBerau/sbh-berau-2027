import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { errMsg } from '../lib/supabase';
import { fmtDateTime } from '../lib/week';
import { compressImage, fmtSize } from '../lib/media';
import { submitUpload, queuedFor, onQueueChange } from '../lib/uploads';
import { Page, Card, Chip, Button, Icon, Loading, SignedImg, Lightbox, useToast } from '../components/ui';
import { loadMySurat } from './ppl/data';

// Shared by PPL and PML.
export default function SuratTugas() {
  const { uid, profile } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [cur, setCur] = useState(undefined);
  const [queued, setQueued] = useState(false);
  const [pick, setPick] = useState(null); // {blob, mime, url, name, origSize}
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);

  async function load() {
    try {
      setCur(await loadMySurat(uid));
      setQueued((await queuedFor(uid)).some((j) => j.kind === 'surat_tugas'));
    } catch (e) { toast(errMsg(e), 'err'); setCur(null); }
  }
  useEffect(() => { load(); return onQueueChange(load); }, []); // eslint-disable-line

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.type === 'application/pdf') {
      if (f.size > 5 * 1048576) return toast('PDF maksimal 5 MB', 'err');
      setPick({ blob: f, mime: 'application/pdf', url: null, name: f.name, origSize: f.size });
      return;
    }
    if (!f.type.startsWith('image/')) return toast('Gunakan foto atau PDF', 'err');
    setBusy(true);
    try {
      const blob = await compressImage(f);
      setPick({ blob, mime: 'image/jpeg', url: URL.createObjectURL(blob), name: f.name, origSize: f.size });
    } catch { toast('Foto tidak dapat dibaca, coba lagi', 'err'); }
    setBusy(false);
  }

  async function send() {
    setBusy(true);
    try {
      const r = await submitUpload({ uid, kind: 'surat_tugas', blob: pick.blob, mime: pick.mime, meta: { label: 'Surat tugas' } });
      toast(r.queued ? 'Tidak ada sinyal — surat tugas dikirim otomatis nanti' : 'Surat tugas terkirim', r.queued ? 'dark' : 'ok');
      setPick(null);
      load();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }

  const back = profile.role === 'ppl' ? () => nav('/') : undefined;
  if (cur === undefined) return <Page title="Surat Tugas" back={back}><Loading /></Page>;

  return (
    <Page title="Surat Tugas" subtitle={`${profile.role.toUpperCase()} · ${profile.full_name || profile.username}`} back={back}>
      {queued && <div className="alert alert-info"><Icon name="wifi" /><span>Surat tugas baru tersimpan di HP, menunggu sinyal.</span></div>}

      {cur ? (
        <>
          {cur.status === 'rejected' && <div className="alert alert-err"><Icon name="alert" /><span><b>Ditolak:</b> {cur.review_note}</span></div>}
          <Card className="pad">
            <div className="kv"><span>Status</span><b><Chip status={cur.status} /></b></div>
            <div className="kv"><span>Diunggah</span><b>{fmtDateTime(cur.updated_at)}</b></div>
            {cur.reviewed_at && <div className="kv"><span>Diperiksa</span><b>{fmtDateTime(cur.reviewed_at)}</b></div>}
          </Card>
          <div className="photo mt" onClick={() => !cur.file_path.endsWith('.pdf') && setZoom(true)}>
            <SignedImg path={cur.file_path} className="photo-img" />
          </div>
          {zoom && <Lightbox path={cur.file_path} onClose={() => setZoom(false)} />}
        </>
      ) : !pick && (
        <div className="alert alert-warn"><Icon name="alert" /><span>Surat tugas belum diunggah.</span></div>
      )}

      {pick ? (
        <>
          <h2 className="sec">Berkas baru</h2>
          {pick.url ? <div className="photo"><img src={pick.url} className="photo-img" alt="" /></div>
                    : <Card className="pad file-pick"><Icon name="file" size={28} /><span>{pick.name}<small>{fmtSize(pick.origSize)}</small></span></Card>}
          <div className="btn-row mt">
            <Button variant="ghost" onClick={() => setPick(null)}>Batal</Button>
            <Button busy={busy} icon="upload" onClick={send}>{cur ? 'Kirim & ganti' : 'Kirim'}</Button>
          </div>
        </>
      ) : (
        <div className="pick2 mt">
          <label className="drop">
            <Icon name="camera" size={34} /><b>Foto / scan</b><small>Pakai kamera</small>
            <input type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
          </label>
          <label className="drop">
            <Icon name="upload" size={34} /><b>Pilih berkas</b><small>PDF atau foto</small>
            <input type="file" accept="image/*,application/pdf" onChange={onFile} hidden />
          </label>
        </div>
      )}
      {busy && !pick && <Loading text="Memproses…" />}
    </Page>
  );
}

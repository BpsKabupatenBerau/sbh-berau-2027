import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { periodFromParams, periodQuery, periodTitle, periodRangeLabel, isMonthly, fmtDateTime } from '../../lib/period';
import { compressImage, getPosition, mapsLink, fmtSize } from '../../lib/media';
import { submitUpload, queuedFor } from '../../lib/uploads';
import { Page, Card, Chip, Button, Icon, Loading, SignedImg, Lightbox, useToast } from '../../components/ui';

const CFG = {
  kunjungan:  { base: '/pendataan',  word: 'pendataan' },
  pengawasan: { base: '/pengawasan', word: 'pengawasan' },
};

// Take/pick the photo for one ruta in one period. kind: 'kunjungan' (PPL) | 'pengawasan' (PML).
// Photo can come from the camera OR the gallery/WhatsApp; location is recorded when available (not required).
export default function Capture({ kind }) {
  const cfg = CFG[kind];
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const per = periodFromParams(sp, kind);
  const back = () => nav(`${cfg.base}?${periodQuery(per)}`);

  const [ruta, setRuta] = useState(null);
  const [cur, setCur] = useState(null);
  const [queued, setQueued] = useState(false);
  const [shot, setShot] = useState(null);
  const [gps, setGps] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    (async () => {
      let uq = supabase.from('uploads').select('*').eq('kind', kind).eq('ruta_id', id)
        .eq('period_year', per.year).eq('period_month', per.month);
      if (kind === 'kunjungan') uq = uq.eq('period_part', per.part);
      const [{ data: r, error }, { data: u }, q] = await Promise.all([
        supabase.from('ruta').select('id, nks, no_urut, nama_krt, alamat').eq('id', id).maybeSingle(),
        uq.maybeSingle(),
        queuedFor(uid),
      ]);
      if (error || !r) { toast(error ? errMsg(error) : 'Ruta tidak ditemukan', 'err'); back(); return; }
      setRuta(r); setCur(u || null);
      setQueued(q.some((j) => j.kind === kind && j.args.p_ruta_id === +id && j.args.p_year === per.year
        && j.args.p_month === per.month && (kind !== 'kunjungan' || j.args.p_part === per.part)));
    })();
    getPosition().then(setGps);
  }, [id]); // eslint-disable-line

  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const blob = await compressImage(f);
      const taken = f.lastModified && Date.now() - f.lastModified < 7 * 86400000 ? new Date(f.lastModified) : new Date();
      if (shot?.url) URL.revokeObjectURL(shot.url);
      setShot({ blob, url: URL.createObjectURL(blob), taken_at: taken.toISOString(), origSize: f.size });
      if (!gps) getPosition().then(setGps);
    } catch { toast('Foto tidak dapat dibaca, coba lagi', 'err'); }
    setBusy(false);
  }

  async function send() {
    setBusy(true);
    try {
      const res = await submitUpload({
        uid, kind, blob: shot.blob, mime: 'image/jpeg',
        meta: { ruta_id: ruta.id, nks: ruta.nks, no_urut: ruta.no_urut, year: per.year, month: per.month, part: per.part,
                lat: gps?.lat, lng: gps?.lng, acc: gps?.acc, taken_at: shot.taken_at,
                label: `${cfg.word[0].toUpperCase() + cfg.word.slice(1)} ruta ${ruta.no_urut} (${ruta.nama_krt})` },
      });
      toast(res.queued ? 'Tidak ada sinyal — foto disimpan & dikirim otomatis nanti' : 'Foto terkirim — menunggu verifikasi', res.queued ? 'dark' : 'ok');
      back();
    } catch (e) { toast(errMsg(e), 'err'); setBusy(false); }
  }

  if (!ruta) return <Page title="Ruta" back={back}><Loading /></Page>;
  const locked = cur?.status === 'approved';
  const status = queued ? 'queued' : cur?.status || 'none';
  const sub = isMonthly(kind) ? periodTitle(per) : `${periodTitle(per)} · ${periodRangeLabel(per)}`;

  return (
    <Page title={`Ruta ${ruta.no_urut}`} subtitle={sub} back={back}>
      <Card className="pad">
        <div className="kv"><span>Nama KRT</span><b>{ruta.nama_krt || '—'}</b></div>
        <div className="kv"><span>NKS</span><b>{ruta.nks}</b></div>
        <div className="kv"><span>No. urut sampel</span><b>{ruta.no_urut}</b></div>
        {ruta.alamat && <div className="kv"><span>Alamat</span><b>{ruta.alamat}</b></div>}
        <div className="kv"><span>Status</span><b><Chip status={status} /></b></div>
      </Card>

      {cur?.status === 'rejected' && (
        <div className="alert alert-err mt"><Icon name="alert" /><span><b>Ditolak:</b> {cur.review_note}</span></div>
      )}

      {cur && !shot && (
        <>
          <h2 className="sec">Foto terkirim</h2>
          <div className="photo" onClick={() => setZoom(true)}>
            <SignedImg path={cur.file_path} className="photo-img" />
            <div className="photo-meta">
              <div>🕒 {fmtDateTime(cur.taken_at)}</div>
              <div>📍 {cur.lat ? `${cur.lat.toFixed(5)}, ${cur.lng.toFixed(5)} (±${Math.round(cur.accuracy_m || 0)} m)` : 'tanpa lokasi'}</div>
            </div>
          </div>
          {zoom && <Lightbox path={cur.file_path} onClose={() => setZoom(false)} caption={`Ruta ${ruta.no_urut} · ${fmtDateTime(cur.taken_at)}`} />}
        </>
      )}

      {locked ? (
        <div className="alert alert-ok mt"><Icon name="shield" /><span>Foto periode ini sudah <b>disetujui</b>.</span></div>
      ) : (
        <>
          {shot ? (
            <>
              <h2 className="sec">Foto baru</h2>
              <div className="photo">
                <img src={shot.url} alt="" className="photo-img" />
                <button className="photo-retake" onClick={() => fileRef.current.click()}>Ganti foto</button>
                <div className="photo-meta">
                  <div>🕒 {fmtDateTime(shot.taken_at)}</div>
                  <div>📍 {gps === undefined ? 'Mencari lokasi…' : gps ? <>{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (±{gps.acc} m) · <a href={mapsLink(gps.lat, gps.lng)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>peta</a></> : 'tanpa lokasi'}</div>
                  <div className="photo-size">{fmtSize(shot.origSize)} → {fmtSize(shot.blob.size)}</div>
                </div>
              </div>
              <Button busy={busy} icon="upload" className="mt block" onClick={send}>{cur ? 'Kirim & ganti foto lama' : 'Kirim foto'}</Button>
            </>
          ) : (
            <label className="drop mt">
              <Icon name="camera" size={40} />
              <b>{cur ? `Ganti foto ${cfg.word}` : `Ambil foto ${cfg.word}`}</b>
              <small>Dari kamera atau galeri/WhatsApp · lokasi &amp; waktu dicatat otomatis bila tersedia</small>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} hidden />
            </label>
          )}
          {shot && <input ref={fileRef} type="file" accept="image/*" onChange={onFile} hidden />}
          {busy && !shot && <Loading text="Memproses foto…" />}
        </>
      )}
    </Page>
  );
}

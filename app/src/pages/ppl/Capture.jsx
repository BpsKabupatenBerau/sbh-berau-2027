import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { isoWeek, weekRange, fmtDateTime } from '../../lib/week';
import { compressImage, getPosition, mapsLink, fmtSize } from '../../lib/media';
import { submitUpload, queuedFor } from '../../lib/uploads';
import { Page, Card, Chip, Button, Icon, Loading, SignedImg, Lightbox, useToast } from '../../components/ui';

export default function Capture() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const wk = sp.get('y') ? { year: +sp.get('y'), week: +sp.get('w') } : isoWeek();
  const back = () => nav(`/kunjungan${sp.get('y') ? `?y=${wk.year}&w=${wk.week}` : ''}`);

  const [ruta, setRuta] = useState(null);
  const [cur, setCur] = useState(null);       // existing upload this week
  const [queued, setQueued] = useState(false);
  const [shot, setShot] = useState(null);     // {blob, url, taken_at, origSize}
  const [gps, setGps] = useState(undefined);  // undefined = locating, null = unavailable
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    (async () => {
      const [{ data: r, error }, { data: u }, q] = await Promise.all([
        supabase.from('ruta').select('id, nks, no_urut, nama_krt, alamat').eq('id', id).maybeSingle(),
        supabase.from('uploads').select('*').eq('kind', 'kunjungan').eq('ruta_id', id)
          .eq('period_year', wk.year).eq('period_week', wk.week).maybeSingle(),
        queuedFor(uid),
      ]);
      if (error || !r) { toast(error ? errMsg(error) : 'Ruta tidak ditemukan', 'err'); back(); return; }
      setRuta(r); setCur(u || null);
      setQueued(q.some((j) => j.args.p_ruta_id === +id && j.args.p_year === wk.year && j.args.p_week === wk.week));
    })();
    getPosition().then(setGps); // warm up GPS while the officer frames the shot
  }, [id]); // eslint-disable-line

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const blob = await compressImage(f);
      // lastModified ≈ capture time for camera shots; an old gallery photo shows its real (old) date to the admin
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
        uid, kind: 'kunjungan', blob: shot.blob, mime: 'image/jpeg',
        meta: { ruta_id: ruta.id, nks: ruta.nks, no_urut: ruta.no_urut, year: wk.year, week: wk.week,
                lat: gps?.lat, lng: gps?.lng, acc: gps?.acc, taken_at: shot.taken_at,
                label: `Ruta ${ruta.no_urut} (${ruta.nama_krt})` },
      });
      toast(res.queued ? 'Tidak ada sinyal — foto disimpan & dikirim otomatis nanti' : 'Kunjungan terkirim — menunggu verifikasi',
            res.queued ? 'dark' : 'ok');
      back();
    } catch (e) {
      toast(errMsg(e), 'err');
      setBusy(false);
    }
  }

  if (!ruta) return <Page title="Kunjungan" back={back}><Loading /></Page>;
  const locked = cur?.status === 'approved';
  const status = queued ? 'queued' : cur?.status || 'none';

  return (
    <Page title={`Ruta ${ruta.no_urut}`} subtitle={`Minggu ke-${wk.week} · ${weekRange(wk)}`} back={back}>
      <Card className="pad">
        <div className="kv"><span>Nama KRT</span><b>{ruta.nama_krt || '—'}</b></div>
        <div className="kv"><span>NKS</span><b>{ruta.nks}</b></div>
        <div className="kv"><span>No. urut sampel</span><b>{ruta.no_urut}</b></div>
        {ruta.alamat && <div className="kv"><span>Alamat</span><b>{ruta.alamat}</b></div>}
        <div className="kv"><span>Status minggu ini</span><b><Chip status={status} /></b></div>
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
        <div className="alert alert-ok mt"><Icon name="shield" /><span>Kunjungan minggu ini sudah <b>disetujui</b>.</span></div>
      ) : (
        <>
          {shot ? (
            <>
              <h2 className="sec">Foto baru</h2>
              <div className="photo">
                <img src={shot.url} alt="" className="photo-img" />
                <button className="photo-retake" onClick={() => fileRef.current.click()}>Ambil ulang</button>
                <div className="photo-meta">
                  <div>🕒 {fmtDateTime(shot.taken_at)}</div>
                  <div>📍 {gps === undefined ? 'Mencari lokasi…' : gps ? <>{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (±{gps.acc} m) · <a href={mapsLink(gps.lat, gps.lng)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>peta</a></> : 'Lokasi tidak tersedia — aktifkan GPS'}</div>
                  <div className="photo-size">{fmtSize(shot.origSize)} → {fmtSize(shot.blob.size)}</div>
                </div>
              </div>
              <Button busy={busy} icon="upload" className="mt block" onClick={send}>
                {cur ? 'Kirim & ganti foto lama' : 'Kirim kunjungan'}
              </Button>
            </>
          ) : (
            <label className="drop mt">
              <Icon name="camera" size={40} />
              <b>{cur ? 'Ambil ulang foto kunjungan' : 'Ambil foto kunjungan'}</b>
              <small>Kamera akan terbuka · lokasi &amp; waktu dicatat otomatis</small>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
            </label>
          )}
          {shot && <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} hidden />}
          {busy && !shot && <Loading text="Memproses foto…" />}
        </>
      )}
    </Page>
  );
}

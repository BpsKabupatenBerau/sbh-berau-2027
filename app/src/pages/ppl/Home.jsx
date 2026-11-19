import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { errMsg } from '../../lib/supabase';
import { isoWeek, weekRange, weekDeadline } from '../../lib/week';
import { onQueueChange } from '../../lib/uploads';
import { Page, Card, Icon, Chip, Loading, Empty, useToast } from '../../components/ui';
import { loadMyRuta, loadWeekUploads, loadQueuedKeys, statusOf, loadMySurat } from './data';

export default function PplHome() {
  const { profile, uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const wk = isoWeek();
  const [d, setD] = useState(null);

  async function load() {
    try {
      const [{ nks, ruta }, ups, q, surat] = await Promise.all([
        loadMyRuta(), loadWeekUploads(wk), loadQueuedKeys(uid, wk), loadMySurat(uid),
      ]);
      const st = ruta.map((r) => statusOf(r, ups, q));
      const c = (s) => st.filter((x) => x === s).length;
      setD({ nks, ruta, surat, total: ruta.length, done: ruta.length - c('none'),
             ok: c('approved'), wait: c('pending') + c('queued'), bad: c('rejected') });
    } catch (e) { toast(errMsg(e), 'err'); setD({ error: true }); }
  }
  useEffect(() => { load(); return onQueueChange(load); }, []); // eslint-disable-line

  const first = (profile.full_name || profile.username).split(' ')[0];
  if (!d) return <Page title={`Halo, ${first}`}><Loading /></Page>;
  const nksLabel = d.nks?.map((n) => `${n.nks} · ${n.desa || ''}`).join(', ');
  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;

  return (
    <Page title={`Halo, ${first} 👋`} subtitle={d.nks?.length ? `PPL · NKS ${nksLabel}` : 'PPL'}>
      {!d.total ? (
        <Empty icon="map" title="Belum ada sampel">Admin belum menugaskan NKS/ruta ke akun Anda.</Empty>
      ) : (
        <>
          <div className="hero" onClick={() => nav('/kunjungan')}>
            <div className="hero-week">Minggu ke-{wk.week} · {weekRange(wk)}</div>
            <div className="hero-big">{d.done} / {d.total} ruta</div>
            <div className="hero-sub">kunjungan terunggah minggu ini</div>
            <div className="hero-bar"><i style={{ width: pct + '%' }} /></div>
          </div>

          <div className="stats3">
            <div className="stat"><b className="t-ok">{d.ok}</b><span>Disetujui</span></div>
            <div className="stat"><b className="t-warn">{d.wait}</b><span>Menunggu</span></div>
            <div className="stat"><b className="t-err">{d.bad}</b><span>Ditolak</span></div>
          </div>

          {d.bad > 0 && (
            <div className="alert alert-err click" onClick={() => nav('/status')}>
              <Icon name="alert" /> <span><b>{d.bad} foto ditolak</b> minggu ini. Ketuk untuk melihat catatan admin.</span>
            </div>
          )}
        </>
      )}

      <h2 className="sec">Tugas saya</h2>
      <div className="tasks">
        <Card className="task" onClick={() => nav('/kunjungan')}>
          <div className="task-ic"><Icon name="home" size={24} /></div>
          <div className="task-tx"><b>Kunjungan Mingguan</b>
            <span>{d.total ? `${d.total - d.done} ruta belum difoto minggu ini` : 'Belum ada ruta'}</span></div>
          <Icon name="right" className="task-arw" />
        </Card>
        <Card className="task" onClick={() => nav('/surat-tugas')}>
          <div className="task-ic"><Icon name="file" size={24} /></div>
          <div className="task-tx"><b>Surat Tugas</b>
            <span>{d.surat ? 'Sudah diunggah' : 'Belum diunggah'}</span></div>
          {d.surat ? <Chip status={d.surat.status} /> : <Chip status="none" />}
        </Card>
      </div>

      <h2 className="sec">Pengingat</h2>
      <Card className="pad muted-text">
        Batas unggah kunjungan minggu ini: <b>{weekDeadline(wk)}</b>. Ambil foto di lokasi ruta;
        lokasi dan waktu tercatat otomatis.
      </Card>
    </Page>
  );
}

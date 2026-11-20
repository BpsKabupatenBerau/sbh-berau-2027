import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { errMsg } from '../../lib/supabase';
import { currentPeriod, periodTitle, periodRangeLabel, periodDeadline, monthLabel } from '../../lib/period';
import { onQueueChange } from '../../lib/uploads';
import { Page, Card, Icon, Chip, Loading, Empty, useToast } from '../../components/ui';
import { loadMyRuta, loadPeriodUploads, loadQueuedKeys, statusOf, loadSuratMonth, loadVehicle, pairStatus } from './data';

export default function PplHome() {
  const { profile, uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const per = currentPeriod('kunjungan');
  const [d, setD] = useState(null);

  async function load() {
    try {
      const [{ nks, ruta }, ups, q, surat, veh] = await Promise.all([
        loadMyRuta(), loadPeriodUploads('kunjungan', per), loadQueuedKeys(uid, 'kunjungan', per),
        loadSuratMonth(uid, per.year, per.month), loadVehicle(uid),
      ]);
      const st = ruta.map((r) => statusOf(r, ups, q));
      const c = (s) => st.filter((x) => x === s).length;
      setD({ nks, surat, veh, total: ruta.length, done: ruta.length - c('none'),
             ok: c('approved'), wait: c('pending') + c('queued'), bad: c('rejected') });
    } catch (e) { toast(errMsg(e), 'err'); setD({ nks: [], total: 0, surat: {}, veh: {} }); }
  }
  useEffect(() => { load(); return onQueueChange(load); }, []); // eslint-disable-line

  const first = (profile.full_name || profile.username).split(' ')[0];
  if (!d) return <Page title={`Halo, ${first}`}><Loading /></Page>;
  const nksLabel = d.nks.map((n) => `${n.nks} · ${n.desa || ''}`).join(', ');
  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
  const suratSt = d.surat.upload?.status || (d.surat.nomor ? 'none' : null);
  const vehSt = pairStatus(d.veh.stnk, d.veh.kendaraan);

  return (
    <Page title={`Halo, ${first} 👋`} subtitle={d.nks.length ? `PPL · NKS ${nksLabel}` : 'PPL'}>
      {!d.total ? (
        <Empty icon="map" title="Belum ada sampel">Admin belum menugaskan NKS/ruta ke akun Anda.</Empty>
      ) : (
        <>
          <div className="hero" onClick={() => nav('/pendataan')}>
            <div className="hero-week">{periodTitle(per)} · {periodRangeLabel(per)}</div>
            <div className="hero-big">{d.done} / {d.total} ruta</div>
            <div className="hero-sub">foto pendataan periode ini</div>
            <div className="hero-bar"><i style={{ width: pct + '%' }} /></div>
          </div>
          <div className="stats3">
            <div className="stat"><b className="t-ok">{d.ok}</b><span>Disetujui</span></div>
            <div className="stat"><b className="t-warn">{d.wait}</b><span>Menunggu</span></div>
            <div className="stat"><b className="t-err">{d.bad}</b><span>Ditolak</span></div>
          </div>
          {d.bad > 0 && (
            <div className="alert alert-err click" onClick={() => nav('/status')}>
              <Icon name="alert" /> <span><b>{d.bad} foto ditolak</b> periode ini. Ketuk untuk melihat catatan admin.</span>
            </div>
          )}
        </>
      )}

      <h2 className="sec">Tugas saya</h2>
      <div className="tasks">
        <Card className="task" onClick={() => nav('/pendataan')}>
          <div className="task-ic"><Icon name="home" size={24} /></div>
          <div className="task-tx"><b>Pendataan</b><span>{d.total ? `${d.total - d.done} ruta belum difoto periode ini` : 'Belum ada ruta'}</span></div>
          <Icon name="right" className="task-arw" />
        </Card>
        <Card className="task" onClick={() => nav('/surat-tugas')}>
          <div className="task-ic"><Icon name="file" size={24} /></div>
          <div className="task-tx"><b>Surat Tugas</b><span>{d.surat.nomor ? monthLabel(per.year, per.month) : 'Nomor bulan ini belum ada'}</span></div>
          {suratSt ? <Chip status={suratSt} /> : <Icon name="right" className="task-arw" />}
        </Card>
        <Card className="task" onClick={() => nav('/kendaraan')}>
          <div className="task-ic"><Icon name="car" size={24} /></div>
          <div className="task-tx"><b>Kendaraan</b><span>STNK &amp; foto kendaraan</span></div>
          <Chip status={vehSt} />
        </Card>
      </div>

      <h2 className="sec">Pengingat</h2>
      <Card className="pad muted-text">
        Batas foto pendataan periode ini: <b>{periodDeadline(per)}</b>. Ambil foto di lokasi ruta; lokasi dan waktu tercatat otomatis.
      </Card>
    </Page>
  );
}

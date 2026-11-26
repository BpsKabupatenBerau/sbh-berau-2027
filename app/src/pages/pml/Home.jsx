import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { currentPeriod, shiftPeriod, cmpPeriod, periodTitle, periodRangeLabel, periodQuery, monthLabel, BULAN_FULL } from '../../lib/period';
import { Page, Card, Chip, Loading, Empty, PeriodPicker, Progress, Icon, useToast } from '../../components/ui';
import { loadSuratMonth, loadVehicle, pairStatus } from '../ppl/data';

export default function PmlHome() {
  const { profile, uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const now = currentPeriod('kunjungan');
  const [per, setPer] = useState(now);
  const [rows, setRows] = useState(null);
  const [side, setSide] = useState(null);

  useEffect(() => {
    Promise.all([loadSuratMonth(uid, now.year, now.month), loadVehicle(uid)]).then(([s, v]) => setSide({ s, v }));
  }, [uid]); // eslint-disable-line
  useEffect(() => {
    setRows(null);
    supabase.rpc('period_progress', { p_year: per.year, p_month: per.month, p_part: per.part }).then(({ data, error }) => {
      if (error) toast(errMsg(error), 'err');
      setRows(data || []);
    });
  }, [per.year, per.month, per.part]); // eslint-disable-line

  // Locked to the current month (pengawasan is monthly).
  const move = (dlt) => { const n = shiftPeriod(per, dlt); if (cmpPeriod(n, now) === 0) setPer(n); };
  const tot = (rows || []).reduce((a, r) => ({ t: a.t + r.total, u: a.u + r.uploaded, w: a.w + r.awas_uploaded }), { t: 0, u: 0, w: 0 });
  const first = (profile.full_name || profile.username).split(' ')[0];

  return (
    <Page title={`Halo, ${first} 👋`} subtitle={`PML · ${rows ? rows.length : '…'} NKS diawasi`}>
      <div className="hero" onClick={() => nav('/pengawasan')}>
        <div className="hero-week">Pengawasan {BULAN_FULL[per.month - 1]} {per.year}</div>
        <div className="hero-big">{tot.w} / {tot.t} ruta</div>
        <div className="hero-sub">foto pengawasan Anda bulan ini</div>
        <div className="hero-bar"><i style={{ width: (tot.t ? Math.round(tot.w / tot.t * 100) : 0) + '%' }} /></div>
      </div>

      <h2 className="sec">Pendataan PPL</h2>
      <PeriodPicker value={per} min={now} max={now} onChange={move} label={periodTitle(per)} range={periodRangeLabel(per)} />
      {!rows ? <Loading /> : !rows.length ? <Empty icon="map" title="Belum ada NKS">Admin belum menugaskan NKS ke Anda.</Empty> : (
        <Card className="list">
          {rows.map((r) => (
            <button key={r.nks} className="row" onClick={() => nav(`/nks/${r.nks}?${periodQuery(per)}`)}>
              <span className="row-tx">
                <b>NKS {r.nks} · {r.desa}</b>
                <small>PPL {r.ppl_name || '—'} · pendataan {r.uploaded}/{r.total} · pengawasan {r.awas_uploaded}/{r.total}</small>
                <Progress value={r.uploaded} total={r.total} tone={r.uploaded === 0 ? 'err' : r.uploaded < r.total ? 'warn' : 'ok'} />
              </span>
              {r.rejected > 0 ? <Chip status="rejected">{r.rejected} ditolak</Chip> : r.uploaded === r.total && r.total ? <Chip status="approved">Lengkap</Chip> : null}
              <Icon name="right" className="row-arw" />
            </button>
          ))}
        </Card>
      )}

      <h2 className="sec">Tugas saya</h2>
      <div className="tasks">
        <Card className="task" onClick={() => nav('/pengawasan')}>
          <div className="task-ic"><Icon name="shield" size={24} /></div>
          <div className="task-tx"><b>Pengawasan</b><span>1 foto per ruta per bulan</span></div>
          <Icon name="right" className="task-arw" />
        </Card>
        <Card className="task" onClick={() => nav('/usulan')}>
          <div className="task-ic"><Icon name="send" size={24} /></div>
          <div className="task-tx"><b>Usulan Komoditas</b><span>Komoditas / kualitas baru</span></div>
          <Icon name="right" className="task-arw" />
        </Card>
        <Card className="task" onClick={() => nav('/surat-tugas')}>
          <div className="task-ic"><Icon name="file" size={24} /></div>
          <div className="task-tx"><b>Surat Tugas</b><span>{side?.s.nomor ? monthLabel(now.year, now.month) : 'Nomor bulan ini belum ada'}</span></div>
          {side?.s.nomor ? <Chip status={side.s.upload?.status || 'none'} /> : <Icon name="right" className="task-arw" />}
        </Card>
        <Card className="task" onClick={() => nav('/kendaraan')}>
          <div className="task-ic"><Icon name="car" size={24} /></div>
          <div className="task-tx"><b>Kendaraan</b><span>STNK &amp; foto kendaraan</span></div>
          {side && <Chip status={pairStatus(side.v.stnk, side.v.kendaraan)} />}
        </Card>
        <Card className="task" onClick={() => nav('/rekap-bl')}>
          <div className="task-ic"><Icon name="layers" size={24} /></div>
          <div className="task-tx"><b>Rekap BL</b><span>Periksa rekap BL per triwulan</span></div>
          <Icon name="right" className="task-arw" />
        </Card>
      </div>
    </Page>
  );
}

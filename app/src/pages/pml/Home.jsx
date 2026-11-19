import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { isoWeek, shiftWeek, weekRange, cmpWeek } from '../../lib/week';
import { Page, Card, Chip, Loading, Empty, WeekPicker, Progress, Icon, useToast } from '../../components/ui';
import { loadMySurat } from '../ppl/data';

export default function PmlHome() {
  const { profile, uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const now = isoWeek();
  const [wk, setWk] = useState(now);
  const [rows, setRows] = useState(null);
  const [surat, setSurat] = useState(undefined);

  useEffect(() => { loadMySurat(uid).then(setSurat).catch(() => setSurat(null)); }, [uid]);
  useEffect(() => {
    setRows(null);
    supabase.rpc('week_progress', { p_year: wk.year, p_week: wk.week }).then(({ data, error }) => {
      if (error) toast(errMsg(error), 'err');
      setRows(data || []);
    });
  }, [wk.year, wk.week]); // eslint-disable-line

  const move = (delta) => { const n = shiftWeek(wk, delta); if (cmpWeek(n, now) <= 0) setWk(n); };
  const tot = (rows || []).reduce((a, r) => ({ t: a.t + r.total, u: a.u + r.uploaded }), { t: 0, u: 0 });
  const first = (profile.full_name || profile.username).split(' ')[0];

  return (
    <Page title={`Halo, ${first} 👋`} subtitle={`PML · ${rows ? rows.length : '…'} NKS diawasi`}>
      <div className="hero">
        <div className="hero-week">Minggu ke-{wk.week} · {weekRange(wk)}</div>
        <div className="hero-big">{tot.u} / {tot.t} ruta</div>
        <div className="hero-sub">kunjungan PPL terunggah</div>
        <div className="hero-bar"><i style={{ width: (tot.t ? Math.round(tot.u / tot.t * 100) : 0) + '%' }} /></div>
      </div>

      <WeekPicker value={wk} max={now} onChange={move} label={`Minggu ke-${wk.week}`} range={weekRange(wk)} />

      <h2 className="sec">Progres per NKS</h2>
      {!rows ? <Loading /> : !rows.length ? <Empty icon="map" title="Belum ada NKS">Admin belum menugaskan NKS ke Anda.</Empty> : (
        <Card className="list">
          {rows.map((r) => (
            <button key={r.nks} className="row" onClick={() => nav(`/nks/${r.nks}?y=${wk.year}&w=${wk.week}`)}>
              <span className="row-tx">
                <b>NKS {r.nks} · {r.desa}</b>
                <small>PPL {r.ppl_name || '—'} · {r.uploaded}/{r.total} ruta</small>
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
        <Card className="task" onClick={() => nav('/surat-tugas')}>
          <div className="task-ic"><Icon name="file" size={24} /></div>
          <div className="task-tx"><b>Surat Tugas</b><span>{surat ? 'Sudah diunggah' : 'Belum diunggah'}</span></div>
          <Chip status={surat?.status || 'none'} />
        </Card>
        <Card className="task disabled">
          <div className="task-ic"><Icon name="camera" size={24} /></div>
          <div className="task-tx"><b>Foto Supervisi</b><span>Segera hadir (fase 3)</span></div>
        </Card>
        <Card className="task disabled">
          <div className="task-ic"><Icon name="layers" size={24} /></div>
          <div className="task-tx"><b>Rekap BL</b><span>Segera hadir (fase 3)</span></div>
        </Card>
      </div>
    </Page>
  );
}

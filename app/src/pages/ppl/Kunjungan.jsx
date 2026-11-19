import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { errMsg } from '../../lib/supabase';
import { isoWeek, shiftWeek, weekRange, cmpWeek } from '../../lib/week';
import { onQueueChange } from '../../lib/uploads';
import { Page, Card, Chip, Loading, Empty, WeekPicker, Icon, useToast } from '../../components/ui';
import { loadMyRuta, loadWeekUploads, loadQueuedKeys, statusOf } from './data';

export default function Kunjungan() {
  const { uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const now = isoWeek();
  const wk = sp.get('y') ? { year: +sp.get('y'), week: +sp.get('w') } : now;
  const [d, setD] = useState(null);

  async function load() {
    try {
      const [{ ruta }, ups, q] = await Promise.all([loadMyRuta(), loadWeekUploads(wk), loadQueuedKeys(uid, wk)]);
      setD({ ruta, ups, q });
    } catch (e) { toast(errMsg(e), 'err'); setD({ ruta: [], ups: {}, q: {} }); }
  }
  useEffect(() => { setD(null); load(); return onQueueChange(load); }, [wk.year, wk.week]); // eslint-disable-line

  const groups = useMemo(() => {
    const g = {};
    (d?.ruta || []).forEach((r) => { (g[r.nks] ||= { info: r.info, list: [] }).list.push(r); });
    return Object.entries(g);
  }, [d]);

  const move = (delta) => {
    const n = shiftWeek(wk, delta);
    if (cmpWeek(n, now) > 0) return;
    setSp(cmpWeek(n, now) === 0 ? {} : { y: n.year, w: n.week }, { replace: true });
  };

  const done = d ? d.ruta.filter((r) => statusOf(r, d.ups, d.q) !== 'none').length : 0;

  return (
    <Page title="Kunjungan Mingguan" subtitle={d ? `${done} dari ${d.ruta.length} ruta sudah difoto` : ' '}>
      <WeekPicker value={wk} max={now} onChange={move}
                  label={`Minggu ke-${wk.week}${cmpWeek(wk, now) === 0 ? ' (ini)' : ''}`} range={weekRange(wk)} />
      {!d ? <Loading /> : !d.ruta.length ? (
        <Empty icon="map" title="Belum ada ruta">Hubungi admin untuk penugasan sampel.</Empty>
      ) : groups.map(([nks, g]) => (
        <div key={nks}>
          {groups.length > 1 && <h2 className="sec">NKS {nks} · {g.info?.desa}</h2>}
          <Card className="list">
            {g.list.map((r, i) => {
              const st = statusOf(r, d.ups, d.q);
              return (
                <button key={r.id} className="row" onClick={() => nav(`/kunjungan/${r.id}?y=${wk.year}&w=${wk.week}`)}>
                  <span className={`num num-${st}`}>{st === 'approved' ? '✓' : String(i + 1).padStart(2, '0')}</span>
                  <span className="row-tx"><b>{r.nama_krt || '(tanpa nama)'}</b><small>No. sampel {r.no_urut}</small></span>
                  <Chip status={st} />
                  <Icon name="right" className="row-arw" />
                </button>
              );
            })}
          </Card>
        </div>
      ))}
      <p className="hint center">Ketuk ruta untuk mengambil foto kunjungan.</p>
    </Page>
  );
}

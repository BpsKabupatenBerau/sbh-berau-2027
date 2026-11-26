import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { errMsg } from '../../lib/supabase';
import { currentPeriod, monthStartPeriod, shiftPeriod, cmpPeriod, periodTitle, periodRangeLabel, periodFromParams, periodQuery, isMonthly } from '../../lib/period';
import { onQueueChange } from '../../lib/uploads';
import { Page, Card, Chip, Loading, Empty, PeriodPicker, Icon, useToast } from '../../components/ui';
import { loadMyRuta, loadPeriodUploads, loadQueuedKeys, loadMonthApproval, statusOf } from '../ppl/data';

const CFG = {
  kunjungan:  { title: 'Pendataan',  base: '/pendataan',  hint: 'Ketuk ruta untuk mengambil foto pendataan.' },
  pengawasan: { title: 'Pengawasan', base: '/pengawasan', hint: 'Ketuk ruta untuk mengambil foto pengawasan bulan ini.' },
};

/** Earliest period of the month that is NOT fully approved (capped at `now`); that's the active one.
 *  Periods after it stay locked until admin approves everything in it. */
function activePeriod(kind, now, monthStart, appr) {
  if (kind !== 'kunjungan' || !appr) return now;        // monthly: single period
  for (let part = monthStart.part; part <= now.part; part++) {
    if ((appr.approved[part] || 0) < appr.total) return { year: now.year, month: now.month, part };
  }
  return now;                                           // caught up: everything up to now approved
}

// Checklist of the user's ruta for one period. PPL: pendataan (dasarian). PML: pengawasan (monthly).
// Locked to the current month; the next period opens only after the current one is fully approved.
export default function RutaList({ kind }) {
  const cfg = CFG[kind];
  const { uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const now = currentPeriod(kind);
  const monthStart = monthStartPeriod(kind);
  const per = periodFromParams(sp, kind);
  const [d, setD] = useState(null);

  async function load() {
    try {
      const [{ ruta }, ups, q, appr] = await Promise.all([
        loadMyRuta(),
        loadPeriodUploads(kind, per, kind === 'pengawasan' ? uid : undefined),
        loadQueuedKeys(uid, kind, per),
        loadMonthApproval(kind, now, kind === 'pengawasan' ? uid : undefined),
      ]);
      const active = activePeriod(kind, now, monthStart, appr);
      setD({ ruta, ups, q, active });
    } catch (e) { toast(errMsg(e), 'err'); setD({ ruta: [], ups: {}, q: {}, active: now }); }
  }
  useEffect(() => { setD(null); load(); return onQueueChange(load); }, [per.year, per.month, per.part]); // eslint-disable-line

  // If we landed on a period that is locked (ahead of the active one), fall back to the active period.
  useEffect(() => {
    if (d && cmpPeriod(per, d.active) > 0) {
      setSp(cmpPeriod(d.active, now) === 0 ? {} : Object.fromEntries(new URLSearchParams(periodQuery(d.active))), { replace: true });
    }
  }, [d]); // eslint-disable-line

  const groups = useMemo(() => {
    const g = {};
    (d?.ruta || []).forEach((r) => { (g[r.nks] ||= { info: r.info, list: [] }).list.push(r); });
    return Object.entries(g);
  }, [d]);

  const active = d?.active || now;
  const move = (delta) => {
    const n = shiftPeriod(per, delta);
    if (cmpPeriod(n, monthStart) < 0 || cmpPeriod(n, active) > 0) return;    // stay inside this month & unlocked range
    setSp(cmpPeriod(n, now) === 0 ? {} : Object.fromEntries(new URLSearchParams(periodQuery(n))), { replace: true });
  };
  const done = d ? d.ruta.filter((r) => statusOf(r, d.ups, d.q) !== 'none').length : 0;
  const isNow = cmpPeriod(per, now) === 0;
  const gatedNext = cmpPeriod(active, now) < 0 && cmpPeriod(per, active) === 0;    // held back: next period still locked

  return (
    <Page title={cfg.title} subtitle={d ? `${done} dari ${d.ruta.length} ruta sudah difoto` : ' '}>
      <PeriodPicker value={per} min={monthStart} max={active} onChange={move}
                    label={`${periodTitle(per)}${isNow ? ' (ini)' : ''}`}
                    range={isMonthly(kind) ? '1 foto per ruta per bulan' : periodRangeLabel(per)} />
      {gatedNext && (
        <div className="alert alert-warn"><Icon name="alert" /><span>Periode berikutnya terbuka setelah <b>semua foto periode ini disetujui admin</b>.</span></div>
      )}
      {!d ? <Loading /> : !d.ruta.length ? (
        <Empty icon="map" title="Belum ada ruta">Hubungi admin untuk penugasan sampel.</Empty>
      ) : groups.map(([nks, g]) => (
        <div key={nks}>
          {groups.length > 1 && <h2 className="sec">NKS {nks} · {g.info?.desa}</h2>}
          <Card className="list">
            {g.list.map((r, i) => {
              const st = statusOf(r, d.ups, d.q);
              return (
                <button key={r.id} className="row" onClick={() => nav(`${cfg.base}/${r.id}?${periodQuery(per)}`)}>
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
      <p className="hint center">{cfg.hint}</p>
    </Page>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/week';
import { queuedFor, onQueueChange } from '../../lib/uploads';
import { Page, Card, Chip, Loading, Empty, Icon, SignedImg, useToast } from '../../components/ui';

const KIND = { kunjungan: 'Kunjungan', surat_tugas: 'Surat Tugas', supervisi: 'Supervisi' };
const TABS = [['all', 'Semua'], ['rejected', 'Ditolak'], ['pending', 'Menunggu'], ['approved', 'Disetujui']];

export default function Status() {
  const { uid } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState([]);
  const [tab, setTab] = useState('all');

  async function load() {
    const [{ data, error }, { data: ruta }, qq] = await Promise.all([
      supabase.from('uploads').select('*').eq('user_id', uid).order('updated_at', { ascending: false }).limit(200),
      supabase.from('ruta').select('id, no_urut, nama_krt'),
      queuedFor(uid),
    ]);
    if (error) { toast(errMsg(error), 'err'); setRows([]); return; }
    const rm = Object.fromEntries((ruta || []).map((r) => [r.id, r]));
    setRows((data || []).map((u) => ({ ...u, ruta: rm[u.ruta_id] })));
    setQ(qq);
  }
  useEffect(() => { load(); return onQueueChange(load); }, []); // eslint-disable-line

  const list = (rows || []).filter((r) => tab === 'all' || r.status === tab)
    .sort((a, b) => (b.status === 'rejected') - (a.status === 'rejected')); // rejected first, then newest
  const nBad = (rows || []).filter((r) => r.status === 'rejected').length;

  const open = (u) => {
    if (u.kind === 'kunjungan') nav(`/kunjungan/${u.ruta_id}?y=${u.period_year}&w=${u.period_week}`);
    else if (u.kind === 'surat_tugas') nav('/surat-tugas');
  };

  return (
    <Page title="Status Unggahan" subtitle="Hasil verifikasi admin">
      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}{k === 'rejected' && nBad ? <span className="badge">{nBad}</span> : null}
          </button>
        ))}
      </div>

      {q.length > 0 && tab === 'all' && (
        <Card className="list mb">
          {q.map((j) => (
            <div key={j.id} className="row static">
              <span className="num num-queued"><Icon name="wifi" size={16} /></span>
              <span className="row-tx"><b>{j.label || KIND[j.kind]}</b><small>Disimpan {fmtDateTime(j.createdAt)}</small></span>
              <Chip status="queued" />
            </div>
          ))}
        </Card>
      )}

      {!rows ? <Loading /> : !list.length ? (
        <Empty icon="clock" title={tab === 'rejected' ? 'Tidak ada yang ditolak 🎉' : 'Belum ada unggahan'} />
      ) : (
        <Card className="list">
          {list.map((u) => (
            <button key={u.id} className="row" onClick={() => open(u)}>
              <SignedImg path={u.file_path} className="row-thumb" />
              <span className="row-tx">
                <b>{u.kind === 'kunjungan' ? `Ruta ${u.ruta?.no_urut || ''} — ${u.ruta?.nama_krt || ''}` : KIND[u.kind]}</b>
                <small>{u.kind === 'kunjungan' ? `Minggu ke-${u.period_week} · ` : ''}{fmtDateTime(u.updated_at)}</small>
                {u.status === 'rejected' && u.review_note && <small className="t-err">Catatan: {u.review_note}</small>}
              </span>
              <Chip status={u.status} />
            </button>
          ))}
        </Card>
      )}
    </Page>
  );
}

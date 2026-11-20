import { useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { readTableFind, cell, padCode } from '../../lib/excel';
import { fmtDate, fmtDateTime } from '../../lib/period';
import { Page, Card, Button, Icon, Loading, Empty, Modal, Progress, useToast } from '../../components/ui';

const MAP_KEY = 'spkrt-fasih-map';
const FIELDS = [
  ['nks', 'NKS', ['nks', 'nomorkodesampel', 'kodesampel', 'nks2027']],
  ['no_urut', 'No. urut ruta', ['nourutruta', 'nourut', 'nus', 'nourutsampel', 'noruta', 'nurt', 'r109', 'nomorurut']],
  ['petugas', 'Petugas', ['pencacah', 'petugas', 'ppl', 'namapetugas', 'pcl', 'user', 'username', 'currentuser', 'assignedto']],
  ['status', 'Status', ['status', 'statusassignment', 'assignmentstatus', 'statusdokumen', 'statusterakhir']],
];
const todayIso = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

/** Colour a free-text FASIH status by its keywords. */
export function statusTone(s) {
  const x = String(s || '').toLowerCase();
  if (/reject|tolak|revisi/.test(x)) return 'err';
  if (/approv|setuju|complete|selesai|clean/.test(x)) return 'ok';
  if (/submit|kirim/.test(x)) return 'info';
  if (/open|draft|baru|belum|assign/.test(x)) return 'idle';
  return 'warn';
}
const loadMap = () => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); } catch { return {}; } };
const saveMap = (m) => { try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* private mode */ } };
function transformNks(v, mode) {
  const s = cell(v).replace(/\.0+$/, '');
  if (!s) return null;
  const d = s.replace(/\D/g, '');
  if (mode === 'last5' && d.length >= 5) return d.slice(-5);
  if (mode === 'first5' && d.length >= 5) return d.slice(0, 5);
  return /^\d+$/.test(s) && s.length < 5 ? padCode(s, 5) : s;
}

// Admin uploads the daily FASIH export; everyone in the office sees progress per NKS / petugas.
export default function Fasih() {
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile.role === 'admin';
  const [imports, setImports] = useState(null);
  const [cur, setCur] = useState(null);
  const [rows, setRows] = useState(null);
  const [prev, setPrev] = useState(null);
  const [sample, setSample] = useState(null);
  const [imp, setImp] = useState(null);
  const [prog, setProg] = useState(null);
  const [tab, setTab] = useState('nks');
  const [stF, setStF] = useState('');
  const [q, setQ] = useState('');

  async function loadImports(selectId) {
    const { data, error } = await supabase.from('fasih_import').select('*').order('tanggal', { ascending: false }).limit(120);
    if (error) { toast(errMsg(error), 'err'); setImports([]); return; }
    setImports(data || []);
    setCur((c) => selectId || (c && data.some((d) => d.id === c) ? c : data?.[0]?.id || null));
  }
  useEffect(() => {
    loadImports();
    Promise.all([
      supabase.from('nks').select('nks, desa, kecamatan, ppl_id, pml_id').order('nks'),
      supabase.from('ruta').select('nks, active').limit(10000),
      supabase.from('profiles').select('id, full_name'),
    ]).then(([n, r, p]) => {
      const cnt = {}; (r.data || []).filter((x) => x.active !== false).forEach((x) => { cnt[x.nks] = (cnt[x.nks] || 0) + 1; });
      setSample({ nks: n.data || [], cnt, people: Object.fromEntries((p.data || []).map((x) => [x.id, x.full_name])) });
    });
  }, []); // eslint-disable-line

  const fetchRows = async (importId) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('fasih_row').select('nks, no_urut, petugas, status').eq('import_id', importId).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  };
  useEffect(() => {
    if (!cur || !imports) { setRows(cur === null && imports ? [] : null); return; }
    setRows(null); setPrev(null);
    const idx = imports.findIndex((i) => i.id === cur);
    const before = imports[idx + 1];
    Promise.all([fetchRows(cur), before ? fetchRows(before.id) : Promise.resolve(null)])
      .then(([a, b]) => { setRows(a); setPrev(b); })
      .catch((e) => { toast(errMsg(e), 'err'); setRows([]); });
  }, [cur, imports]); // eslint-disable-line

  // ---------- import ----------
  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const all = FIELDS.flatMap(([, , a]) => a);
      const t = await readTableFind(f, all);
      if (!t.rows.length) return toast('Tidak ada baris data di berkas ini', 'err');
      const saved = loadMap();
      const guess = Object.fromEntries(FIELDS.map(([k, , aliases]) => {
        if (saved[k] && t.headers.includes(saved[k])) return [k, saved[k]];
        const hit = aliases.find((a) => t.headers.includes(a)) || t.headers.find((h) => aliases.some((a) => h.includes(a)));
        return [k, hit || ''];
      }));
      setImp({ file: f, ...t, map: guess, nksMode: saved.nksMode || 'auto', tanggal: todayIso() });
    } catch (err) { toast(`Berkas tidak terbaca: ${errMsg(err)}`, 'err'); }
  }
  const mapped = useMemo(() => {
    if (!imp) return [];
    return imp.rows.map((r) => ({
      nks: imp.map.nks ? transformNks(r[imp.map.nks], imp.nksMode) : null,
      no_urut: imp.map.no_urut ? (cell(r[imp.map.no_urut]).replace(/\.0+$/, '').replace(/^\d{1,2}$/, (m) => m.padStart(3, '0')) || null) : null,
      petugas: imp.map.petugas ? cell(r[imp.map.petugas]) || null : null,
      status: imp.map.status ? cell(r[imp.map.status]) || '(kosong)' : '(kosong)',
      raw: Object.fromEntries(imp.rawHeaders.map((h, i) => [h, r[imp.headers[i]] ?? null])),
    }));
  }, [imp]);
  const knownNks = useMemo(() => new Set((sample?.nks || []).map((n) => n.nks)), [sample]);
  const matchRate = mapped.length ? mapped.filter((m) => knownNks.has(m.nks)).length / mapped.length : 0;

  async function runImport() {
    setProg({ done: 0, total: mapped.length });
    saveMap({ ...imp.map, nksMode: imp.nksMode });
    try {
      const old = imports.find((i) => i.tanggal === imp.tanggal);
      if (old) { const { error } = await supabase.from('fasih_import').delete().eq('id', old.id); if (error) throw error; }
      const { data: head, error } = await supabase.from('fasih_import')
        .insert({ tanggal: imp.tanggal, file_name: imp.file.name, n_rows: mapped.length, mapping: { ...imp.map, nksMode: imp.nksMode, sheet: imp.sheet } }).select().single();
      if (error) throw error;
      for (let i = 0; i < mapped.length; i += 500) {
        const { error: e2 } = await supabase.from('fasih_row').insert(mapped.slice(i, i + 500).map((m) => ({ ...m, import_id: head.id })));
        if (e2) { await supabase.from('fasih_import').delete().eq('id', head.id); throw e2; }
        setProg({ done: Math.min(i + 500, mapped.length), total: mapped.length });
      }
      toast(`${mapped.length} baris FASIH tanggal ${fmtDate(imp.tanggal)} tersimpan`, 'ok');
      setImp(null); loadImports(head.id);
    } catch (e) { toast(errMsg(e), 'err'); }
    setProg(null);
  }

  // ---------- summaries ----------
  const statuses = useMemo(() => {
    const c = {}; (rows || []).forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const changed = useMemo(() => {
    if (!rows || !prev) return null;
    const key = (r) => `${r.nks}|${r.no_urut}|${r.petugas}`;
    const p = new Map(prev.map((r) => [key(r), r.status]));
    let n = 0, fresh = 0; rows.forEach((r) => { const s = p.get(key(r)); if (s === undefined) fresh++; else if (s !== r.status) n++; });
    return { n, fresh };
  }, [rows, prev]);
  const view = (rows || []).filter((r) => !stF || r.status === stF);
  const byNks = useMemo(() => {
    const g = new Map();
    view.forEach((r) => { const k = r.nks || '(tanpa NKS)'; if (!g.has(k)) g.set(k, {}); const x = g.get(k); x[r.status] = (x[r.status] || 0) + 1; });
    const info = Object.fromEntries((sample?.nks || []).map((n) => [n.nks, n]));
    return [...g.entries()].map(([nks, st]) => ({ nks, st, n: Object.values(st).reduce((a, b) => a + b, 0), info: info[nks] }))
      .filter((x) => !q || `${x.nks} ${x.info?.desa || ''} ${sample?.people[x.info?.ppl_id] || ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.nks.localeCompare(b.nks));
  }, [view, sample, q]); // eslint-disable-line
  const byPetugas = useMemo(() => {
    const g = new Map();
    view.forEach((r) => { const k = r.petugas || '(tanpa petugas)'; if (!g.has(k)) g.set(k, {}); const x = g.get(k); x[r.status] = (x[r.status] || 0) + 1; });
    return [...g.entries()].map(([p, st]) => ({ p, st, n: Object.values(st).reduce((a, b) => a + b, 0) }))
      .filter((x) => !q || x.p.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.p.localeCompare(b.p));
  }, [view, q]); // eslint-disable-line
  const curImp = imports?.find((i) => i.id === cur);
  const doneTone = (st) => Object.entries(st).filter(([s]) => statusTone(s) === 'ok').reduce((a, [, n]) => a + n, 0);

  const chips = (st) => Object.entries(st).sort((a, b) => b[1] - a[1]).map(([s, n]) => <span key={s} className={`chip chip-${statusTone(s)}`} title={s}>{n} · {s}</span>);
  return (
    <Page title="Monitoring FASIH" wide
          subtitle={curImp ? `Data ${fmtDate(curImp.tanggal)} · ${curImp.n_rows} baris · diunggah ${fmtDateTime(curImp.uploaded_at)}` : 'Hasil unduhan FASIH harian'}
          actions={isAdmin && <label className="btn btn-primary"><Icon name="upload" size={18} /><span>Impor hasil FASIH</span>
            <input type="file" accept=".xlsx,.csv" hidden onChange={onFile} /></label>}>
      {!imports ? <Loading /> : !imports.length ? (
        <Empty icon="db" title="Belum ada data FASIH">{isAdmin ? 'Unduh hasil dari FASIH (Excel/CSV), lalu klik “Impor hasil FASIH”. Kolom dipetakan sekali, berikutnya otomatis.' : 'Admin belum mengimpor data FASIH.'}</Empty>
      ) : (
        <>
          <div className="toolbar">
            <label className="inline">Tanggal data
              <select value={cur || ''} onChange={(e) => setCur(Number(e.target.value))}>
                {imports.map((i) => <option key={i.id} value={i.id}>{fmtDate(i.tanggal)} · {i.n_rows} baris</option>)}
              </select></label>
            {changed && <span className="muted">Sejak {fmtDate(imports[imports.findIndex((i) => i.id === cur) + 1]?.tanggal)}: <b>{changed.n}</b> status berubah, <b>{changed.fresh}</b> baris baru</span>}
          </div>
          {!rows ? <Loading /> : (
            <>
              <div className="status-cards">
                <button className={`stc ${!stF ? 'on' : ''}`} onClick={() => setStF('')}><b>{rows.length}</b><span>Semua</span></button>
                {statuses.map(([s, n]) => (
                  <button key={s} className={`stc stc-${statusTone(s)} ${stF === s ? 'on' : ''}`} onClick={() => setStF(stF === s ? '' : s)}><b>{n}</b><span>{s}</span></button>
                ))}
              </div>
              <div className="toolbar">
                <div className="seg"><button className={tab === 'nks' ? 'on' : ''} onClick={() => setTab('nks')}>Per NKS</button>
                  <button className={tab === 'petugas' ? 'on' : ''} onClick={() => setTab('petugas')}>Per petugas</button></div>
                <div className="search"><Icon name="search" size={18} /><input placeholder={tab === 'nks' ? 'Cari NKS, desa, PPL…' : 'Cari petugas…'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
              </div>
              <Card className="table-card">
                <div className="table-wrap">
                  {tab === 'nks' ? (
                    <table className="table">
                      <thead><tr><th>NKS</th><th>Desa / PPL</th><th>Baris FASIH</th><th>Selesai</th><th>Status</th></tr></thead>
                      <tbody>{byNks.map((x) => {
                        const tgt = sample?.cnt[x.nks] || 0; const ok = doneTone(x.st);
                        return (
                          <tr key={x.nks} className={!x.info ? 'warn' : ''}>
                            <td className="mono">{x.nks}</td>
                            <td>{x.info ? <>{x.info.desa}<small className="block muted">{sample.people[x.info.ppl_id] || '—'}</small></> : <small className="t-warn">tidak ada di sampel aplikasi</small>}</td>
                            <td className="num">{x.n}{tgt ? <small className="muted"> / {tgt}</small> : ''}</td>
                            <td style={{ minWidth: 120 }}><Progress value={ok} total={Math.max(tgt, x.n)} /></td>
                            <td><div className="chips">{chips(x.st)}</div></td>
                          </tr>);
                      })}</tbody>
                    </table>
                  ) : (
                    <table className="table">
                      <thead><tr><th>Petugas</th><th>Baris</th><th>Selesai</th><th>Status</th></tr></thead>
                      <tbody>{byPetugas.map((x) => (
                        <tr key={x.p}><td>{x.p}</td><td className="num">{x.n}</td>
                          <td style={{ minWidth: 120 }}><Progress value={doneTone(x.st)} total={x.n} /></td><td><div className="chips">{chips(x.st)}</div></td></tr>))}</tbody>
                    </table>
                  )}
                </div>
              </Card>
              <p className="hint">Warna status dibaca dari kata kuncinya: approved/selesai = hijau, submitted = biru, rejected = merah, open/draft = abu-abu.</p>
            </>
          )}
        </>
      )}

      <Modal open={!!imp} title={`Impor FASIH · ${imp?.file.name || ''}`} wide onClose={() => !prog && setImp(null)}
             footer={prog ? <div style={{ flex: 1 }}><div className="progressbar-lg"><i style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div><small className="muted">{prog.done} / {prog.total} baris…</small></div> : (
               <div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setImp(null)}>Batal</Button>
                 <Button icon="db" disabled={!imp?.map.status || !imp?.tanggal} onClick={runImport}>Simpan {mapped.length} baris</Button></div>)}>
        {imp && (
          <div className="form">
            <div className="form grid2">
              <label>Tanggal data <input type="date" value={imp.tanggal} onChange={(e) => setImp((x) => ({ ...x, tanggal: e.target.value }))} /></label>
              <label>Sheet <input value={`${imp.sheet || '-'} · ${imp.rows.length} baris`} disabled /></label>
              {FIELDS.map(([k, l]) => (
                <label key={k}>Kolom {l}
                  <select value={imp.map[k]} onChange={(e) => setImp((x) => ({ ...x, map: { ...x.map, [k]: e.target.value } }))}>
                    <option value="">— tidak ada —</option>
                    {imp.headers.map((h, i) => <option key={h} value={h}>{imp.rawHeaders[i]}</option>)}
                  </select></label>
              ))}
              <label>Format NKS
                <select value={imp.nksMode} onChange={(e) => setImp((x) => ({ ...x, nksMode: e.target.value }))}>
                  <option value="auto">Apa adanya (5 digit)</option><option value="last5">Ambil 5 digit terakhir</option><option value="first5">Ambil 5 digit pertama</option></select></label>
              <div className={`notice-${matchRate > 0.8 ? 'ok' : 'empty'}`}>{Math.round(matchRate * 100)}% baris cocok dengan NKS sampel aplikasi.</div>
            </div>
            {imports?.some((i) => i.tanggal === imp.tanggal) && <div className="alert alert-warn"><Icon name="alert" /><span>Data tanggal ini sudah ada dan akan diganti.</span></div>}
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>NKS</th><th>No. urut</th><th>Petugas</th><th>Status</th></tr></thead>
                <tbody>{mapped.slice(0, 6).map((m, i) => (
                  <tr key={i} className={knownNks.has(m.nks) ? '' : 'warn'}><td className="mono">{m.nks}</td><td className="mono">{m.no_urut}</td><td>{m.petugas}</td>
                    <td><span className={`chip chip-${statusTone(m.status)}`}>{m.status}</span></td></tr>))}</tbody>
              </table>
            </div>
            <small className="muted">Seluruh kolom asli tetap disimpan. Pemetaan kolom diingat untuk impor berikutnya.</small>
          </div>
        )}
      </Modal>
    </Page>
  );
}

import { useEffect, useRef, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { fmtDateTime } from '../../lib/period';
import { Page, Card, Button, Loading, Empty, useToast } from '../../components/ui';
import '../public/Public.css';

// PML proposes a new komoditas (under a kelompok) or a new kualitas (under an existing komoditas).
export default function Usulan() {
  const toast = useToast();
  const [nksList, setNksList] = useState(null);
  const [kelompok, setKelompok] = useState([]);
  const [mine, setMine] = useState([]);
  const [jenis, setJenis] = useState('komoditas_baru');
  const [nks, setNks] = useState('');
  const [kat, setKat] = useState(null);
  const [kom, setKom] = useState(null);
  const [komQuery, setKomQuery] = useState('');
  const [komHits, setKomHits] = useState([]);
  const [openKom, setOpenKom] = useState(false);
  const [items, setItems] = useState(['']);
  const [dups, setDups] = useState({});
  const [busy, setBusy] = useState(false);
  const komTimer = useRef();

  async function loadMine() {
    const { data } = await supabase.from('usulan').select('*').order('created_at', { ascending: false }).limit(100);
    setMine(data || []);
  }
  useEffect(() => {
    (async () => {
      const [{ data: n, error }, { data: k }] = await Promise.all([
        supabase.from('nks').select('nks, desa, sls, sub, ppl_id').order('nks'),
        supabase.from('kelompok').select('*').order('kode'),
      ]);
      if (error) toast(errMsg(error), 'err');
      const ids = (n || []).map((x) => x.ppl_id).filter(Boolean);
      const { data: p } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
      const pn = Object.fromEntries((p || []).map((x) => [x.id, x.full_name]));
      setNksList((n || []).map((x) => ({ ...x, ppl: pn[x.ppl_id] })));
      if ((n || []).length === 1) setNks(n[0].nks);
      setKelompok(k || []);
    })();
    loadMine();
  }, []); // eslint-disable-line

  function onKomQuery(v) {
    setKomQuery(v); setKom(null); setOpenKom(true);
    clearTimeout(komTimer.current);
    const words = v.replace(/[%*,()."'\\:]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5);
    if (words.join('').length < 2) { setKomHits([]); return; }
    // every word must match the komoditas name (a number matches the code prefix)
    const tree = `and(${words.map((w) => (/^\d+$/.test(w) ? `kode_komoditas.ilike.${w}*` : `nama_komoditas.ilike.*${w}*`)).join(',')})`;
    komTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('komoditas').select('kode_komoditas, nama_komoditas, kelompok')
        .or(tree).order('kode_komoditas').limit(300);
      const seen = new Set(); const uniq = [];
      (data || []).forEach((d) => { if (!seen.has(d.kode_komoditas)) { seen.add(d.kode_komoditas); uniq.push(d); } });
      setKomHits(uniq.slice(0, 30));
    }, 250);
  }
  async function checkDup(i, v) {
    const t = v.trim();
    if (jenis !== 'kualitas_baru' || !kom || t.length < 2) { setDups((d) => ({ ...d, [i]: null })); return; }
    const { data } = await supabase.from('komoditas').select('kode_kualitas, nama_kualitas')
      .eq('kode_komoditas', kom.kode_komoditas).ilike('nama_kualitas', t).limit(1);
    setDups((d) => ({ ...d, [i]: data?.[0] || null }));
  }
  const setItem = (i, v) => { setItems((a) => a.map((x, j) => (j === i ? v : x))); checkDup(i, v); };
  const reset = () => { setKat(null); setKom(null); setKomQuery(''); setItems(['']); setDups({}); };

  async function submit() {
    if (!nks) return toast('Pilih NKS dulu', 'err');
    if (jenis === 'komoditas_baru' && !kat) return toast('Pilih kategori (kelompok)', 'err');
    if (jenis === 'kualitas_baru' && !kom) return toast('Pilih komoditas dulu', 'err');
    const clean = items.map((x) => x.trim()).filter(Boolean);
    if (!clean.length) return toast('Isi minimal satu usulan', 'err');
    setBusy(true);
    const { data, error } = await supabase.rpc('submit_usulan', { payload: {
      nks, jenis, items: clean,
      kelompok_kode: jenis === 'komoditas_baru' ? kat.kode : undefined,
      kode_komoditas: jenis === 'kualitas_baru' ? kom.kode_komoditas : undefined,
      nama_komoditas: jenis === 'kualitas_baru' ? kom.nama_komoditas : undefined,
    } });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast(`${data.added} usulan terkirim (Triwulan ${data.triwulan})`, 'ok');
    reset(); loadMine();
  }

  if (!nksList) return <Page title="Usulan Komoditas"><Loading /></Page>;
  const sel = nksList.find((x) => x.nks === nks);

  return (
    <Page title="Usulan Komoditas" subtitle="Komoditas atau kualitas baru">
      {!nksList.length ? <Empty icon="map" title="Belum ada NKS">Admin belum menugaskan NKS ke Anda.</Empty> : (
        <>
          <div className="seg-full">
            <button className={jenis === 'komoditas_baru' ? 'on' : ''} onClick={() => { setJenis('komoditas_baru'); reset(); }}>Komoditas baru</button>
            <button className={jenis === 'kualitas_baru' ? 'on' : ''} onClick={() => { setJenis('kualitas_baru'); reset(); }}>Kualitas baru</button>
          </div>
          <div className="form">
            <label>NKS
              <select value={nks} onChange={(e) => setNks(e.target.value)}>
                <option value="">— pilih NKS —</option>
                {nksList.map((n) => <option key={n.nks} value={n.nks}>{n.nks} · {n.desa}</option>)}
              </select></label>
            {sel && <small className="muted" style={{ marginTop: -8 }}>SLS {sel.sls}/{sel.sub} · PPL {sel.ppl || '—'}</small>}

            {jenis === 'komoditas_baru' ? (
              <div>
                <label>Kategori (Kelompok)</label>
                <div className="kat-grid" style={{ marginTop: 6 }}>
                  {kelompok.map((k) => (
                    <button key={k.kode} type="button" className={`kat ${kat?.kode === k.kode ? 'on' : ''}`} onClick={() => setKat(k)}>
                      <span className="kk">{k.kode}</span><span>{k.nama}</span>
                    </button>
                  ))}
                </div>
                {!kelompok.length && <div className="notice-empty mt">Master komoditas belum diimpor admin.</div>}
              </div>
            ) : (
              <label>Komoditas (yang sudah ada)
                <div className="combo">
                  <input value={komQuery} placeholder="Cari komoditas, mis. BERAS…" autoComplete="off"
                    onChange={(e) => onKomQuery(e.target.value)} onFocus={() => setOpenKom(true)}
                    onBlur={() => setTimeout(() => setOpenKom(false), 150)} />
                  <div className={`combo-list ${openKom && komHits.length ? 'open' : ''}`}>
                    {komHits.map((k) => (
                      <div key={k.kode_komoditas} className="opt" onMouseDown={() => { setKom(k); setKomQuery(k.nama_komoditas); setOpenKom(false); setItems(['']); setDups({}); }}>
                        <b>{k.nama_komoditas}</b><small>{k.kode_komoditas} · {k.kelompok}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </label>
            )}

            {((jenis === 'komoditas_baru' && kat) || (jenis === 'kualitas_baru' && kom)) && (
              <div>
                <label>{jenis === 'komoditas_baru' ? 'Nama komoditas yang diusulkan' : `Kualitas baru untuk ${kom.nama_komoditas}`}</label>
                <div style={{ marginTop: 6 }}>
                  {items.map((v, i) => (
                    <div key={i}>
                      <div className="kom-row">
                        <input value={v} maxLength={200} placeholder="Ketik nama…" onChange={(e) => setItem(i, e.target.value)} />
                        {items.length > 1 && <button type="button" className="kom-del" onClick={() => { setItems((a) => a.filter((_, j) => j !== i)); setDups({}); }}>×</button>}
                      </div>
                      {dups[i] && <div className="dupwarn">Sudah ada di master: <b>{dups[i].kode_kualitas}</b> — {dups[i].nama_kualitas}.</div>}
                    </div>
                  ))}
                  <button type="button" className="add-kom" onClick={() => setItems((a) => [...a, ''])}>+ Tambah</button>
                </div>
                <Button className="block mt" busy={busy} icon="send" onClick={submit}>Kirim usulan</Button>
              </div>
            )}
          </div>
        </>
      )}

      <h2 className="sec">Usulan saya</h2>
      {!mine.length ? <p className="hint">Belum ada usulan.</p> : (
        <Card className="list">
          {mine.map((u) => (
            <div key={u.id} className="row static">
              <span className="row-tx">
                <b>{u.usulan}</b>
                <small>{u.jenis === 'kualitas_baru' ? `Kualitas · ${u.nama_komoditas}` : `Komoditas · ${u.kelompok}`} · NKS {u.nks} · {fmtDateTime(u.created_at)}</small>
              </span>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}

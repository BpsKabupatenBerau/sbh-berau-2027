import { useEffect, useRef, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { Button, Spinner, Icon, useToast } from '../../components/ui';
import PublicTop from './PublicTop';
import './Public.css';

// Public, no login: propose a new komoditas or a new kualitas. Reuses the NKS cascade
// from usulan_nks and the 12 Kelompok as kategori; dup-checks against the 41k master.
export default function Usulan() {
  const toast = useToast();
  const [nksList, setNksList] = useState([]);
  const [kelompok, setKelompok] = useState([]);
  const [ready, setReady] = useState(false);

  const [jenis, setJenis] = useState('komoditas_baru');
  const [nks, setNks] = useState(null);
  const [nksQuery, setNksQuery] = useState('');
  const [openNks, setOpenNks] = useState(false);
  const [kat, setKat] = useState(null);              // komoditas_baru: a kelompok
  const [kom, setKom] = useState(null);              // kualitas_baru: a komoditas
  const [komQuery, setKomQuery] = useState('');
  const [komHits, setKomHits] = useState([]);
  const [openKom, setOpenKom] = useState(false);
  const [items, setItems] = useState(['']);
  const [dups, setDups] = useState({});
  const [pengusul, setPengusul] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const komTimer = useRef();

  useEffect(() => {
    Promise.all([
      supabase.from('usulan_nks').select('*').order('nks'),
      supabase.from('kelompok').select('*').order('kode'),
    ]).then(([a, b]) => {
      if (a.error || b.error) toast(errMsg(a.error || b.error), 'err');
      setNksList(a.data || []); setKelompok(b.data || []); setReady(true);
    });
  }, []); // eslint-disable-line

  const nksHits = nksList.filter((n) => {
    const q = nksQuery.toLowerCase().trim();
    return !q || `${n.nks} ${n.kelurahan} ${n.nama_ppl} ${n.nama_pml}`.toLowerCase().includes(q);
  }).slice(0, 50);

  // search komoditas (for kualitas_baru) — server-side, debounced
  function onKomQuery(v) {
    setKomQuery(v); setKom(null); setOpenKom(true);
    clearTimeout(komTimer.current);
    if (v.trim().length < 2) { setKomHits([]); return; }
    komTimer.current = setTimeout(async () => {
      const term = v.trim().replace(/[%*,()]/g, ' ').trim(); // PostgREST .or() uses * wildcards
      const { data } = await supabase.from('komoditas')
        .select('kode_komoditas, nama_komoditas, kelompok')
        .or(`nama_komoditas.ilike.*${term}*,kode_komoditas.ilike.${term}*`)
        .limit(200);
      const seen = new Set(); const uniq = [];
      (data || []).forEach((d) => { if (!seen.has(d.kode_komoditas)) { seen.add(d.kode_komoditas); uniq.push(d); } });
      setKomHits(uniq.slice(0, 30));
    }, 250);
  }

  // dup-check each typed item against the master kualitas list of the chosen komoditas
  async function checkDup(idx, val) {
    const v = val.trim();
    if (jenis === 'kualitas_baru' && kom && v.length >= 2) {
      const { data } = await supabase.from('komoditas')
        .select('kode_kualitas, nama_kualitas').eq('kode_komoditas', kom.kode_komoditas)
        .ilike('nama_kualitas', v).limit(1);
      setDups((d) => ({ ...d, [idx]: data && data[0] ? data[0] : null }));
    } else setDups((d) => ({ ...d, [idx]: null }));
  }

  const setItem = (i, v) => { setItems((a) => a.map((x, j) => (j === i ? v : x))); checkDup(i, v); };
  const addItem = () => setItems((a) => [...a, '']);
  const delItem = (i) => { setItems((a) => a.filter((_, j) => j !== i)); setDups((d) => { const n = { ...d }; delete n[i]; return n; }); };

  function pickNks(n) { setNks(n); setNksQuery(`${n.nks} — ${n.kelurahan}`); setOpenNks(false); }
  function pickKom(k) { setKom(k); setKomQuery(`${k.nama_komoditas}`); setOpenKom(false); setItems(['']); setDups({}); }

  async function submit() {
    if (!nks) return toast('Pilih NKS dulu', 'err');
    if (jenis === 'komoditas_baru' && !kat) return toast('Pilih kategori (kelompok)', 'err');
    if (jenis === 'kualitas_baru' && !kom) return toast('Pilih komoditas dulu', 'err');
    const clean = items.map((x) => x.trim()).filter(Boolean);
    if (!clean.length) return toast('Isi minimal satu usulan', 'err');
    setBusy(true);
    const { data, error } = await supabase.rpc('submit_usulan', {
      payload: {
        nks: nks.nks, jenis,
        kelompok_kode: jenis === 'komoditas_baru' ? kat.kode : undefined,
        kode_komoditas: jenis === 'kualitas_baru' ? kom.kode_komoditas : undefined,
        nama_komoditas: jenis === 'kualitas_baru' ? kom.nama_komoditas : undefined,
        pengusul, items: clean,
      },
    });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setDone({ n: data.added, tw: data.triwulan });
    setNks(null); setNksQuery(''); setKat(null); setKom(null); setKomQuery(''); setItems(['']); setDups({}); setPengusul('');
    window.scrollTo(0, 0);
  }

  return (
    <div className="pub">
      <PublicTop other={{ to: '/katalog', label: 'Katalog' }} />
      <div className="pub-wrap">
        <h1>Usulan Komoditas Baru</h1>
        <p className="lead">Usulkan komoditas atau kualitas baru untuk SPKRT 2027. Tanpa login.</p>

        {done && (
          <div className="ok-box">✓ {done.n} usulan terkirim (Triwulan {done.tw}). Terima kasih.
            <div style={{ fontWeight: 400, marginTop: 4 }}>Kirim lagi di bawah bila perlu.</div></div>
        )}

        {!ready ? <Spinner /> : (
          <>
            <div className="seg-full">
              <button className={jenis === 'komoditas_baru' ? 'on' : ''} onClick={() => { setJenis('komoditas_baru'); setItems(['']); setDups({}); }}>Komoditas baru</button>
              <button className={jenis === 'kualitas_baru' ? 'on' : ''} onClick={() => { setJenis('kualitas_baru'); setItems(['']); setDups({}); }}>Kualitas baru</button>
            </div>

            {/* NKS cascade */}
            <label className="fld">NKS <span className="req">*</span>
              <div className="combo">
                <input value={nksQuery} placeholder="Ketik NKS / kelurahan / nama PPL…" autoComplete="off"
                  onChange={(e) => { setNksQuery(e.target.value); setNks(null); setOpenNks(true); }}
                  onFocus={() => setOpenNks(true)} onBlur={() => setTimeout(() => setOpenNks(false), 150)} />
                <div className={`combo-list ${openNks ? 'open' : ''}`}>
                  {nksHits.length ? nksHits.map((n) => (
                    <div key={n.nks} className="opt" onMouseDown={() => pickNks(n)}>
                      <b>{n.nks}</b> — {n.kelurahan}<small>PPL {n.nama_ppl} · PML {n.nama_pml}</small>
                    </div>
                  )) : <div className="opt" style={{ color: 'var(--muted)' }}>Tidak ada kecocokan</div>}
                </div>
              </div>
            </label>
            {nks && (
              <div className="card pad" style={{ margin: '4px 0 14px' }}>
                <div className="kv"><span>Kelurahan</span><b>{nks.kelurahan}</b></div>
                <div className="kv"><span>SLS / Sub</span><b>{nks.sls}/{nks.sub}</b></div>
                <div className="kv"><span>PML / PPL</span><b>{nks.nama_pml} / {nks.nama_ppl}</b></div>
              </div>
            )}

            {/* komoditas_baru: pick kategori */}
            {jenis === 'komoditas_baru' ? (
              <>
                <label className="fld">Kategori (Kelompok) <span className="req">*</span></label>
                <div className="kat-grid">
                  {kelompok.map((k) => (
                    <button key={k.kode} className={`kat ${kat?.kode === k.kode ? 'on' : ''}`} onClick={() => setKat(k)}>
                      <span className="kk">{k.kode}</span><span>{k.nama}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <label className="fld">Komoditas (yang sudah ada) <span className="req">*</span>
                <div className="combo">
                  <input value={komQuery} placeholder="Cari komoditas, mis. BERAS…" autoComplete="off"
                    onChange={(e) => onKomQuery(e.target.value)} onFocus={() => setOpenKom(true)}
                    onBlur={() => setTimeout(() => setOpenKom(false), 150)} />
                  <div className={`combo-list ${openKom && komHits.length ? 'open' : ''}`}>
                    {komHits.map((k) => (
                      <div key={k.kode_komoditas} className="opt" onMouseDown={() => pickKom(k)}>
                        <b>{k.nama_komoditas}</b><small>{k.kode_komoditas} · {k.kelompok}</small>
                      </div>
                    ))}
                  </div>
                </div>
                <small className="muted">Kualitas baru diusulkan di bawah komoditas ini.</small>
              </label>
            )}

            {/* items */}
            {((jenis === 'komoditas_baru' && kat) || (jenis === 'kualitas_baru' && kom)) && (
              <>
                <label className="fld" style={{ marginTop: 14 }}>
                  {jenis === 'komoditas_baru' ? 'Nama komoditas yang diusulkan' : `Kualitas baru untuk ${kom.nama_komoditas}`} <span className="req">*</span>
                </label>
                {items.map((v, i) => (
                  <div key={i}>
                    <div className="kom-row">
                      <input value={v} maxLength={200} placeholder="Ketik nama…" onChange={(e) => setItem(i, e.target.value)} />
                      {items.length > 1 && <button className="kom-del" onClick={() => delItem(i)}>×</button>}
                    </div>
                    {dups[i] && <div className="dupwarn">Sudah ada di master: <b>{dups[i].kode_kualitas}</b> — {dups[i].nama_kualitas}. Tetap bisa dikirim bila berbeda.</div>}
                  </div>
                ))}
                <button className="add-kom" onClick={addItem}>+ Tambah</button>

                <label className="fld" style={{ marginTop: 14 }}>Nama pengusul (opsional)
                  <input value={pengusul} onChange={(e) => setPengusul(e.target.value)} placeholder="Nama Anda" /></label>

                <Button className="block mt" busy={busy} icon="upload" onClick={submit}>Kirim usulan</Button>
              </>
            )}
          </>
        )}
        <div className="pub-foot">SBH 2027 · BPS Kabupaten Berau</div>
      </div>
    </div>
  );
}

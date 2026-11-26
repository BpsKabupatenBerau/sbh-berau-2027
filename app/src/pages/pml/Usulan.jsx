import { useEffect, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { fmtDateTime } from '../../lib/period';
import { Page, Card, Button, Icon, Loading, Empty, useToast } from '../../components/ui';
import '../public/Public.css';

// PML proposes new kualitas: drill Kelompok→Subkelompok→Kelas→Komoditas, stage kualitas for several komoditas, submit all.
export default function Usulan() {
  const toast = useToast();
  const [nksList, setNksList] = useState(null);
  const [kelompok, setKelompok] = useState([]);
  const [mine, setMine] = useState([]);
  const [nks, setNks] = useState('');

  // cascade selections + option lists
  const [kel, setKel] = useState('');
  const [sub, setSub] = useState('');
  const [kls, setKls] = useState('');
  const [kom, setKom] = useState(null);     // { kode, nama }
  const [subs, setSubs] = useState([]);
  const [klsList, setKlsList] = useState([]);
  const [koms, setKoms] = useState([]);
  const [loadingLvl, setLoadingLvl] = useState('');

  // staged proposals — survive cascade changes
  const [name, setName] = useState('');
  const [dup, setDup] = useState(null);
  const [cart, setCart] = useState([]);     // [{ komKode, komNama, text }]
  const [busy, setBusy] = useState(false);

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

  async function rpc(fn, arg, setter, lvl) {
    setLoadingLvl(lvl); setter([]);
    const { data, error } = await supabase.rpc(fn, arg);
    setLoadingLvl('');
    if (error) return toast(errMsg(error), 'err');
    setter(data || []);
  }
  const clearInput = () => { setName(''); setDup(null); };   // NB: does NOT clear the cart
  function pickKelompok(v) { setKel(v); setSub(''); setKls(''); setKom(null); setKlsList([]); setKoms([]); clearInput(); if (v) rpc('komoditas_subkelompok', { p_kelompok: v }, setSubs, 'sub'); else setSubs([]); }
  function pickSub(v) { setSub(v); setKls(''); setKom(null); setKoms([]); clearInput(); if (v) rpc('komoditas_kelas', { p_subkelompok: v }, setKlsList, 'kls'); else setKlsList([]); }
  function pickKelas(v) { setKls(v); setKom(null); clearInput(); if (v) rpc('komoditas_by_kelas', { p_kelas: v }, setKoms, 'kom'); else setKoms([]); }
  function pickKom(kode) { setKom(koms.find((x) => x.kode === kode) || null); clearInput(); }

  async function checkDup(v) {
    const t = v.trim();
    if (!kom || t.length < 2) { setDup(null); return; }
    const { data } = await supabase.from('komoditas').select('kode_kualitas, nama_kualitas')
      .eq('kode_komoditas', kom.kode).ilike('nama_kualitas', t).limit(1);
    setDup(data?.[0] || null);
  }
  function addToCart() {
    if (!kom) return toast('Pilih komoditas dulu', 'err');
    const t = name.trim();
    if (!t) return;
    setCart((c) => (c.some((x) => x.komKode === kom.kode && x.text.toLowerCase() === t.toLowerCase())
      ? c : [...c, { komKode: kom.kode, komNama: kom.nama, text: t }]));
    clearInput();
  }

  async function submit() {
    if (!nks) return toast('Pilih NKS dulu', 'err');
    const all = [...cart];
    if (kom && name.trim()) all.push({ komKode: kom.kode, komNama: kom.nama, text: name.trim() });
    if (!all.length) return toast('Tambahkan minimal satu kualitas', 'err');
    setBusy(true);
    try {
      const groups = {};
      all.forEach((x) => { (groups[x.komKode] ||= { nama: x.komNama, items: [] }).items.push(x.text); });
      let added = 0, tw;
      for (const [kode, g] of Object.entries(groups)) {
        const { data, error } = await supabase.rpc('submit_usulan', { payload: {
          nks, jenis: 'kualitas_baru', items: g.items, kode_komoditas: kode, nama_komoditas: g.nama } });
        if (error) throw error;
        added += data.added; tw = data.triwulan;
      }
      toast(`${added} usulan terkirim (Triwulan ${tw})`, 'ok');
      setKel(''); setSub(''); setKls(''); setKom(null); setSubs([]); setKlsList([]); setKoms([]); setCart([]); clearInput();
      loadMine();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }

  if (!nksList) return <Page title="Usulan Kualitas"><Loading /></Page>;
  const sel = nksList.find((x) => x.nks === nks);
  const ph = (loading) => (loading ? 'Memuat…' : '— pilih —');

  return (
    <Page title="Usulan Kualitas" subtitle="Usulkan kualitas baru untuk komoditas yang sudah ada">
      {!nksList.length ? <Empty icon="map" title="Belum ada NKS">Admin belum menugaskan NKS ke Anda.</Empty> : (
        <div className="form">
          <label>NKS
            <select value={nks} onChange={(e) => setNks(e.target.value)}>
              <option value="">— pilih NKS —</option>
              {nksList.map((n) => <option key={n.nks} value={n.nks}>{n.nks} · {n.desa}</option>)}
            </select></label>
          {sel && <small className="muted" style={{ marginTop: -8 }}>SLS {sel.sls}/{sel.sub} · PPL {sel.ppl || '—'}</small>}

          <div className="form grid2">
            <label>Kelompok
              <select value={kel} onChange={(e) => pickKelompok(e.target.value)}>
                <option value="">{kelompok.length ? '— pilih kelompok —' : 'Master belum diimpor'}</option>
                {kelompok.map((k) => <option key={k.kode} value={k.kode}>{k.kode} · {k.nama}</option>)}
              </select></label>
            <label>Subkelompok
              <select value={sub} onChange={(e) => pickSub(e.target.value)} disabled={!kel || loadingLvl === 'sub'}>
                <option value="">{ph(loadingLvl === 'sub')}</option>
                {subs.map((s) => <option key={s.kode} value={s.kode}>{s.kode} · {s.nama}</option>)}
              </select></label>
            <label>Kelas
              <select value={kls} onChange={(e) => pickKelas(e.target.value)} disabled={!sub || loadingLvl === 'kls'}>
                <option value="">{ph(loadingLvl === 'kls')}</option>
                {klsList.map((c) => <option key={c.kode} value={c.kode}>{c.kode} · {c.nama}</option>)}
              </select></label>
            <label>Komoditas
              <select value={kom?.kode || ''} onChange={(e) => pickKom(e.target.value)} disabled={!kls || loadingLvl === 'kom'}>
                <option value="">{ph(loadingLvl === 'kom')}</option>
                {koms.map((k) => <option key={k.kode} value={k.kode}>{k.kode} · {k.nama}</option>)}
              </select></label>
          </div>

          {kom && (
            <div>
              <label>Nama kualitas baru untuk <b>{kom.nama}</b></label>
              <div className="kom-row" style={{ marginTop: 6 }}>
                <input value={name} maxLength={200} placeholder="mis. IR 64 SUPER" autoComplete="off"
                       onChange={(e) => { setName(e.target.value); checkDup(e.target.value); }}
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToCart(); } }} />
                <button type="button" className="add-kom" style={{ width: 'auto', whiteSpace: 'nowrap' }} onClick={addToCart}>+ Tambah</button>
              </div>
              {dup && <div className="dupwarn">Sudah ada di master: <b>{dup.kode_kualitas}</b> — {dup.nama_kualitas}.</div>}
              <p className="hint" style={{ justifyContent: 'flex-start' }}>Bisa ganti kelompok/komoditas lalu tambah lagi — daftar di bawah tetap tersimpan sampai dikirim.</p>
            </div>
          )}

          {cart.length > 0 && (
            <div>
              <label>Daftar usulan ({cart.length})</label>
              <div className="usul-cart" style={{ marginTop: 6 }}>
                {cart.map((c, i) => (
                  <div key={i} className="usul-item">
                    <span className="usul-tx"><b>{c.text}</b><small>{c.komKode} · {c.komNama}</small></span>
                    <button type="button" className="usul-del" aria-label="Hapus" onClick={() => setCart((a) => a.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(cart.length > 0 || (kom && name.trim())) && (
            <Button className="block mt" busy={busy} icon="send" onClick={submit}>Kirim usulan</Button>
          )}
        </div>
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

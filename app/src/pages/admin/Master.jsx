import { useEffect, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { readTable, pick, cell, padCode } from '../../lib/excel';
import { Page, Card, Button, Icon, Loading, useToast } from '../../components/ui';

const CHUNK = 1000;

function parseRow(r) {
  const full = cell(pick(r, ['kodekualitaslengkap'])) || (/^\d{10}$/.test(cell(pick(r, ['kodekualitas']))) ? cell(pick(r, ['kodekualitas'])) : '');
  const kom = cell(pick(r, ['kodekomoditaslengkap'])) || (/^\d{7}$/.test(cell(pick(r, ['kodekomoditas']))) ? cell(pick(r, ['kodekomoditas'])) : full.slice(0, 7));
  return {
    kode_kualitas: padCode(full, 10),
    kode_komoditas: padCode(kom, 7),
    kelompok_kode: padCode(pick(r, ['kelompokkode', 'kodekelompok']) ?? full.slice(0, 2), 2),
    kelompok: cell(pick(r, ['kelompok', 'namakelompok'])),
    subkelompok: cell(pick(r, ['subkelompok'])) || null,
    kelas: cell(pick(r, ['kelas'])) || null,
    nama_komoditas: cell(pick(r, ['namakomoditas'])),
    nama_kualitas: cell(pick(r, ['namakualitas'])),
  };
}

// Admin: load the SPKRT komoditas/kualitas master into Supabase from the browser.
export default function Master() {
  const toast = useToast();
  const [stat, setStat] = useState(null);
  const [prev, setPrev] = useState(null);     // parsed file
  const [prog, setProg] = useState(null);     // { done, total }

  async function loadStat() {
    const [a, b] = await Promise.all([
      supabase.from('komoditas').select('kode_kualitas', { count: 'exact', head: true }),
      supabase.from('kelompok').select('kode', { count: 'exact', head: true }),
    ]);
    setStat({ kualitas: a.count ?? 0, kelompok: b.count ?? 0, error: a.error?.message || b.error?.message });
  }
  useEffect(() => { loadStat(); }, []);

  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setPrev({ loading: true, name: f.name });
    try {
      const { rows } = await readTable(f);
      const seen = new Map(); let bad = 0, dup = 0;
      rows.forEach((r) => {
        const x = parseRow(r);
        if (!/^\d{10}$/.test(x.kode_kualitas) || !x.nama_komoditas || !x.nama_kualitas || !x.kelompok) { bad++; return; }
        if (seen.has(x.kode_kualitas)) { dup++; return; }
        seen.set(x.kode_kualitas, x);
      });
      const list = [...seen.values()];
      const kel = new Map(); list.forEach((x) => kel.set(x.kelompok_kode, x.kelompok));
      setPrev({ name: f.name, list, kel: [...kel.entries()].sort(), bad, dup, kom: new Set(list.map((x) => x.kode_komoditas)).size });
    } catch (err) { setPrev(null); toast(`Berkas tidak terbaca: ${errMsg(err)}`, 'err'); }
  }

  async function run() {
    const { list, kel } = prev;
    setProg({ done: 0, total: list.length });
    const { error: ek } = await supabase.from('kelompok').upsert(kel.map(([kode, nama]) => ({ kode, nama })), { onConflict: 'kode' });
    if (ek) { setProg(null); return toast(errMsg(ek), 'err'); }
    for (let i = 0; i < list.length; i += CHUNK) {
      const { error } = await supabase.from('komoditas').upsert(list.slice(i, i + CHUNK), { onConflict: 'kode_kualitas' });
      if (error) { setProg(null); return toast(`Gagal di baris ${i + 1}: ${errMsg(error)}`, 'err'); }
      setProg({ done: Math.min(i + CHUNK, list.length), total: list.length });
    }
    toast(`${list.length.toLocaleString('id-ID')} kualitas diimpor`, 'ok');
    setProg(null); setPrev(null); loadStat();
  }

  return (
    <Page title="Master Komoditas" subtitle="Sumber data Katalog publik & Usulan PML">
      <Card className="pad">
        {!stat ? <Loading /> : stat.error ? (
          <div className="notice-empty" style={{ margin: '10px 0' }}>Tabel belum ada: jalankan <b>003_komoditas.sql</b> lalu <b>004_spkrt_v2.sql</b> di Supabase. ({stat.error})</div>
        ) : (
          <>
            <div className="kv"><span>Kualitas tersimpan</span><b>{stat.kualitas.toLocaleString('id-ID')}</b></div>
            <div className="kv"><span>Kelompok</span><b>{stat.kelompok}</b></div>
            <div className="kv"><span>Katalog publik</span><b><a href="#/katalog" target="_blank" rel="noreferrer">Buka katalog</a></b></div>
          </>
        )}
      </Card>
      {stat && !stat.error && stat.kualitas === 0 && (
        <div className="alert alert-warn mt"><Icon name="alert" /><span>Master masih kosong, sehingga Katalog dan Usulan belum bisa dipakai. Impor berkas di bawah.</span></div>
      )}

      <h2 className="sec">Impor / perbarui master</h2>
      {!prev ? (
        <label className="drop">
          <Icon name="upload" size={36} />
          <b>Pilih berkas master</b>
          <small><span className="mono">Master_Komoditas_Kualitas_SPKRT_2027.xlsx</span> (sheet Kualitas) atau <span className="mono">komoditas_master.csv</span></small>
          <input type="file" accept=".xlsx,.csv" hidden onChange={onFile} />
        </label>
      ) : prev.loading ? <Loading text={`Membaca ${prev.name}… (±41 ribu baris)`} /> : (
        <Card className="pad">
          <div className="kv"><span>Berkas</span><b>{prev.name}</b></div>
          <div className="kv"><span>Kualitas valid</span><b>{prev.list.length.toLocaleString('id-ID')}</b></div>
          <div className="kv"><span>Komoditas</span><b>{prev.kom.toLocaleString('id-ID')}</b></div>
          <div className="kv"><span>Kelompok</span><b>{prev.kel.length}</b></div>
          {(prev.bad > 0 || prev.dup > 0) && <div className="kv"><span>Dilewati</span><b className="t-warn">{prev.bad} tidak lengkap · {prev.dup} kode ganda</b></div>}
          {prog ? (
            <div style={{ padding: '12px 0' }}>
              <div className="progressbar-lg"><i style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></div>
              <small className="muted">{prog.done.toLocaleString('id-ID')} / {prog.total.toLocaleString('id-ID')} baris…</small>
            </div>
          ) : (
            <div className="btn-row" style={{ padding: '12px 0 4px' }}>
              <Button variant="ghost" onClick={() => setPrev(null)}>Batal</Button>
              <Button icon="db" disabled={!prev.list.length} onClick={run}>Impor ke Supabase</Button>
            </div>
          )}
        </Card>
      )}
      <p className="hint">Baris dengan kode yang sudah ada akan diperbarui. Buku 5 memuat 2 kode ganda; yang pertama dipakai.</p>
    </Page>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { Icon, Spinner, Empty, useToast } from '../../components/ui';
import PublicTop from './PublicTop';
import './Public.css';

const PAGE = 50;

/**
 * Every word must appear somewhere (komoditas, kualitas, kelas — and a number
 * also matches the code prefix). So "beras cap ayam" finds "BERAS - CAP AYAM",
 * and "77" finds "BERAS - 77" (the kualitas name), not only codes.
 * PostgREST logic tree: or=(and(or(...),or(...))) — `*` is the ilike wildcard.
 */
function searchFilter(raw) {
  const words = raw.replace(/[%*,()."'\\:]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return null;
  const one = (w) => {
    const base = `nama_komoditas.ilike.*${w}*,nama_kualitas.ilike.*${w}*,kelas.ilike.*${w}*`;
    return /^\d+$/.test(w) ? `or(${base},kode_kualitas.ilike.${w}*)` : `or(${base})`;
  };
  return `and(${words.map(one).join(',')})`;
}

// Public, no login: browse/search the full komoditas + kualitas master.
export default function Katalog() {
  const toast = useToast();
  const [kelompok, setKelompok] = useState([]);
  const [kat, setKat] = useState('');       // '' = all
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [found, setFound] = useState(null); // results for current search
  const [master, setMaster] = useState(null); // whole master size
  const [problem, setProblem] = useState('');
  const timer = useRef();

  useEffect(() => {
    supabase.from('kelompok').select('*').order('kode').then(({ data }) => setKelompok(data || []));
    supabase.from('komoditas').select('kode_kualitas', { count: 'exact', head: true }).then(({ count }) => setMaster(count ?? null));
  }, []);

  const search = useCallback(async (append) => {
    const from = append ? rows.length : 0;
    let query = supabase.from('komoditas')
      .select('kode_kualitas, kode_komoditas, kelompok_kode, kelompok, kelas, nama_komoditas, nama_kualitas', { count: from ? undefined : 'exact' })
      .order('kode_kualitas').range(from, from + PAGE - 1);
    if (kat) query = query.eq('kelompok_kode', kat);
    const f = searchFilter(q);
    if (f) query = query.or(f);
    const { data, error, count } = await query;
    if (error) {
      setProblem(/does not exist|schema cache|relation/i.test(error.message) ? 'table' : 'error');
      toast(errMsg(error), 'err'); setRows([]); return;
    }
    setProblem('');
    setRows(append ? [...rows, ...data] : data);
    setMore(data.length === PAGE);
    if (!append && count != null) setFound(count);
  }, [kat, q, rows, toast]);

  useEffect(() => { setRows(null); timer.current = setTimeout(() => search(false), 250); return () => clearTimeout(timer.current); }, [kat, q]); // eslint-disable-line

  const empty = master === 0;
  const katNama = kelompok.find((k) => k.kode === kat)?.nama;

  return (
    <div className="pub">
      <PublicTop />
      <div className="pub-wrap wide">
        <div className="kat-hero">
          <span className="kat-hero-ic"><Icon name="db" size={28} /></span>
          <div className="kat-hero-tx">
            <h1>Katalog Komoditas &amp; Kualitas</h1>
            <p>Master kode SPKRT 2027{master ? <> · <b>{master.toLocaleString('id-ID')}</b> kualitas</> : ''}</p>
          </div>
          <div className="kat-hero-search">
            <Icon name="search" size={20} />
            <input placeholder="Cari nama atau kode, mis. beras cap ayam atau 0111001…" value={q}
                   onChange={(e) => setQ(e.target.value)} inputMode="search" autoFocus />
            {q && <button className="search-x" onClick={() => setQ('')} aria-label="Hapus"><Icon name="x" size={16} /></button>}
          </div>
        </div>

        <div className="kat-controls">
          <label className="kat-select">
            <Icon name="layers" size={16} />
            <select value={kat} onChange={(e) => setKat(e.target.value)}>
              <option value="">Semua kategori ({kelompok.length})</option>
              {kelompok.map((k) => <option key={k.kode} value={k.kode}>{k.kode} · {k.nama}</option>)}
            </select>
          </label>
          {found != null && !empty && !problem && <span className="kat-count">{found.toLocaleString('id-ID')} hasil{kat ? ` · ${katNama}` : ''}</span>}
        </div>

        {problem === 'table' ? (
          <div className="notice-empty">Tabel katalog belum dibuat. Admin: jalankan <b>003_komoditas.sql</b> dan <b>004_spkrt_v2.sql</b> di Supabase.</div>
        ) : empty ? (
          <div className="notice-empty">Master komoditas belum diimpor. Admin dapat mengimpornya lewat menu <b>Master Komoditas</b> setelah login.</div>
        ) : rows == null ? <Spinner /> : !rows.length ? (
          <Empty icon="search" title="Tidak ditemukan">Coba kata kunci lain, kurangi jumlah kata, atau pilih kategori “Semua”.</Empty>
        ) : (
          <div className="card">
            {rows.map((r) => (
              <div key={r.kode_kualitas} className="cat-item">
                <div className="ci-top">
                  <b>{r.nama_komoditas} - {r.nama_kualitas}</b>
                  <span className="kode">{r.kode_kualitas}</span>
                </div>
                <small><span className="tag">{r.kelompok_kode}</span> {r.kelas || r.kelompok}</small>
              </div>
            ))}
            {more && <button className="load-more" onClick={() => search(true)}>Muat lebih banyak</button>}
          </div>
        )}
        <div className="pub-foot">Sumber: Buku 5 Master Kode Komoditas &amp; Kualitas SPKRT 2027 · BPS</div>
      </div>
    </div>
  );
}

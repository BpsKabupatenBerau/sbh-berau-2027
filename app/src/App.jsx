import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider, Loading } from './components/ui';
import Shell from './components/Shell';
import Login from './pages/Login';
import Account from './pages/Account';
import PplHome from './pages/ppl/Home';
import Status from './pages/ppl/Status';
import RutaList from './pages/field/RutaList';
import Capture from './pages/field/Capture';
import SuratTugas from './pages/field/SuratTugas';
import Kendaraan from './pages/field/Kendaraan';

// Loaded only when needed, so a public visitor never downloads the authed app.
const NksDetail = lazy(() => import('./pages/NksDetail'));
const PmlHome = lazy(() => import('./pages/pml/Home'));
const PmlUsulan = lazy(() => import('./pages/pml/Usulan'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Review = lazy(() => import('./pages/admin/Review'));
const Samples = lazy(() => import('./pages/admin/Samples'));
const Users = lazy(() => import('./pages/admin/Users'));
const SuratNomor = lazy(() => import('./pages/admin/SuratNomor'));
const UsulanMasuk = lazy(() => import('./pages/admin/UsulanMasuk'));
const Master = lazy(() => import('./pages/admin/Master'));
const Katalog = lazy(() => import('./pages/public/Katalog'));
const AdminRekapBL = lazy(() => import('./pages/admin/RekapBL'));
const PmlRekapBL = lazy(() => import('./pages/pml/RekapBL'));
const Penerimaan = lazy(() => import('./pages/office/Penerimaan'));
const Batching = lazy(() => import('./pages/office/Batching'));
const Entri = lazy(() => import('./pages/office/Entri'));
const Fasih = lazy(() => import('./pages/admin/Fasih'));
const Honor = lazy(() => import('./pages/admin/Honor'));
const HonorDetail = lazy(() => import('./pages/admin/HonorDetail'));

const ROUTES = {
  ppl: (
    <>
      <Route path="/" element={<PplHome />} />
      <Route path="/pendataan" element={<RutaList kind="kunjungan" />} />
      <Route path="/pendataan/:id" element={<Capture kind="kunjungan" />} />
      <Route path="/status" element={<Status />} />
      <Route path="/surat-tugas" element={<SuratTugas />} />
      <Route path="/kendaraan" element={<Kendaraan />} />
    </>
  ),
  pml: (
    <>
      <Route path="/" element={<PmlHome />} />
      <Route path="/pengawasan" element={<RutaList kind="pengawasan" />} />
      <Route path="/pengawasan/:id" element={<Capture kind="pengawasan" />} />
      <Route path="/nks/:nks" element={<NksDetail />} />
      <Route path="/usulan" element={<PmlUsulan />} />
      <Route path="/rekap-bl" element={<PmlRekapBL />} />
      <Route path="/surat-tugas" element={<SuratTugas />} />
      <Route path="/kendaraan" element={<Kendaraan />} />
    </>
  ),
  admin: (
    <>
      <Route path="/" element={<Dashboard />} />
      <Route path="/nks/:nks" element={<NksDetail />} />
      <Route path="/verifikasi" element={<Review />} />
      <Route path="/sampel" element={<Samples />} />
      <Route path="/pengguna" element={<Users />} />
      <Route path="/surat-nomor" element={<SuratNomor />} />
      <Route path="/usulan-masuk" element={<UsulanMasuk />} />
      <Route path="/master" element={<Master />} />
      <Route path="/rekap-bl" element={<AdminRekapBL />} />
      <Route path="/penerimaan" element={<Penerimaan />} />
      <Route path="/batching" element={<Batching />} />
      <Route path="/entri" element={<Entri />} />
      <Route path="/fasih" element={<Fasih />} />
      <Route path="/honor" element={<Honor />} />
      <Route path="/honor/:id" element={<HonorDetail />} />
    </>
  ),
  pengolahan: (
    <>
      <Route path="/" element={<Navigate to="/entri" replace />} />
      <Route path="/entri" element={<Entri />} />
    </>
  ),
};

function Gate() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="boot"><div className="logo big">SPKRT</div><Loading /></div>;
  if (!session || !profile) return <Login />;
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes>
          {ROUTES[profile.role]}
          <Route path="/akun" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

const pub = (el) => <Suspense fallback={<div className="boot"><div className="logo big">SPKRT</div><Loading /></div>}>{el}</Suspense>;

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <Routes>
          {/* Public — no login */}
          <Route path="/katalog" element={pub(<Katalog />)} />
          {/* Everything else is behind the login gate */}
          <Route path="/*" element={<AuthProvider><Gate /></AuthProvider>} />
        </Routes>
        <Analytics />
        <SpeedInsights />
      </ToastProvider>
    </HashRouter>
  );
}
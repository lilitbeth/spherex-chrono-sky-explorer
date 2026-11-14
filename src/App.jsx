import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

const Home = lazy(() => import('./pages/Home.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const Explorer = lazy(() => import('./pages/Explorer.jsx'));
const Candidates = lazy(() => import('./pages/Candidates.jsx'));
const Archive = lazy(() => import('./pages/Archive.jsx'));
const SpectraLab = lazy(() => import('./pages/SpectraLab.jsx'));
const Citizen = lazy(() => import('./pages/Citizen.jsx'));
const Diagnostics = lazy(() => import('./pages/Diagnostics.jsx'));
const Telemetry = lazy(() => import('./pages/Telemetry.jsx'));
const Queue = lazy(() => import('./pages/Queue.jsx'));
const Alerts = lazy(() => import('./pages/Alerts.jsx'));
const Guide = lazy(() => import('./pages/Guide.jsx'));

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Suspense
          fallback={
            <div className="p-10 flex justify-center text-secondary">
              <Spinner className="text-3xl" />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/account" element={<Account />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/spectra" element={<SpectraLab />} />
            <Route path="/citizen" element={<Citizen />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route path="/telemetry" element={<Telemetry />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}

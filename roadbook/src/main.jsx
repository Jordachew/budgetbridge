import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { ToastProvider } from './components/toast.jsx';
import { AppProvider, useApp } from './state/app.jsx';
import Layout from './components/Layout.jsx';
import Welcome from './pages/Welcome.jsx';
import { registerSW } from 'virtual:pwa-register';

const page = (f) => lazy(f);
const Dashboard = page(() => import('./pages/Dashboard.jsx'));
const Loads = page(() => import('./pages/Loads.jsx'));
const Expenses = page(() => import('./pages/Expenses.jsx'));
const Trips = page(() => import('./pages/Trips.jsx'));
const Invoices = page(() => import('./pages/Invoices.jsx'));
const Money = page(() => import('./pages/Money.jsx'));
const Reports = page(() => import('./pages/Reports.jsx'));
const MapPage = page(() => import('./pages/MapPage.jsx'));
const Maintenance = page(() => import('./pages/Maintenance.jsx'));
const Fleet = page(() => import('./pages/Fleet.jsx'));
const Reminders = page(() => import('./pages/Reminders.jsx'));
const Settings = page(() => import('./pages/Settings.jsx'));

const Splash = ({ text }) => <div className="flex min-h-screen items-center justify-center text-sm text-ink-500">{text}</div>;

function Gate() {
  const { phase, reboot } = useApp();
  if (phase === 'booting') return <Splash text="Opening Roadbook…" />;
  if (phase === 'welcome' || phase === 'recovery') return <Welcome recovery={phase === 'recovery'} />;
  if (phase === 'error') return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">Roadbook could not start</h1>
      <p className="max-w-sm text-sm text-ink-500">Your records are safe on this device. Close the app and open it again.</p>
      <button className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white" onClick={reboot}>Try again</button>
    </div>
  );
  return (
    <Suspense fallback={<Splash text="Loading…" />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="loads/*" element={<Loads />} />
          <Route path="expenses/*" element={<Expenses />} />
          <Route path="trips/*" element={<Trips />} />
          <Route path="invoices/*" element={<Invoices />} />
          <Route path="money/*" element={<Money />} />
          <Route path="reports/*" element={<Reports />} />
          <Route path="map/*" element={<MapPage />} />
          <Route path="maintenance/*" element={<Maintenance />} />
          <Route path="fleet/*" element={<Fleet />} />
          <Route path="reminders/*" element={<Reminders />} />
          <Route path="settings/*" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

const update = registerSW({ onNeedRefresh() { if (confirm('A new version of Roadbook is ready. Update now?')) update(true); } });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <AppProvider><Gate /></AppProvider>
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);

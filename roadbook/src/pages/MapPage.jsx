import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LocateFixed, MapPin, Fuel, TriangleAlert, Route as RouteIcon, Plus, Siren, GripHorizontal } from 'lucide-react';
import { Button } from '../components/ui.jsx';
import { useRows } from '../state/data.js';
import { useToast } from '../components/toast.jsx';
import { useMe } from './map/useMe.js';
import LeafMap from './map/LeafMap.jsx';
import PlacesTab from './map/PlacesTab.jsx';
import FuelTab from './map/FuelTab.jsx';
import AlertsTab from './map/AlertsTab.jsx';
import PlansTab from './map/PlansTab.jsx';
import PlaceForm from './map/PlaceForm.jsx';
import PlanForm from './map/PlanForm.jsx';
import ReportForm from './map/ReportForm.jsx';
import { useNewParam } from './maintenance/formKit.jsx';

const TABS = [
  { value: 'places', label: 'Places', icon: MapPin }, { value: 'fuel', label: 'Fuel', icon: Fuel },
  { value: 'alerts', label: 'Alerts', icon: TriangleAlert }, { value: 'routes', label: 'Routes', icon: RouteIcon },
];
const PEEK = 156;

export default function MapPage() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab') === 'plans' ? 'routes' : sp.get('tab');
  const tab = TABS.some((t) => t.value === raw) ? raw : 'places';
  const meApi = useMe();
  const toast = useToast();
  const places = useRows('places');
  const alerts = useRows('road_alerts');
  const plans = useRows('route_plans');
  const [marks, setMarks] = useState({ list: [], key: '' });
  const [focus, setFocus] = useState(null);
  const [placeForm, setPlaceForm] = useState(null);
  const [planForm, setPlanForm] = useState(null);
  const [report, setReport] = useState(false);
  const box = useRef(null);
  const [snap, setSnap] = useState('half');
  const [dragH, setDragH] = useState(null);

  const onMarkers = useCallback((list, key) => setMarks({ list, key }), []);
  const focusOn = useCallback((p) => setFocus({ lat: p.lat, lng: p.lng, n: Date.now() }), []);
  const now = Date.now();
  const alertCount = alerts.filter((a) => !a.cleared_at && new Date(a.expires_at).getTime() > now).length;
  const counts = { places: places.length, fuel: places.filter((p) => p.kind === 'fuel').length, alerts: alertCount, routes: plans.length };

  async function addHere() {
    const p = meApi.me || await meApi.locate();
    if (p) setPlaceForm({ lat: p.lat, lng: p.lng }); else toast('Could not find your location. Tap the map to drop a pin instead.', { bad: true });
  }
  useNewParam(() => { if (tab === 'routes') setPlanForm({}); else addHere(); });
  useEffect(() => { if (!meApi.me && meApi.state === 'idle') meApi.locate(); }, []);

  // Bottom sheet dragging (phones). Snaps: peek, half, full.
  const height = (s) => { const H = box.current?.clientHeight || 700; return s === 'peek' ? PEEK : s === 'full' ? H - 12 : Math.round(H * 0.52); };
  function startDrag(e) {
    const y0 = e.clientY; const h0 = height(snap);
    let moved = false;
    const move = (ev) => { moved = true; setDragH(Math.max(PEEK, Math.min(height('full'), h0 + (y0 - ev.clientY)))); };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!moved) { setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek'); setDragH(null); return; }
      const h = Math.max(PEEK, Math.min(height('full'), h0 + (y0 - ev.clientY)));
      const best = ['peek', 'half', 'full'].reduce((a, s) => (Math.abs(height(s) - h) < Math.abs(height(a) - h) ? s : a));
      setSnap(best); setDragH(null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  const panelH = dragH ?? height(snap);

  return (
    <div ref={box} className="relative -mx-4 -mt-6 -mb-28 h-[calc(100dvh-7.25rem)] overflow-hidden md:-mx-8 md:-my-8 md:-mb-10 md:h-screen">
      <LeafMap markers={marks.list} me={meApi.me} focus={focus} fitKey={`${tab}-${marks.key}-${meApi.me ? 1 : 0}`} height="100%" className="!rounded-none !ring-0" zoomPosition="topright" label="Map" inset={typeof window !== 'undefined' && window.innerWidth >= 768 ? { left: 420 } : { bottom: Math.min(panelH, 400) }}
        onMapClick={(pt) => setPlaceForm(pt)} />
      <button type="button" aria-label="Show my location" onClick={async () => { const p = await meApi.locate(); if (p) focusOn(p); else toast('Could not read your location.', { bad: true }); }}
        className="absolute right-[10px] top-[84px] z-10 flex h-[34px] w-[34px] items-center justify-center rounded-[4px] bg-white text-ink-800 shadow ring-1 ring-black/20 hover:bg-ink-100"><LocateFixed size={18} className={meApi.state === 'loading' ? 'animate-pulse' : ''} /></button>

      <section aria-label="Map tools"
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[14px] bg-[var(--surface)] shadow-[0_-6px_24px_rgba(0,0,0,0.22)] ring-1 ring-[var(--hairline)] md:bottom-4 md:left-4 md:right-auto md:top-4 md:w-[25rem] md:!h-auto md:rounded-[10px] md:shadow-xl"
        style={{ height: panelH, transition: dragH == null ? 'height .2s ease-out' : 'none' }}>
        <button type="button" aria-label="Resize panel" onPointerDown={startDrag} className="flex h-6 w-full shrink-0 cursor-grab touch-none items-center justify-center text-ink-400 md:hidden"><GripHorizontal size={22} /></button>
        <div className="shrink-0 px-3 pb-2 pt-1 md:pt-3">
          <div role="tablist" aria-label="Map sections" className="grid grid-cols-4 gap-1 rounded-md bg-ink-100 p-1 dark:bg-ink-800">
            {TABS.map((t) => {
              const on = tab === t.value; const Icon = t.icon;
              return (
                <button key={t.value} role="tab" aria-selected={on} type="button" onClick={() => { setSp({ tab: t.value }, { replace: true }); if (snap === 'peek') setSnap('half'); }}
                  className={`flex h-11 flex-col items-center justify-center rounded text-[11px] font-bold leading-none ${on ? 'bg-[var(--surface)] text-ink-900 shadow-sm ring-1 ring-ink-200 dark:bg-ink-700 dark:text-white dark:ring-ink-600' : 'text-ink-500'}`}>
                  <span className="flex items-center gap-1"><Icon size={14} />{t.label}</span>
                  <span className={`mt-1 ${t.value === 'alerts' && counts.alerts ? 'text-[var(--bad)]' : 'text-ink-400'}`}>{counts[t.value]}{t.value === 'alerts' && counts.alerts ? ' active' : ''}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button icon={Plus} onClick={addHere} className="!h-11">Add place here</Button>
            <Button icon={Siren} variant="outline" onClick={() => setReport(true)} className="!h-11">Report problem</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[var(--hairline)] px-4 py-4" role="tabpanel">
          {tab === 'places' && <PlacesTab meApi={meApi} onMarkers={onMarkers} focusOn={focusOn} setPlaceForm={setPlaceForm} addHere={addHere} />}
          {tab === 'fuel' && <FuelTab meApi={meApi} onMarkers={onMarkers} focusOn={focusOn} />}
          {tab === 'alerts' && <AlertsTab meApi={meApi} onMarkers={onMarkers} focusOn={focusOn} report={() => setReport(true)} />}
          {tab === 'routes' && <PlansTab onMarkers={onMarkers} setPlanForm={setPlanForm} />}
        </div>
      </section>

      {placeForm && <PlaceForm key={placeForm.id || `${placeForm.lat}-${placeForm.lng}`} place={placeForm} onClose={() => setPlaceForm(null)} onMyLocation={meApi.locate} />}
      {planForm && <PlanForm key={planForm.id || 'new'} plan={planForm} meApi={meApi} onClose={() => setPlanForm(null)} />}
      {report && <ReportForm onClose={() => setReport(false)} />}
    </div>
  );
}

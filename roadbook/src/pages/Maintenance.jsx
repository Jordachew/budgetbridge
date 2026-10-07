import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Truck, Wrench, FileBadge, Coins, AlertTriangle, ShieldAlert, Clock, CheckCircle2 } from 'lucide-react';
import { PageHeader, Badge } from '../components/ui.jsx';
import { useRows } from '../state/data.js';
import VehiclesTab from './maintenance/VehiclesTab.jsx';
import ServiceTab from './maintenance/ServiceTab.jsx';
import DocumentsTab from './maintenance/DocumentsTab.jsx';
import CostsTab from './maintenance/CostsTab.jsx';
import Tabs from './maintenance/Tabs.jsx';
import { useNewParam } from './maintenance/formKit.jsx';
import { useOdometerData, vehicleOdometer } from './maintenance/odo.js';
import { maintStatus, docStatus } from './maintenance/status.js';

const VALID = ['vehicles', 'service', 'documents', 'costs'];

/** The garage lamps: what needs a mechanic or a renewal, in one glance. */
function useGarage() {
  const data = useOdometerData();
  const docs = useRows('documents');
  return useMemo(() => {
    let overdue = 0; let soon = 0;
    for (const m of data.maintenance) {
      const v = data.vehicles.find((x) => x.id === m.vehicle_id);
      const s = maintStatus(m, v ? vehicleOdometer(v, data) : null, data.maintenance);
      if (s === 'overdue') overdue += 1; else if (s === 'soon') soon += 1;
    }
    const expired = docs.filter((d) => docStatus(d).key === 'expired').length;
    const expiring = docs.filter((d) => docStatus(d).key === 'soon').length;
    return { overdue, soon, expired, expiring, vehicles: data.vehicles.length };
  }, [data, docs]);
}

export default function Maintenance() {
  const [sp, setSp] = useSearchParams();
  const tab = VALID.includes(sp.get('tab')) ? sp.get('tab') : 'vehicles';
  const [signal, setSignal] = useState(0);
  useNewParam(() => setSignal((n) => n + 1));
  const g = useGarage();
  const lamps = [
    g.overdue && { tone: 'red', icon: AlertTriangle, text: `${g.overdue} service${g.overdue === 1 ? '' : 's'} overdue`, to: 'service' },
    g.expired && { tone: 'red', icon: ShieldAlert, text: `${g.expired} document${g.expired === 1 ? '' : 's'} expired`, to: 'documents' },
    g.soon && { tone: 'amber', icon: Clock, text: `${g.soon} service${g.soon === 1 ? '' : 's'} due soon`, to: 'service' },
    g.expiring && { tone: 'amber', icon: Clock, text: `${g.expiring} document${g.expiring === 1 ? '' : 's'} expiring in 30 days`, to: 'documents' },
  ].filter(Boolean);
  const tabs = [
    { value: 'vehicles', label: 'Vehicles', icon: Truck },
    { value: 'service', label: 'Service log', icon: Wrench, badge: g.overdue ? { text: String(g.overdue), tone: 'red' } : g.soon ? { text: String(g.soon), tone: 'amber' } : null },
    { value: 'documents', label: 'Documents', icon: FileBadge, badge: g.expired ? { text: String(g.expired), tone: 'red' } : g.expiring ? { text: String(g.expiring), tone: 'amber' } : null },
    { value: 'costs', label: 'Costs', icon: Coins },
  ];
  return (
    <>
      <PageHeader title="Maintenance" sub="Keep every truck legal, serviced and costed." />
      {g.vehicles > 0 && (
        <div className="-mt-2 mb-5 flex flex-wrap items-center gap-2" role="status" aria-label="Garage status">
          {lamps.length ? lamps.map((l) => (
            <button key={l.text} type="button" onClick={() => setSp({ tab: l.to }, { replace: true })} className="rounded outline-offset-2"><Badge tone={l.tone} icon={l.icon} className="!px-2.5 !py-1 !text-[11px]">{l.text}</Badge></button>
          )) : <Badge tone="green" icon={CheckCircle2} className="!px-2.5 !py-1">All clear: nothing overdue or expiring</Badge>}
        </div>
      )}
      <Tabs tabs={tabs} value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} label="Maintenance sections" />
      {tab === 'vehicles' && <VehiclesTab openSignal={signal} />}
      {tab === 'service' && <ServiceTab openSignal={signal} />}
      {tab === 'documents' && <DocumentsTab openSignal={signal} />}
      {tab === 'costs' && <CostsTab />}
    </>
  );
}

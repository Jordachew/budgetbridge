import { useSearchParams } from 'react-router-dom';
import { PageHeader, Segmented } from '../components/ui.jsx';
import { useMe } from './map/useMe.js';
import PlacesTab from './map/PlacesTab.jsx';
import FuelTab from './map/FuelTab.jsx';
import AlertsTab from './map/AlertsTab.jsx';
import PlansTab from './map/PlansTab.jsx';

const TABS = [
  { value: 'places', label: 'Places' }, { value: 'fuel', label: 'Fuel prices' },
  { value: 'alerts', label: 'Road alerts' }, { value: 'plans', label: 'Route plans' },
];

export default function MapPage() {
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some((t) => t.value === sp.get('tab')) ? sp.get('tab') : 'places';
  const meApi = useMe();
  return (
    <>
      <PageHeader title="Map" sub="Your places, fuel prices, road alerts and route plans." />
      <div className="-mx-1 mb-4 overflow-x-auto px-1"><Segmented value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} options={TABS} /></div>
      {tab === 'places' && <PlacesTab meApi={meApi} />}
      {tab === 'fuel' && <FuelTab meApi={meApi} />}
      {tab === 'alerts' && <AlertsTab meApi={meApi} />}
      {tab === 'plans' && <PlansTab meApi={meApi} />}
    </>
  );
}

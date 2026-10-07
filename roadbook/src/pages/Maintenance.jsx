import { useSearchParams } from 'react-router-dom';
import { PageHeader, Segmented } from '../components/ui.jsx';
import VehiclesTab from './maintenance/VehiclesTab.jsx';
import ServiceTab from './maintenance/ServiceTab.jsx';
import DocumentsTab from './maintenance/DocumentsTab.jsx';
import CostsTab from './maintenance/CostsTab.jsx';

const TABS = [{ value: 'vehicles', label: 'Vehicles' }, { value: 'service', label: 'Service log' }, { value: 'documents', label: 'Documents' }, { value: 'costs', label: 'Costs' }];

export default function Maintenance() {
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some((t) => t.value === sp.get('tab')) ? sp.get('tab') : 'vehicles';
  return (
    <>
      <PageHeader title="Maintenance" sub="Vehicles, service history, documents and what it all costs." />
      <div className="-mx-1 mb-4 overflow-x-auto px-1"><Segmented value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} options={TABS} /></div>
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'service' && <ServiceTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'costs' && <CostsTab />}
    </>
  );
}

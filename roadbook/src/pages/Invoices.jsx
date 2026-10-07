import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { Button, Empty, PageHeader } from '../components/ui.jsx';
import { useRow, useRows, useProfile } from '../state/data.js';
import { useCurrency } from '../lib/hooks.js';
import { nextInvoiceNumber } from './invoices/totals.js';
import InvoiceEditor from './invoices/InvoiceEditor.jsx';
import InvoicePrint from './invoices/InvoicePrint.jsx';
import Detail from './invoices/Detail.jsx';
import Ledger, { StatusBadge } from './invoices/Ledger.jsx';
import { AgeingStrip, WhoOwes } from './invoices/Hero.jsx';

export { StatusBadge };

function fromLoad(load, invoices) {
  const route = [load.pickup_label, load.drop_label].filter(Boolean).join(' to ');
  return {
    number: nextInvoiceNumber(invoices), load_id: load.id, customer: load.customer || '', currency: load.currency || 'JMD',
    items: [{ description: [load.reference && `Load ${load.reference}`, route || load.description || 'Freight'].filter(Boolean).join(' - '), qty: 1, unit_cents: load.rate_cents || 0 }],
    notes: '',
  };
}

function List() {
  const invoices = useRows('invoices');
  const loads = useRows('loads');
  const cur = useCurrency();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [age, setAge] = useState(null);
  const [editing, setEditing] = useState(null);   // null | prefill object

  // ?new=1 opens a blank invoice, ?load=<id> opens one prefilled from that load.
  const wantNew = sp.get('new') === '1' || sp.get('load');
  const [handled, setHandled] = useState(false);
  if (wantNew && !handled) {
    setHandled(true);
    const load = loads.find((l) => l.id === sp.get('load'));
    setEditing(load ? fromLoad(load, invoices) : { number: nextInvoiceNumber(invoices), currency: cur });
  }
  const closeEditor = () => { setEditing(null); if (sp.get('new') || sp.get('load')) setSp({}, { replace: true }); };
  const startNew = () => setEditing({ number: nextInvoiceNumber(invoices), currency: cur });

  if (editing) return <InvoiceEditor key="new" initial={editing} existing={invoices} onClose={closeEditor} onSaved={(r) => { closeEditor(); nav(r.id); }} />;

  return (
    <>
      <PageHeader title="Invoices" sub="Bill your customers, send it, and see who still owes you." actions={<Button icon={Plus} onClick={startNew}>New invoice</Button>} />
      {invoices.length > 0 && (
        <div className="mb-8">
          <WhoOwes invoices={invoices} cur={cur} />
          <AgeingStrip invoices={invoices} cur={cur} active={age} onPick={(b) => { setAge(b); setTab('all'); }} />
        </div>
      )}
      <Ledger invoices={invoices} cur={cur} tab={tab} setTab={setTab} q={q} setQ={setQ} age={age} setAge={setAge} onNew={startNew} />
    </>
  );
}

function Print() {
  const { id } = useParams();
  const inv = useRow('invoices', id);
  const profile = useProfile();
  if (!inv || inv.deleted_at) return <Empty icon={FileText} title="Invoice not found" action={<Button as={Link} to="/invoices">Back to invoices</Button>} />;
  return <InvoicePrint inv={inv} profile={profile} />;
}

export default function Invoices() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path=":id" element={<Detail />} />
      <Route path=":id/print" element={<Print />} />
    </Routes>
  );
}

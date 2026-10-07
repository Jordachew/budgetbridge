import { useState } from 'react';
import { PackageOpen, Plus, Trash2, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge, Banner, Button, Card, Empty, Field, IconButton, Input, Modal, Select, Textarea } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { create, useRows } from '../../state/data.js';
import { useCurrency } from '../../lib/hooks.js';
import { fmtDateTime, fmtMoney, fromLocalInput, parseMoney } from '../../core/format.js';

const STATUS = {
  booked: ['Booked', 'neutral'], picked_up: ['Picked up', 'blue'], in_transit: ['On the road', 'blue'],
  delivered: ['Delivered', 'green'], reconciled: ['Reconciled', 'green'], cancelled: ['Cancelled', 'red'],
};

function NewLoad({ drivers, me, onClose }) {
  const toast = useToast();
  const cur = useCurrency();
  const [f, setF] = useState({ driver: drivers[0]?.user_id || '', reference: '', customer: '', pickup_label: '', pickup_at: '', drop_label: '', drop_at: '', rate: '', currency: cur, notes: '' });
  const [items, setItems] = useState([{ name: '', expected: '', unit: 'pcs' }]);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setItems((l) => l.map((x, n) => (n === i ? { ...x, [k]: v } : x)));

  async function submit() {
    const e = {};
    if (!f.driver) e.driver = 'Choose a driver.';
    if (!f.customer.trim() && !f.reference.trim()) e.customer = 'Enter a customer or a reference so the driver knows what this is.';
    if (!f.pickup_label.trim()) e.pickup_label = 'Where should the driver pick up?';
    if (!f.drop_label.trim()) e.drop_label = 'Where does it get delivered?';
    const rate = f.rate.trim() === '' ? 0 : parseMoney(f.rate);
    if (rate == null) e.rate = 'Enter the rate as an amount, like 85000.';
    const pickup = f.pickup_at ? fromLocalInput(f.pickup_at) : null;
    const drop = f.drop_at ? fromLocalInput(f.drop_at) : null;
    if (pickup && drop && drop < pickup) e.drop_at = 'Delivery cannot be before pickup.';
    const list = items.filter((i) => i.name.trim());
    if (list.some((i) => !(Number(i.expected) >= 0) || i.expected === '')) e.items = 'Give each item a quantity (a number).';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await create('loads', {
        user_id: f.driver, created_by: me, reference: f.reference.trim().slice(0, 60), customer: f.customer.trim().slice(0, 100),
        pickup_label: f.pickup_label.trim().slice(0, 200), pickup_at: pickup ? pickup.toISOString() : null,
        drop_label: f.drop_label.trim().slice(0, 200), drop_at: drop ? drop.toISOString() : null,
        rate_cents: rate, currency: f.currency, status: 'booked', notes: f.notes.trim().slice(0, 1000),
        items: list.map((i) => ({ name: i.name.trim().slice(0, 100), unit: i.unit.trim().slice(0, 20) || 'pcs', expected: Number(i.expected), received: Number(i.expected) })),
      });
      toast('Load sent to the driver.');
      onClose();
    } catch (x) { console.error(x); toast('Could not save the load.', { bad: true }); setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} wide title="Dispatch a load" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={Send} loading={busy} onClick={submit}>Send to driver</Button></>}>
      <div className="space-y-4">
        <Field label="Driver" error={err.driver}>{(id) => <Select id={id} value={f.driver} onChange={(e) => set('driver', e.target.value)}>{drivers.map((d) => <option key={d.user_id} value={d.user_id}>{d.display_name}</option>)}</Select>}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" error={err.customer}>{(id) => <Input id={id} value={f.customer} maxLength={100} onChange={(e) => set('customer', e.target.value)} />}</Field>
          <Field label="Reference (optional)">{(id) => <Input id={id} value={f.reference} maxLength={60} placeholder="PO or job number" onChange={(e) => set('reference', e.target.value)} />}</Field>
          <Field label="Pickup place" error={err.pickup_label}>{(id) => <Input id={id} value={f.pickup_label} maxLength={200} onChange={(e) => set('pickup_label', e.target.value)} />}</Field>
          <Field label="Pickup time (optional)">{(id) => <Input id={id} type="datetime-local" value={f.pickup_at} onChange={(e) => set('pickup_at', e.target.value)} />}</Field>
          <Field label="Delivery place" error={err.drop_label}>{(id) => <Input id={id} value={f.drop_label} maxLength={200} onChange={(e) => set('drop_label', e.target.value)} />}</Field>
          <Field label="Delivery time (optional)" error={err.drop_at}>{(id) => <Input id={id} type="datetime-local" value={f.drop_at} onChange={(e) => set('drop_at', e.target.value)} />}</Field>
          <Field label="Rate (what the load pays)" error={err.rate}>{(id) => <Input id={id} inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} />}</Field>
          <Field label="Currency">{(id) => <Select id={id} value={f.currency} onChange={(e) => set('currency', e.target.value)}><option value="JMD">J$ Jamaican</option><option value="USD">US$ US dollars</option></Select>}</Field>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">Items on board (optional)</div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_4.5rem_auto] items-center gap-2">
                <Input aria-label={`Item ${i + 1} name`} placeholder="Item" value={it.name} maxLength={100} onChange={(e) => setItem(i, 'name', e.target.value)} />
                <Input aria-label={`Item ${i + 1} quantity`} inputMode="decimal" placeholder="Qty" value={it.expected} onChange={(e) => setItem(i, 'expected', e.target.value)} />
                <Input aria-label={`Item ${i + 1} unit`} value={it.unit} maxLength={20} onChange={(e) => setItem(i, 'unit', e.target.value)} />
                <IconButton icon={Trash2} label={`Remove item ${i + 1}`} disabled={items.length === 1} onClick={() => setItems((l) => l.filter((_, n) => n !== i))} />
              </div>
            ))}
          </div>
          {err.items && <p className="mt-1 text-xs font-medium text-red-600">{err.items}</p>}
          {items.length < 50 && <Button variant="soft" size="sm" icon={Plus} className="mt-2" onClick={() => setItems((l) => [...l, { name: '', expected: '', unit: 'pcs' }])}>Add item</Button>}
        </div>
        <Field label="Notes for the driver (optional)">{(id) => <Textarea id={id} rows={2} maxLength={1000} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

export default function Dispatch({ ctx }) {
  const { me, roster, nameOf } = ctx;
  const loads = useRows('loads');
  const deliveries = useRows('deliveries');
  const [open, setOpen] = useState(false);
  const drivers = roster.filter((r) => r.role === 'driver');
  const sent = loads.filter((l) => l.created_by === me && l.user_id !== me).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">Send a load straight to a driver's phone. They update its status and add proof of delivery.</p>
        <Button icon={Plus} disabled={!drivers.length} onClick={() => setOpen(true)}>Dispatch a load</Button>
      </div>
      {!drivers.length && <Banner tone="amber">No drivers have joined yet. Share your join code from the Overview tab first.</Banner>}
      {!sent.length ? <Empty icon={PackageOpen} title="No dispatched loads" text="Loads you send to drivers show up here with their delivery status." />
        : (
          <ul className="space-y-3">
            {sent.map((l) => {
              const [label, tone] = STATUS[l.status] || [l.status, 'neutral'];
              const proof = deliveries.filter((d) => d.load_id === l.id).sort((a, b) => (b.delivered_at || '').localeCompare(a.delivered_at || ''))[0];
              return (
                <li key={l.id}><Card className="!p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{l.customer || 'Load'}{l.reference ? ` · ${l.reference}` : ''}</p>
                      <p className="text-sm text-ink-500">{l.pickup_label || '?'} to {l.drop_label || '?'}</p>
                      <p className="mt-1 text-xs text-ink-500">Driver: {nameOf(l.user_id)}{l.drop_at ? ` · due ${fmtDateTime(l.drop_at)}` : ''}</p>
                    </div>
                    <div className="text-right"><Badge tone={tone}>{label}</Badge><p className="mt-1 text-sm font-semibold tabular-nums">{fmtMoney(l.rate_cents, l.currency)}</p></div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3 text-sm dark:border-ink-800">
                    {proof ? (
                      <>
                        {proof.has_discrepancy ? <AlertTriangle size={16} className="text-amber-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
                        <span>Proof received {fmtDateTime(proof.delivered_at)}{proof.receiver_name ? ` · signed by ${proof.receiver_name}` : ''}{proof.has_discrepancy ? ' · items did not match' : ''}</span>
                      </>
                    ) : <span className="text-ink-500">{l.status === 'delivered' || l.status === 'reconciled' ? 'Delivered, proof not synced yet' : 'No proof of delivery yet'}</span>}
                  </div>
                </Card></li>
              );
            })}
          </ul>
        )}
      {open && <NewLoad drivers={drivers} me={me} onClose={() => setOpen(false)} />}
    </div>
  );
}

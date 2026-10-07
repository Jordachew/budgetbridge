// Sample data for guest mode so a new person can explore a full app, then clear it with one click.
import * as store from '../core/store.js';
import { uuid } from '../core/util.js';

const day = (n, h = 10) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const ymd = (n) => day(n).slice(0, 10);

export const hasDemo = () => store.getDb() && ['loads', 'expenses', 'vehicles', 'invoices'].some((t) => store.rows(t).some((r) => r._demo));

export async function loadDemo() {
  const put = (table, o) => store.save(table, { id: uuid(), _demo: true, ...o });
  const veh = await put('vehicles', { name: 'Hino 500', plate: '8821 HJ', make: 'Hino', model: '500', year: 2019, vin: '', fuel_type: 'diesel', tank_litres: 200, odometer_m: 210000000, notes: '' });
  const L = [];
  const mk = async (o) => { const r = await put('loads', { created_by: store.userId(), description: '', notes: '', items: [], weight_kg: null, currency: 'JMD', ...o }); L.push(r); return r; };
  await mk({ reference: 'KGN-2035', customer: 'Seprod', pickup_label: 'Clarendon', drop_label: 'Kingston', pickup_at: day(12, 8), drop_at: day(12, 13), rate_cents: 7500000, status: 'reconciled' });
  await mk({ reference: 'KGN-2039', customer: 'GraceKennedy', pickup_label: 'Kingston', drop_label: 'Mandeville', pickup_at: day(6, 8), drop_at: day(6, 15), rate_cents: 12000000, status: 'delivered' });
  await mk({ reference: 'KGN-2041', customer: 'Caribbean Cement', description: '20 t cement', pickup_label: 'Rockfort, Kingston', drop_label: 'Montego Bay', pickup_at: day(1, 7), drop_at: day(0, 14), rate_cents: 18500000, status: 'in_transit', weight_kg: 20000, items: [{ name: 'Cement bags', unit: 'bags', expected: 400 }] });
  await mk({ reference: 'KGN-2042', customer: 'Wisynco', description: 'Beverages', pickup_label: 'Spanish Town', drop_label: 'Ocho Rios', pickup_at: day(-1, 7), rate_cents: 9800000, status: 'booked' });
  const exp = [['fuel', 2250000, 'Total Hope Road', 118, 1, 210000000], ['fuel', 2100000, 'Texaco Mandeville', 110, 6, 209600000], ['toll', 120000, 'Highway 2000', 0, 1], ['food', 185000, 'Tastee', 0, 2], ['repairs', 1450000, 'Brakes Plus', 0, 9], ['fuel', 2300000, 'Rubis Ocho Rios', 120, 14, 208900000], ['parking', 60000, 'Kingston Wharf', 0, 3], ['tyres', 3200000, 'Tyre Hub', 0, 20]];
  for (const [category, amount_cents, vendor, litres, ago, odo] of exp) {
    await put('expenses', { category, amount_cents, currency: 'JMD', vendor, note: '', litres: litres || null, paid_by: 'driver', spent_at: day(ago, 12), odometer_m: odo || null, load_id: ago <= 2 ? L[2].id : null, vehicle_id: veh.id, receipt_path: null });
  }
  await put('income', { kind: 'pay', amount_cents: 12000000, currency: 'JMD', note: 'GraceKennedy', received_at: day(5), load_id: L[1].id });
  await put('income', { kind: 'pay', amount_cents: 7500000, currency: 'JMD', note: 'Seprod', received_at: day(10), load_id: L[0].id });
  await put('income', { kind: 'advance', amount_cents: 2000000, currency: 'JMD', note: 'Cash advance', received_at: day(2) });
  await put('trips', { started_at: day(1, 7), ended_at: day(1, 13), distance_m: 191000, method: 'gps', origin_label: 'Kingston', dest_label: 'Montego Bay', note: '', path: [], load_id: L[2].id, vehicle_id: veh.id });
  await put('trips', { started_at: day(6, 8), ended_at: day(6, 12), distance_m: 96000, method: 'gps', origin_label: 'Kingston', dest_label: 'Mandeville', note: '', path: [], load_id: L[1].id, vehicle_id: veh.id });
  await put('maintenance', { vehicle_id: veh.id, kind: 'oil', title: 'Oil and filter change', done_at: day(30), odometer_m: 205000000, cost_cents: 850000, currency: 'JMD', vendor: 'Auto Care', notes: '', next_due_at: day(-5), next_due_odometer_m: 215000000 });
  await put('documents', { vehicle_id: veh.id, kind: 'insurance', title: 'Motor insurance', number: 'POL-77821', issued_at: ymd(300), expires_at: ymd(-12), file_path: null, notes: '' });
  await put('documents', { vehicle_id: null, kind: 'licence', title: 'Driver licence', number: 'D-221', issued_at: ymd(900), expires_at: ymd(-400), file_path: null, notes: '' });
  await put('documents', { vehicle_id: veh.id, kind: 'fitness', title: 'Certificate of fitness', number: '', issued_at: ymd(400), expires_at: ymd(5), file_path: null, notes: '' });
  await put('invoices', { load_id: L[1].id, number: 'INV-2026-0001', customer: 'GraceKennedy', customer_email: '', customer_address: 'Kingston', issue_date: ymd(6), due_date: ymd(-8), items: [{ description: 'Kingston to Mandeville haulage', qty: 1, unit_cents: 12000000 }], tax_pct: 0, discount_cents: 0, currency: 'JMD', status: 'paid', paid_at: day(5), paid_cents: 12000000, notes: '' });
  await put('invoices', { load_id: L[2].id, number: 'INV-2026-0002', customer: 'Caribbean Cement', customer_email: '', customer_address: '', issue_date: ymd(1), due_date: ymd(-13), items: [{ description: 'Rockfort to Montego Bay, 20 t', qty: 1, unit_cents: 18500000 }, { description: 'Waiting time (hours)', qty: 3, unit_cents: 250000 }], tax_pct: 15, discount_cents: 0, currency: 'JMD', status: 'sent', paid_at: null, paid_cents: 0, notes: 'Payment within 14 days' });
  await put('invoices', { load_id: null, number: 'INV-2026-0003', customer: 'Wisynco', customer_email: '', customer_address: '', issue_date: ymd(20), due_date: ymd(5), items: [{ description: 'Beverages haulage', qty: 1, unit_cents: 9800000 }], tax_pct: 0, discount_cents: 0, currency: 'JMD', status: 'sent', paid_at: null, paid_cents: 0, notes: '' });
  await put('reminders', { title: 'Renew road licence', kind: 'date', due_at: day(-9), repeat: 'yearly', repeat_every_m: null, lead_minutes: 1440, snoozed_until: null, done_at: null, due_odometer_m: null });
  await put('places', { kind: 'fuel', name: 'Total Hope Road', lat: 18.0, lng: -76.78, note: '', fuel_price_cents: 21500 });
  await put('places', { kind: 'yard', name: 'My yard', lat: 17.99, lng: -76.8, note: '', fuel_price_cents: null });
}

export async function clearDemo() {
  for (const t of ['loads', 'expenses', 'income', 'trips', 'vehicles', 'maintenance', 'documents', 'invoices', 'reminders', 'places']) {
    for (const r of store.rows(t)) if (r._demo) await store.remove(t, r.id);
  }
}

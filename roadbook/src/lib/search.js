// Cross-table search for the command palette. Pure: takes rows, returns ranked hits.
import * as store from '../core/store.js';

const norm = (s) => String(s ?? '').toLowerCase();
const hit = (q, ...fields) => { const hay = norm(fields.join(' ')); return q.split(/\s+/).every((t) => hay.includes(t)); };

export function searchAll(query, limit = 12) {
  const q = norm(query).trim();
  if (q.length < 2) return [];
  const out = [];
  for (const l of store.rows('loads')) if (hit(q, l.reference, l.customer, l.pickup_label, l.drop_label, l.description)) out.push({ kind: 'Load', title: l.reference || l.customer || 'Load', sub: [l.customer, l.drop_label].filter(Boolean).join(' · '), to: `/loads/${l.id}` });
  for (const i of store.rows('invoices')) if (hit(q, i.number, i.customer)) out.push({ kind: 'Invoice', title: i.number, sub: i.customer, to: `/invoices/${i.id}` });
  for (const e of store.rows('expenses')) if (hit(q, e.vendor, e.note, e.category)) out.push({ kind: 'Expense', title: e.vendor || e.category, sub: e.note || e.category, to: '/expenses' });
  for (const v of store.rows('vehicles')) if (hit(q, v.name, v.plate, v.make, v.model)) out.push({ kind: 'Vehicle', title: v.name, sub: v.plate, to: '/maintenance' });
  for (const d of store.rows('documents')) if (hit(q, d.title, d.number)) out.push({ kind: 'Document', title: d.title, sub: d.number, to: '/maintenance?tab=documents' });
  for (const p of store.rows('places')) if (hit(q, p.name, p.note)) out.push({ kind: 'Place', title: p.name, sub: p.kind, to: '/map?tab=places' });
  return out.slice(0, limit);
}

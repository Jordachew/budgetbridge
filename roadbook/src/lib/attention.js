// "Needs attention": one ranked list of things that cost money or safety if ignored. Powers the dashboard feed.
import { useMemo } from 'react';
import { AlertTriangle, FileWarning, Wrench, Bell, FileText, ShieldAlert } from 'lucide-react';
import { useRows } from '../state/data.js';
import { invoiceTotals, displayStatus, todayStr } from '../pages/invoices/totals.js';
import { maintStatus, docStatus, daysUntil } from '../pages/maintenance/status.js';
import { reminderState } from '../core/reminders-logic.js';
import { useOverallOdometer } from '../pages/maintenance/odo.js';
import { fmtMoney } from '../core/format.js';

const RANK = { red: 0, amber: 1, blue: 2 };

/** items: [{ id, tone: 'red'|'amber'|'blue', icon, title, detail, to, cta }] sorted most urgent first. */
export function useAttention() {
  const invoices = useRows('invoices');
  const documents = useRows('documents');
  const maintenance = useRows('maintenance');
  const reminders = useRows('reminders');
  const vehicles = useRows('vehicles');
  const odometer_m = useOverallOdometer();
  return useMemo(() => {
    const out = [];
    const today = todayStr();
    for (const i of invoices) {
      const st = displayStatus(i, today);
      const t = invoiceTotals(i);
      if (st === 'overdue') out.push({ id: `inv-${i.id}`, tone: 'red', icon: FileWarning, title: `${i.number} is overdue`, detail: `${i.customer || 'Customer'} owes ${fmtMoney(t.balance, i.currency)} · due ${i.due_date}`, to: `/invoices/${i.id}`, cta: 'Chase' });
      else if (st === 'sent' && i.due_date && daysUntil(i.due_date) <= 3 && t.balance > 0) out.push({ id: `inv-${i.id}`, tone: 'amber', icon: FileText, title: `${i.number} due ${daysUntil(i.due_date) <= 0 ? 'today' : `in ${daysUntil(i.due_date)} days`}`, detail: `${i.customer || 'Customer'} · ${fmtMoney(t.balance, i.currency)} outstanding`, to: `/invoices/${i.id}`, cta: 'Open' });
      else if (st === 'draft' && daysUntil(i.issue_date) <= -2) out.push({ id: `inv-${i.id}`, tone: 'blue', icon: FileText, title: `${i.number} is still a draft`, detail: `${i.customer || 'Customer'} · ${fmtMoney(t.total, i.currency)} not billed yet`, to: `/invoices/${i.id}`, cta: 'Send' });
    }
    for (const d of documents) {
      const s = docStatus(d);
      if (s.key === 'expired') out.push({ id: `doc-${d.id}`, tone: 'red', icon: ShieldAlert, title: `${d.title} has expired`, detail: s.label, to: '/maintenance?tab=documents', cta: 'Renew' });
      else if (s.key === 'soon') out.push({ id: `doc-${d.id}`, tone: 'amber', icon: ShieldAlert, title: `${d.title} expires soon`, detail: s.label, to: '/maintenance?tab=documents', cta: 'Renew' });
    }
    for (const m of maintenance) {
      const s = maintStatus(m, odometer_m, maintenance);
      const v = vehicles.find((x) => x.id === m.vehicle_id);
      const what = `${m.title}${v ? ` · ${v.name}` : ''}`;
      if (s === 'overdue') out.push({ id: `mt-${m.id}`, tone: 'red', icon: Wrench, title: `${what} is overdue`, detail: 'Book it in before it costs more', to: '/maintenance?tab=service', cta: 'View' });
      else if (s === 'soon') out.push({ id: `mt-${m.id}`, tone: 'amber', icon: Wrench, title: `${what} due soon`, detail: 'Coming up in the next month', to: '/maintenance?tab=service', cta: 'View' });
    }
    for (const r of reminders) {
      const s = reminderState(r, { odometer_m });
      if (s === 'overdue' || s === 'due') out.push({ id: `rm-${r.id}`, tone: s === 'overdue' ? 'red' : 'amber', icon: Bell, title: r.title, detail: s === 'overdue' ? 'Overdue reminder' : 'Due now', to: '/reminders', cta: 'Open' });
    }
    out.sort((a, b) => RANK[a.tone] - RANK[b.tone]);
    return out;
  }, [invoices, documents, maintenance, reminders, vehicles, odometer_m]);
}
export { AlertTriangle };

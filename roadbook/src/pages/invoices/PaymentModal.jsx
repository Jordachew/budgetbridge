import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { fmtMoney, parseMoney } from '../../core/format.js';
import { invoiceTotals } from './totals.js';
import { paymentToast, recordPayment } from './actions.js';

/** Record a payment (full or part). Only the amount received becomes income. */
export default function PaymentModal({ inv, onClose }) {
  const toast = useToast();
  const { balance } = invoiceTotals(inv);
  const money = (c) => fmtMoney(c, inv.currency);
  const [amount, setAmount] = useState(String(balance / 100));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // The dialog focuses its close button on open; move focus to the amount instead.
  useEffect(() => { const t = setTimeout(() => document.querySelector('[data-autofocus]')?.select(), 40); return () => clearTimeout(t); }, []);

  async function submit() {
    const cents = parseMoney(amount);
    if (!cents) return setErr('Enter the amount you received, for example 5000.');
    if (cents > balance) return setErr(`That is more than the balance of ${money(balance)}.`);
    setBusy(true);
    try { paymentToast(toast, await recordPayment(inv, cents), inv); onClose(); }
    catch (e) { console.error(e); toast('Could not record the payment.', { bad: true }); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Record payment" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Record payment</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p className="mb-4 text-sm text-ink-500">{inv.customer} owes <b className="text-ink-900 dark:text-white">{money(balance)}</b> on {inv.number}.</p>
        <Field label="Amount received" error={err} hint="Enter the full balance or just part of it. It is added to your income.">
          {(id) => <Input id={id} data-autofocus inputMode="decimal" className="h-12 text-lg font-bold" value={amount} onChange={(e) => { setAmount(e.target.value); setErr(''); }} />}
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          {[['Full balance', balance], ['Half', Math.round(balance / 2)]].map(([l, c]) => (
            <button key={l} type="button" onClick={() => { setAmount(String(c / 100)); setErr(''); }} className="rounded-full bg-ink-100 px-3 py-1.5 text-xs font-bold text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200">{l} · {money(c)}</button>
          ))}
        </div>
        <button type="submit" className="sr-only">Record payment</button>
      </form>
    </Modal>
  );
}

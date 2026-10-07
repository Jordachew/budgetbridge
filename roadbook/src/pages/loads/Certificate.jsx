// Printable proof-of-delivery certificate. Always drawn as a sheet of white paper, in light and dark mode.
import { ArrowLeft, Printer, ShieldCheck, ShieldAlert, Stamp, MapPin } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import { useFileUrl } from '../../lib/files.js';
import { fmtDateTime } from '../../core/format.js';
import { useMoney } from '../../lib/hooks.js';
import { useProofCheck } from './DeliveryProof.jsx';

function Row({ label, children }) {
  return <div className="flex flex-col gap-0.5 border-b border-ink-300 py-2.5 sm:flex-row sm:gap-4"><dt className="w-40 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{label}</dt><dd className="min-w-0 flex-1 text-[15px] font-bold">{children}</dd></div>;
}

export default function Certificate({ load, delivery, onBack }) {
  const sig = useFileUrl(delivery.signature_path);
  const photo = useFileUrl(delivery.photo_path);
  const check = useProofCheck(delivery);
  const money = useMoney();
  const items = delivery.items || [];
  const no = (delivery.proof_hash || delivery.id || '').slice(0, 10).toUpperCase();
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>Back to load</Button>
        <Button icon={Printer} onClick={() => window.print()}>Print or save as PDF</Button>
      </div>
      <article aria-label="Proof of delivery certificate" className="print-area relative mx-auto max-w-3xl overflow-hidden bg-white p-6 text-ink-900 shadow-lg ring-1 ring-ink-300 sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-2 border-2 border-ink-900" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-3.5 border border-ink-400" />
        <header className="relative flex flex-wrap items-start justify-between gap-4 px-3 pt-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-ink-500">Roadbook</div>
            <h1 className="mt-1 font-display text-4xl font-bold uppercase leading-none tracking-wide sm:text-5xl">Proof of delivery</h1>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Certificate no.</div>
            <div className="font-display text-2xl font-bold tracking-[0.12em]">{no || 'UNSEALED'}</div>
          </div>
        </header>
        <div className="roadline relative mx-3 mt-4" aria-hidden="true" />

        <dl className="relative mx-3 mt-4">
          <Row label="Load reference"><span className="inline-block rounded-[3px] border-2 border-ink-900 bg-brand-100 px-1.5 font-display text-lg tracking-[0.14em]">{load.reference || '-'}</span></Row>
          {load.customer && <Row label="Customer">{load.customer}</Row>}
          <Row label="Route">{load.pickup_label || 'Pickup'} <span className="text-ink-500">to</span> {load.drop_label || 'Drop-off'}</Row>
          <Row label="Delivered">{fmtDateTime(delivery.delivered_at)}</Row>
          <Row label="Received by">{delivery.receiver_name || 'Not recorded'}</Row>
          <Row label="Location stamp">{delivery.lat != null ? <span className="inline-flex items-center gap-1"><MapPin size={14} />{Number(delivery.lat).toFixed(5)}, {Number(delivery.lng).toFixed(5)}{delivery.accuracy_m != null && <span className="font-normal text-ink-500"> (within {Math.round(delivery.accuracy_m)} m)</span>}</span> : <span className="font-normal text-ink-500">No GPS signal when sealed</span>}</Row>
          {load.rate_cents > 0 && <Row label="Agreed rate">{money(load.rate_cents, load.currency)}</Row>}
        </dl>

        {items.length > 0 && (
          <section className="relative mx-3 mt-5">
            <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Goods received</h2>
            <table className="w-full border-collapse text-left text-sm">
              <thead><tr className="border-b-2 border-ink-900 text-xs font-bold uppercase text-ink-500"><th className="py-1.5">Item</th><th className="py-1.5 text-right">Expected</th><th className="py-1.5 text-right">Received</th></tr></thead>
              <tbody>{items.map((i, n) => { const off = Number(i.received) !== Number(i.expected); return (
                <tr key={n} className="border-b border-ink-300"><td className="py-1.5">{i.name}</td><td className="py-1.5 text-right tabular-nums">{i.expected} {i.unit}</td><td className="py-1.5 text-right font-bold tabular-nums">{i.received} {i.unit}{off ? ` (${i.received - i.expected > 0 ? '+' : ''}${i.received - i.expected})` : ''}</td></tr>); })}</tbody>
            </table>
            {delivery.has_discrepancy && <p className="mt-2 border-l-4 border-brand-500 bg-brand-50 px-3 py-2 text-sm"><b>Counts did not match.</b> {delivery.discrepancy_note}</p>}
          </section>
        )}

        <section className="relative mx-3 mt-6 grid gap-5 sm:grid-cols-2">
          <figure>
            <div className="flex aspect-video items-center justify-center border border-ink-400 bg-white">{sig ? <img src={sig} alt="Receiver signature" className="h-full w-full object-contain" /> : <span className="text-xs text-ink-400">No signature</span>}</div>
            <figcaption className="mt-1 border-t border-ink-900 pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Receiver signature{delivery.receiver_name ? `: ${delivery.receiver_name}` : ''}</figcaption>
          </figure>
          {delivery.photo_path && (
            <figure>
              <div className="flex aspect-video items-center justify-center border border-ink-400 bg-white">{photo ? <img src={photo} alt="Delivery photo" className="h-full w-full object-cover" /> : <span className="text-xs text-ink-400">Loading photo</span>}</div>
              <figcaption className="mt-1 border-t border-ink-900 pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Photo at drop-off</figcaption>
            </figure>
          )}
        </section>

        <footer className="relative mx-3 mt-6 flex items-start gap-4 border-t-2 border-ink-900 pt-3">
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] ${check === 'bad' ? 'border-red-700 text-red-700' : 'border-emerald-800 text-emerald-800'}`}>{check === 'bad' ? <ShieldAlert size={26} /> : check === 'ok' ? <ShieldCheck size={26} /> : <Stamp size={26} />}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">{check === 'ok' ? 'Sealed and verified: the signature, photo and details match the fingerprint below.' : check === 'bad' ? 'Warning: this record does not match its fingerprint.' : 'Sealed on the driver\'s device.'}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Fingerprint (SHA-256)</div>
            <code className="block break-all text-[11px] leading-snug">{delivery.proof_hash || 'No fingerprint'}</code>
          </div>
        </footer>
      </article>
    </div>
  );
}

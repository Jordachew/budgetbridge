// "Needs attention": ranked rows from useAttention(), each with an icon, plain title, detail and one button.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, CheckCircle2, Clock, Info } from 'lucide-react';
import { Badge, Button, cx } from '../../components/ui.jsx';

const TONE = {
  red: { label: 'Urgent', icon: AlertOctagon, badge: 'red', bar: 'var(--bad)' },
  amber: { label: 'Soon', icon: Clock, badge: 'amber', bar: 'var(--warn)' },
  blue: { label: 'Heads-up', icon: Info, badge: 'neutral', bar: 'var(--axis)' },
};

export default function Attention({ items, limit = 4 }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  const urgent = items.filter((i) => i.tone === 'red').length;
  return (
    <section aria-labelledby="att-h">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 id="att-h" className="font-display text-2xl font-semibold leading-none">Needs attention</h2>
        {items.length > 0 && <span className="text-sm text-ink-500">{urgent ? `${urgent} urgent, ` : ''}{items.length} in all</span>}
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-4 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-5 py-4">
          <CheckCircle2 size={28} style={{ color: 'var(--good)' }} aria-hidden="true" />
          <div>
            <div className="font-bold">All clear</div>
            <p className="text-sm text-ink-500">No overdue invoices, expiring papers or service jobs waiting. Enjoy the quiet.</p>
          </div>
        </div>
      ) : (
        <ul className="paper-card divide-y divide-[var(--hairline)] overflow-hidden">
          {shown.map((it) => {
            const t = TONE[it.tone] || TONE.blue;
            const Icon = it.icon || t.icon;
            return (
              <li key={it.id} className="relative flex items-center gap-3 py-3 pl-5 pr-4 sm:gap-4">
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: t.bar }} aria-hidden="true" />
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200 sm:flex"><Icon size={20} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tone={t.badge} icon={t.icon}>{t.label}</Badge>
                    <span className={cx('font-bold', 'leading-snug')}>{it.title}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">{it.detail}</p>
                </div>
                <Button as={Link} to={it.to} variant={it.tone === 'red' ? 'dark' : 'soft'} size="sm" className="shrink-0">{it.cta || 'Open'}</Button>
              </li>
            );
          })}
          {items.length > limit && (
            <li><button type="button" onClick={() => setAll((v) => !v)} className="w-full px-5 py-2.5 text-left text-sm font-bold text-brand-600 hover:bg-ink-50 dark:text-brand-400 dark:hover:bg-ink-800/60">{all ? 'Show fewer' : `Show ${items.length - limit} more`}</button></li>
          )}
        </ul>
      )}
    </section>
  );
}

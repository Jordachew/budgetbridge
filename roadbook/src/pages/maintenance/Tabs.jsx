import { useEffect, useRef } from 'react';
import { cx } from '../../components/ui.jsx';

/** Underlined page tabs. tabs: [{ value, label, icon, badge?: { text, tone: 'red'|'amber'|'neutral' } }] */
export default function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  const tone = { red: 'bg-[var(--bad)] text-white', amber: 'bg-brand-500 text-ink-950', neutral: 'bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-100' };
  const box = useRef(null);
  useEffect(() => { box.current?.querySelector('[aria-selected=true]')?.scrollIntoView?.({ inline: 'center', block: 'nearest' }); }, [value]);
  return (
    <div ref={box} role="tablist" aria-label={label} className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-[var(--hairline)] px-4 md:mx-0 md:px-0">
      {tabs.map((t) => {
        const on = t.value === value; const Icon = t.icon;
        return (
          <button key={t.value} role="tab" type="button" aria-selected={on} onClick={() => onChange(t.value)}
            className={cx('-mb-px flex shrink-0 items-center gap-2 border-b-[3px] px-3.5 py-3 text-sm font-bold transition-colors', on ? 'border-brand-500 text-ink-900 dark:text-white' : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200')}>
            {Icon && <Icon size={17} />}{t.label}
            {t.badge && <span className={cx('rounded-full px-1.5 py-px text-xs font-bold', tone[t.badge.tone || 'neutral'])}>{t.badge.text}</span>}
          </button>
        );
      })}
    </div>
  );
}

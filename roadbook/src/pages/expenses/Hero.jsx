// The one big figure on the Expenses page: an asphalt readout band, odometer style.
export default function Hero({ label, value, sub, items = [] }) {
  return (
    <section aria-label={label} className="flex h-full flex-col justify-between overflow-hidden rounded-[10px] bg-ink-950 text-white ring-1 ring-ink-800 dark:bg-ink-900">
      <div className="px-5 pb-4 pt-5 sm:px-6">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">{label}</div>
        <div className="mt-2 break-words text-5xl font-bold leading-none tabular-nums text-brand-400 sm:text-6xl">{value}</div>
        {sub && <div className="mt-2 text-sm text-ink-300">{sub}</div>}
      </div>
      {items.length > 0 && (
        <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
          {items.map((i) => (
            <div key={i.label} className="min-w-0 px-4 py-3 sm:px-5">
              <dt className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">{i.label}</dt>
              <dd className="mt-1 truncate text-lg font-bold tabular-nums sm:text-xl" title={i.value}>{i.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="roadline" aria-hidden="true" />
    </section>
  );
}

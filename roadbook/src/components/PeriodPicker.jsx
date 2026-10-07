import { ChevronLeft, ChevronRight } from 'lucide-react';
import { periodRange, periodTitle } from '../core/dates.js';
import { Segmented, IconButton } from './ui.jsx';

/** Controlled period selector. state = { kind: 'week'|'month'|'year'|'all', offset: 0 }. Use usePeriod() for the range. */
export function PeriodPicker({ value, onChange, kinds = ['week', 'month', 'year', 'all'] }) {
  const range = periodRange(value.kind, new Date(), value.offset);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented value={value.kind} onChange={(kind) => onChange({ kind, offset: 0 })} options={kinds.map((k) => ({ value: k, label: k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1) }))} />
      {value.kind !== 'all' && (
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Previous" onClick={() => onChange({ ...value, offset: value.offset - 1 })} />
          <span className="min-w-[8.5rem] text-center text-sm font-medium">{periodTitle(value.kind, range)}</span>
          <IconButton icon={ChevronRight} label="Next" disabled={value.offset >= 0} onClick={() => onChange({ ...value, offset: Math.min(0, value.offset + 1) })} />
        </div>
      )}
    </div>
  );
}
export const rangeOf = (p) => periodRange(p.kind, new Date(), p.offset);

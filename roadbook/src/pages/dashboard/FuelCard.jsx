// Fuel economy as a stat with a sparkline of the last fill-ups, not a chart.
import { Fuel } from 'lucide-react';
import { Spark } from '../../components/charts/index.js';

/** Litres per 100 km between consecutive fill-ups that have an odometer reading and litres. Oldest first. */
export function economySeries(expenses) {
  const fills = expenses.filter((e) => e.category === 'fuel' && e.litres > 0 && e.odometer_m != null).sort((a, b) => a.odometer_m - b.odometer_m);
  const out = [];
  for (let i = 1; i < fills.length; i++) {
    const km = (fills[i].odometer_m - fills[i - 1].odometer_m) / 1000;
    const v = km > 0 ? (fills[i].litres / km) * 100 : null;
    if (v && v > 1 && v < 200) out.push({ v, at: fills[i].spent_at });
  }
  return out.slice(-10);
}

export default function FuelCard({ expenses, economy, unit }) {
  const series = economySeries(expenses);
  const mpg = (l100) => Math.round((235.215 / l100) * 10) / 10;
  const shown = economy == null ? null : unit === 'mi' ? `${mpg(economy)} mpg` : `${economy} L/100 km`;
  const last = series.at(-1)?.v;
  const first = series[0]?.v;
  const trendWords = series.length > 1;
  return (
    <div className="paper-card p-5" role="group" aria-label={shown ? `Fuel economy ${shown}` : 'Fuel economy not available yet'}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-500"><Fuel size={14} aria-hidden="true" /> Fuel economy</div>
      {shown ? (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-bold leading-none">{shown}</div>
            <p className="mt-1.5 text-xs text-ink-500">{series.length > 1 ? `Across your last ${series.length} fill-ups${trendWords ? (last < first ? ", trending better" : ", trending thirstier") : ""}.` : 'From your fuel stops with odometer readings.'}</p>
          </div>
          <Spark values={series.map((s) => (unit === 'mi' ? mpg(s.v) : s.v))} width={110} height={36} label="Fuel economy over your last fill-ups" />
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">Log two fuel stops with litres and the odometer and Roadbook works out how thirsty your truck is.</p>
      )}
    </div>
  );
}

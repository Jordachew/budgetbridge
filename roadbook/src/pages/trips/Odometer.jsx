// Odometer-style readout: one dark cell per digit, leading zeros dimmed, tenths in amber.
import { toUnit } from './shared.js';

export default function Odometer({ meters, unit = 'km', digits = 5, decimals = 1, size = 'lg', showUnit = true, className = '' }) {
  const v = toUnit(meters, unit);
  const whole = String(Math.floor(v)).padStart(digits, '0');
  const dec = decimals ? String(Math.floor((v - Math.floor(v)) * 10 ** decimals + 1e-9)).padStart(decimals, '0').slice(0, decimals) : '';
  const lead = whole.length - String(Math.floor(v)).length;
  const sz = size === 'lg' ? 'h-[3.6rem] w-[2.35rem] text-[2.4rem] sm:h-[4.6rem] sm:w-[3rem] sm:text-[3.1rem]' : size === 'md' ? 'h-9 w-[1.45rem] text-[1.45rem]' : 'h-7 w-[1.1rem] text-[1.05rem]';
  const cell = `inline-flex items-center justify-center rounded-[4px] bg-[#0b0c0f] font-bold leading-none text-white ring-1 ring-black/30 dark:ring-white/10 tabular-nums ${sz}`;
  const split = { backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.05) 0 49%, rgba(0,0,0,0.55) 49% 51%, transparent 51%)' };
  return (
    <div className={`inline-flex items-end gap-2 ${className}`} role="img" aria-label={`${v.toFixed(decimals)} ${unit === 'mi' ? 'miles' : 'kilometres'}`}>
      <span className="inline-flex gap-[3px]" aria-hidden="true">
        {[...whole].map((c, i) => <span key={i} className={cell} style={{ ...split, opacity: i < lead ? 0.38 : 1 }}>{c}</span>)}
        {dec && [...dec].map((c, i) => <span key={`d${i}`} className={`${cell} !bg-brand-500 !text-ink-950`} style={split}>{c}</span>)}
      </span>
      {showUnit && <span className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-400" aria-hidden="true">{unit}</span>}
    </div>
  );
}

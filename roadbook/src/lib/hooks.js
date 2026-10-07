import { useCallback, useMemo } from 'react';
import { fmtMoney, fmtDistance } from '../core/format.js';
import { useProfile } from '../state/data.js';
import { usePrefs } from '../state/prefs.js';

/** The driver's working currency from their profile ('JMD' | 'USD'). */
export function useCurrency() {
  const p = useProfile();
  return p.currency === 'USD' ? 'USD' : 'JMD';
}
/** money(cents, currency?) -> "J$12,450". Defaults to the profile currency. */
export function useMoney() {
  const cur = useCurrency();
  return useCallback((cents, c) => fmtMoney(cents, c || cur), [cur]);
}
/** dist(metres) -> "123.4 km" using the unit preference. */
export function useDistance() {
  const { unit } = usePrefs();
  return useMemo(() => (m) => fmtDistance(m, unit), [unit]);
}
export function useDebounced(fn, ms) {
  return useMemo(() => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }, [fn, ms]);
}

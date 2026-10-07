import { useCallback, useState } from 'react';
import { getPositionOnce } from '../../core/gps.js';

/** The driver's position on request ("My location"). state: idle | loading | ok | failed */
export function useMe() {
  const [me, setMe] = useState(null);
  const [state, setState] = useState('idle');
  const locate = useCallback(async () => {
    setState('loading');
    const p = await getPositionOnce({ timeout: 15000, maxAge: 60000 });
    if (p) { setMe(p); setState('ok'); } else setState('failed');
    return p;
  }, []);
  return { me, state, locate };
}

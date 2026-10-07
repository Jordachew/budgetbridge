import { useEffect, useRef, useState } from 'react';
import { ls } from '../../core/util.js';
import { fireTime, reminderState } from '../../core/reminders-logic.js';

const KEY = 'roadbook.notify';
export const notifySupported = () => typeof Notification !== 'undefined';

/** Opt-in browser notifications. enabled = permission granted AND the driver switched it on. */
export function useNotifyOptIn() {
  const [perm, setPerm] = useState(notifySupported() ? Notification.permission : 'unsupported');
  const [on, setOn] = useState(ls(KEY) === '1');
  async function enable() {
    if (!notifySupported()) return false;
    let p = Notification.permission;
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch { p = 'denied'; } }
    setPerm(p);
    const ok = p === 'granted';
    ls(KEY, ok ? '1' : null); setOn(ok);
    return ok;
  }
  function disable() { ls(KEY, null); setOn(false); }
  return { perm, enabled: on && perm === 'granted', enable, disable };
}

/** While the app is open, show a notification once for each reminder that has come due. */
export function useDueNotifier(enabled, reminders, odometer_m) {
  const seen = useRef(new Set());
  const data = useRef({ reminders, odometer_m });
  data.current = { reminders, odometer_m };
  useEffect(() => {
    if (!enabled) return undefined;
    const check = () => {
      const now = new Date();
      for (const r of data.current.reminders) {
        const st = reminderState(r, { now, odometer_m: data.current.odometer_m });
        if (!['soon', 'due', 'overdue'].includes(st)) continue;
        if (r.kind === 'date') { const f = fireTime(r); if (f == null || f > now.getTime() || now.getTime() - f > 12 * 3600000) continue; }
        const key = `${r.id}|${r.due_at || r.due_odometer_m}|${r.snoozed_until || ''}`;
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        try { new Notification(r.title, { body: st === 'soon' ? 'Coming up soon.' : 'This reminder is due.', tag: key }); } catch { /* not allowed here: ignore */ }
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [enabled]);
}

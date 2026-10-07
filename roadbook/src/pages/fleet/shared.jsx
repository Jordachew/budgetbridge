import { useEffect, useState } from 'react';
import { Copy, KeyRound, MessageCircle, RefreshCw, Share2 } from 'lucide-react';
import { Banner, Button, cx, useConfirm } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { session } from '../../state/app.jsx';
import { initials } from '../../core/format.js';
import { plainError } from './CrewStart.jsx';

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', driver: 'Driver' };
export const ROLE_TONE = { owner: 'brand', admin: 'blue', driver: 'neutral' };
export const ACTIVE_STATUS = ['picked_up', 'in_transit'];

/** Round initials. `tone` picks a calm tint from the categorical slots so people are told apart without a rainbow. */
export function Avatar({ name, size = 40, mine }) {
  const hue = [...String(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  const tints = ['bg-ink-200 text-ink-800', 'bg-brand-100 text-brand-700', 'bg-sky-100 text-sky-900', 'bg-emerald-100 text-emerald-900'];
  const dark = ['dark:bg-ink-700 dark:text-ink-100', 'dark:bg-brand-500/25 dark:text-brand-300', 'dark:bg-sky-950 dark:text-sky-300', 'dark:bg-emerald-950 dark:text-emerald-300'];
  return <span aria-hidden className={cx('flex shrink-0 items-center justify-center rounded-full font-bold', mine ? 'bg-brand-500 text-ink-950' : `${tints[hue]} ${dark[hue]}`)} style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</span>;
}

/** Underline tabs with optional counts. */
export function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  return (
    <div role="tablist" aria-label={label} className="no-print -mx-4 mb-6 flex gap-0.5 overflow-x-auto border-b border-[var(--hairline)] px-4 md:mx-0 md:px-0">
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button key={t.id} role="tab" type="button" aria-selected={on} onClick={() => onChange(t.id)}
            className={cx('relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-3 text-sm font-bold', on ? 'text-ink-900 after:absolute after:inset-x-1 after:-bottom-px after:h-[3px] after:rounded-t after:bg-brand-500 dark:text-white' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-200')}>
            {t.icon && <t.icon size={15} aria-hidden />}{t.label}
            {t.n > 0 && <span className={cx('rounded-[3px] px-1.5 text-xs tabular-nums leading-5', t.hot ? 'bg-brand-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}><span className="sr-only">, </span>{t.n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A join code laid out like a ticket stub: big code, then copy / WhatsApp / share. */
export function JoinCode({ crew, online }) {
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [code, setCode] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!online) return undefined;
    let live = true;
    session.api.joinCode(crew.id).then((c) => { if (live) { setCode(c); setErr(''); } }).catch((e) => { if (live) setErr(plainError(e, 'Could not load the join code.')); });
    return () => { live = false; };
  }, [crew.id, online]);
  const link = code ? `${location.origin}${location.pathname}#/fleet?join=${code}` : '';
  const invite = code ? `Join ${crew.name} on Roadbook. Open ${link} or enter code ${code}.` : '';
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Could not copy. Select the text and copy it by hand.', { bad: true }); } };
  const regen = async () => {
    if (!(await confirm({ title: 'Make a new join code?', text: 'The old code stops working straight away. Drivers already in your company are not affected.', confirmLabel: 'New code', danger: true }))) return;
    setBusy(true);
    try { setCode(await session.api.newJoinCode(crew.id)); toast('New join code ready.'); } catch (e) { toast(plainError(e, 'Could not make a new code.'), { bad: true }); } finally { setBusy(false); }
  };
  return (
    <section className="overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] sm:flex" aria-label="Invite drivers">
      <div className="flex-1 p-5">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-500"><KeyRound size={14} /> Invite a driver</p>
        {!online ? <p className="mt-3 text-sm text-ink-500">Connect to the internet to see the join code.</p>
          : err ? <div className="mt-3"><Banner tone="red">{err}</Banner></div>
          : code ? (
            <>
              <p className="mt-2 font-mono text-3xl font-bold tracking-[0.28em]" aria-label={`Join code ${code}`}>{code}</p>
              <p className="mt-1 text-sm text-ink-500">Send this to a driver. They open Fleet, enter the code and they are in.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="dark" icon={MessageCircle} as="a" href={`https://wa.me/?text=${encodeURIComponent(invite)}`} target="_blank" rel="noopener noreferrer">WhatsApp</Button>
                <Button variant="soft" size="sm" icon={Copy} onClick={() => copy(code, 'Code copied.')}>Copy code</Button>
                <Button variant="soft" size="sm" icon={Copy} onClick={() => copy(link, 'Invite link copied.')}>Copy link</Button>
                {typeof navigator.share === 'function' && <Button variant="soft" size="sm" icon={Share2} onClick={() => navigator.share({ title: `Join ${crew.name} on Roadbook`, text: invite, url: link }).catch(() => {})}>Share</Button>}
                <Button variant="ghost" size="sm" icon={RefreshCw} loading={busy} onClick={regen}>New code</Button>
              </div>
            </>
          ) : <p className="mt-3 text-sm text-ink-500">Loading…</p>}
      </div>
      <div className="hidden w-3 shrink-0 bg-[radial-gradient(circle,var(--paper)_3px,transparent_3.5px)] bg-[length:12px_14px] bg-repeat-y sm:block" aria-hidden />
      <div className="flex items-center bg-ink-100 px-5 py-3 text-xs text-ink-500 dark:bg-ink-800 sm:w-44">Making a new code stops the old one working. People already in are not affected.</div>
      {node}
    </section>
  );
}

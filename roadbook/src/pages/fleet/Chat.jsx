import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, MessageCircle, Send, Trash2 } from 'lucide-react';
import { Empty, IconButton, cx, useConfirm } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { create, save, useRows, useProfile } from '../../state/data.js';
import { session } from '../../state/app.jsx';
import { fmtDate, fmtTime } from '../../core/format.js';
import { ls } from '../../core/util.js';
import { Avatar } from './shared.jsx';

const seenKey = (crewId) => `roadbook.chatSeen.${crewId}`;
/** Messages from other people that are newer than the last time this chat was open. */
export function unreadCount(messages, crewId, me) {
  const seen = ls(seenKey(crewId)) || '';
  return messages.filter((m) => m.crew_id === crewId && m.user_id !== me && !m.deleted_at && m.created_at > seen).length;
}

const dayKey = (iso) => new Date(iso).toDateString();
function dayLabel(iso) {
  const d = new Date(iso);
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : fmtDate(d, { weekday: true, year: diff > 300 });
}
const GROUP_MS = 5 * 60 * 1000;

export default function Chat({ ctx }) {
  const { crew, me, isManager, online } = ctx;
  const toast = useToast();
  const profile = useProfile();
  const all = useRows('messages');
  const [confirm, node] = useConfirm();
  const [text, setText] = useState('');
  const endRef = useRef(null);
  const boxRef = useRef(null);
  const taRef = useRef(null);
  const [seenAt] = useState(() => ls(seenKey(crew.id)) || '');
  const msgs = useMemo(() => all.filter((m) => m.crew_id === crew.id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')), [all, crew.id]);
  const firstNew = msgs.find((m) => m.user_id !== me && m.created_at > seenAt)?.id;
  const latest = msgs.length ? msgs[msgs.length - 1].created_at : '';

  useEffect(() => { if (latest) ls(seenKey(crew.id), latest); }, [latest, crew.id]);
  // Desktop scrolls the panel, phones scroll the page; both end at the newest message.
  useEffect(() => {
    const wide = window.matchMedia?.('(min-width: 768px)').matches;
    if (wide && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
    else endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length]);
  useEffect(() => { const t = taRef.current; if (t) { t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 128)}px`; } }, [text]);

  // Optimistic: the bubble appears and the box clears at once; if saving fails the words come back.
  async function send() {
    const body = text.trim();
    if (!body) return;
    if (body.length > 1000) return toast('Messages can be up to 1000 letters. Please shorten it.', { bad: true });
    setText('');
    try {
      await create('messages', { crew_id: crew.id, author_name: (profile.display_name || 'Driver').slice(0, 60), body });
      if (!online) toast('Saved. It will send when you have signal.');
    } catch (e) { console.error(e); setText(body); toast('Could not send that message. Your words are still in the box.', { bad: true }); }
  }
  async function del(m) {
    if (!online) return toast('You are offline. Try again when you have signal.', { bad: true });
    if (!(await confirm({ title: 'Delete this message?', text: 'It will disappear for everyone in the company.', confirmLabel: 'Delete', danger: true }))) return;
    try { await session.api.deleteMessage(m.id); await save('messages', { ...m, deleted_at: new Date().toISOString() }, { fromServer: true }); } catch { toast('Could not delete the message.', { bad: true }); }
  }

  const items = [];
  msgs.forEach((m, i) => {
    const prev = msgs[i - 1];
    const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
    if (newDay) items.push({ type: 'day', key: `d-${m.id}`, label: dayLabel(m.created_at) });
    if (m.id === firstNew) items.push({ type: 'new', key: `n-${m.id}` });
    const grouped = prev && !newDay && prev.user_id === m.user_id && m.id !== firstNew && new Date(m.created_at) - new Date(prev.created_at) < GROUP_MS;
    const next = msgs[i + 1];
    const last = !next || next.user_id !== m.user_id || dayKey(next.created_at) !== dayKey(m.created_at) || new Date(next.created_at) - new Date(m.created_at) >= GROUP_MS || next.id === firstNew;
    items.push({ type: 'msg', key: m.id, m, grouped, last });
  });

  return (
    <div className="md:flex md:h-[min(40rem,calc(100dvh-15rem))] md:flex-col md:overflow-hidden md:rounded-[10px] md:border md:border-[var(--hairline)] md:bg-[var(--surface)]">
      <div ref={boxRef} className="min-h-[40vh] flex-1 py-2 md:overflow-y-auto md:px-5" role="log" aria-live="polite" aria-label="Company chat">
        {!msgs.length ? <Empty icon={MessageCircle} title="No messages yet" text="Say hello to your team. Messages go to everyone in the company, and they work offline too." />
          : items.map((it) => {
            if (it.type === 'day') return <p key={it.key} className="sticky top-0 z-[1] my-3 flex justify-center"><span className="rounded-full bg-ink-200/80 px-3 py-0.5 text-xs font-bold text-ink-600 backdrop-blur dark:bg-ink-700/80 dark:text-ink-200">{it.label}</span></p>;
            if (it.type === 'new') return <p key={it.key} className="my-3 flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400"><span className="h-px flex-1 bg-brand-500/50" />Unread<span className="h-px flex-1 bg-brand-500/50" /></p>;
            const { m, grouped, last } = it;
            const mine = m.user_id === me;
            const sending = m._dirty;
            return (
              <div key={it.key} className={cx('group flex items-end gap-2', mine ? 'flex-row-reverse' : '', grouped ? 'mt-0.5' : 'mt-3')}>
                {!mine && (last ? <Avatar name={m.author_name} size={30} /> : <span className="w-[30px] shrink-0" />)}
                <div className={cx('max-w-[82%] px-3.5 py-2 text-[15px] leading-snug sm:max-w-[70%]', mine ? 'bg-brand-500 text-ink-950' : 'bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-ink-50',
                  mine ? (last ? 'rounded-[16px] rounded-br-[4px]' : 'rounded-[16px]') : (last ? 'rounded-[16px] rounded-bl-[4px]' : 'rounded-[16px]'))}>
                  {!mine && !grouped && <p className="mb-0.5 text-xs font-bold text-brand-700 dark:text-brand-300">{m.author_name || 'Driver'}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  {last && (
                    <p className={cx('mt-0.5 flex items-center justify-end gap-1 text-[11px]', mine ? 'text-ink-900/70' : 'text-ink-500')}>
                      {fmtTime(m.created_at)}
                      {mine && (sending ? <Clock size={12} aria-label="Sending" /> : <Check size={12} aria-label="Sent" />)}
                    </p>
                  )}
                </div>
                {(mine || isManager) && <IconButton icon={Trash2} label="Delete message" className="shrink-0 opacity-50 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" onClick={() => del(m)} />}
              </div>
            );
          })}
        <div ref={endRef} />
      </div>
      <form className="sticky bottom-[3.9rem] z-20 -mx-4 flex items-end gap-2 border-t border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:bg-[var(--paper)] md:px-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea ref={taRef} aria-label="Message" rows={1} value={text} maxLength={1000} placeholder="Write a message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-ink-300 bg-[var(--surface)] px-4 py-2.5 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-ink-600" />
        <button type="submit" aria-label="Send message" disabled={!text.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-ink-950 transition-opacity hover:bg-brand-400 disabled:opacity-40"><Send size={18} /></button>
      </form>
      {node}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { Button, Card, Empty, IconButton, useConfirm } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { create, save, useRows, useProfile } from '../../state/data.js';
import { session } from '../../state/app.jsx';
import { fmtDate, fmtTime } from '../../core/format.js';
import { ls } from '../../core/util.js';
import { cx } from '../../components/ui.jsx';

const seenKey = (crewId) => `roadbook.chatSeen.${crewId}`;
/** Messages from other people that are newer than the last time this chat was open. */
export function unreadCount(messages, crewId, me) {
  const seen = ls(seenKey(crewId)) || '';
  return messages.filter((m) => m.crew_id === crewId && m.user_id !== me && !m.deleted_at && m.created_at > seen).length;
}

export default function Chat({ ctx }) {
  const { crew, me, isManager, online } = ctx;
  const toast = useToast();
  const profile = useProfile();
  const all = useRows('messages');
  const [confirm, node] = useConfirm();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const box = useRef(null);
  const [seenAt] = useState(() => ls(seenKey(crew.id)) || '');
  const msgs = useMemo(() => all.filter((m) => m.crew_id === crew.id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')), [all, crew.id]);
  const firstNew = msgs.find((m) => m.user_id !== me && m.created_at > seenAt)?.id;
  const latest = msgs.length ? msgs[msgs.length - 1].created_at : '';

  useEffect(() => { if (latest) ls(seenKey(crew.id), latest); }, [latest, crew.id]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    if (body.length > 1000) return toast('Messages can be up to 1000 letters. Please shorten it.', { bad: true });
    setSending(true);
    try {
      await create('messages', { crew_id: crew.id, author_name: (profile.display_name || 'Driver').slice(0, 60), body });
      setText('');
      if (!online) toast('Saved. It will send when you have signal.');
    } catch (e) { console.error(e); toast('Could not send that message.', { bad: true }); } finally { setSending(false); }
  }
  async function del(m) {
    if (!online) return toast('You are offline. Try again when you have signal.', { bad: true });
    if (!(await confirm({ title: 'Delete this message?', text: 'It will disappear for everyone in the company.', confirmLabel: 'Delete', danger: true }))) return;
    try { await session.api.deleteMessage(m.id); await save('messages', { ...m, deleted_at: new Date().toISOString() }, { fromServer: true }); } catch { toast('Could not delete the message.', { bad: true }); }
  }

  let lastDay = '';
  return (
    <Card className="flex h-[min(34rem,70vh)] flex-col !p-0">
      <div ref={box} className="flex-1 space-y-2 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Company chat">
        {!msgs.length && <Empty icon={MessageCircle} title="No messages yet" text="Say hello to your team. Messages go to everyone in the company." />}
        {msgs.map((m) => {
          const mine = m.user_id === me;
          const day = fmtDate(m.created_at, { weekday: false });
          const showDay = day !== lastDay; lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <p className="my-2 text-center text-xs font-medium text-ink-500">{day}</p>}
              {m.id === firstNew && <p className="my-2 flex items-center gap-2 text-xs font-semibold text-brand-600"><span className="h-px flex-1 bg-brand-500/40" />New messages<span className="h-px flex-1 bg-brand-500/40" /></p>}
              <div className={cx('group flex items-end gap-1', mine && 'flex-row-reverse')}>
                <div className={cx('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'rounded-br-md bg-brand-500 text-white' : 'rounded-bl-md bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-ink-50')}>
                  {!mine && <p className="mb-0.5 text-xs font-semibold opacity-70">{m.author_name || 'Driver'}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cx('mt-0.5 text-right text-[10px]', mine ? 'text-white/80' : 'text-ink-500')}>{fmtTime(m.created_at)}{m._dirty ? ' · sending' : ''}</p>
                </div>
                {(mine || isManager) && <IconButton icon={Trash2} label="Delete message" className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" onClick={() => del(m)} />}
              </div>
            </div>
          );
        })}
      </div>
      <form className="flex items-end gap-2 border-t border-ink-100 p-3 dark:border-ink-800" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea aria-label="Message" rows={1} value={text} maxLength={1000} placeholder="Write a message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-ink-700 dark:bg-ink-900" />
        <Button type="submit" icon={Send} loading={sending} disabled={!text.trim()} aria-label="Send message">Send</Button>
      </form>
      {node}
    </Card>
  );
}

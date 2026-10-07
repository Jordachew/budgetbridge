import { useMemo } from 'react';
import { BellRing, Copy, Mail, MessageCircle, Send } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { useProfile } from '../../state/data.js';
import { Menu, MenuItem } from './Menu.jsx';
import { chaseMailto, chaseMessage, whatsappLink } from './helpers.js';
import { invoiceText, mailtoLink } from './summary.js';
import { markSent, sendVia } from './actions.js';
import { todayStr } from './totals.js';

/** One-tap reminder: opens WhatsApp or email with the message already written, or copies it. */
export function ChaseMenu({ invs, label = 'Chase', size = 'sm', variant = 'outline', align = 'right' }) {
  const profile = useProfile();
  const toast = useToast();
  const today = todayStr();
  const text = useMemo(() => chaseMessage(invs, profile, today), [invs, profile, today]);
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Reminder copied. Paste it into any chat.'); } catch { toast('Could not copy. Your browser blocked it.', { bad: true }); } };
  return (
    <Menu align={align} width="w-[min(20rem,calc(100vw-2rem))]" trigger={({ open, toggle }) => (
      <Button variant={variant} size={size} icon={BellRing} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{label}</Button>
    )}>
      <p className="px-3 pb-2 pt-1.5 text-xs leading-snug text-ink-500"><span className="mb-0.5 block font-bold uppercase tracking-wide">Message ready</span><span className="line-clamp-4 whitespace-pre-line">{text}</span></p>
      <MenuItem icon={MessageCircle} href={whatsappLink(text)} external>Open in WhatsApp</MenuItem>
      <MenuItem icon={Mail} href={chaseMailto(invs, text, profile)}>Email {invs[0].customer_email ? invs[0].customer_email : 'a reminder'}</MenuItem>
      <MenuItem icon={Copy} onClick={copy}>Copy message</MenuItem>
    </Menu>
  );
}

/** Send a draft: email, WhatsApp or copy the text. The invoice becomes "Sent". */
export function SendMenu({ inv, label = 'Send', size = 'sm', variant = 'primary', align = 'right' }) {
  const profile = useProfile();
  const toast = useToast();
  return (
    <Menu align={align} trigger={({ open, toggle }) => <Button variant={variant} size={size} icon={Send} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{label}</Button>}>
      <MenuItem icon={Mail} onClick={() => sendVia('email', inv, profile, toast)}>Email it</MenuItem>
      <MenuItem icon={MessageCircle} onClick={() => sendVia('whatsapp', inv, profile, toast)}>WhatsApp it</MenuItem>
      <MenuItem icon={Copy} onClick={() => sendVia('copy', inv, profile, toast)}>Copy the text</MenuItem>
      <MenuItem icon={Send} onClick={() => markSent(inv, toast)}>Just mark as sent</MenuItem>
    </Menu>
  );
}
export { invoiceText, mailtoLink };

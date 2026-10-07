import { useState } from 'react';
import { Building2, KeyRound } from 'lucide-react';
import { Banner, Button, Card, CardTitle, Field, Input, Switch } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { session } from '../../state/app.jsx';

const plainError = (e, fallback) => {
  const m = String(e?.message || '');
  if (/failed to fetch|network|load failed/i.test(m)) return 'No connection. Check your signal and try again.';
  return m && m.length < 140 ? m : fallback;
};
export { plainError };

/** Shown when you are not in a crew yet: start a company, or join one with a code. */
export default function CrewStart({ refresh, online, initialCode = '' }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode);
  const [share, setShare] = useState(false);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState('');

  async function make() {
    const n = name.trim();
    if (n.length < 2) return setErr({ name: 'Company name needs at least 2 letters.' });
    if (n.length > 60) return setErr({ name: 'Company name can be up to 60 letters.' });
    setErr({}); setBusy('make');
    try { await session.api.createCrew(n); await refresh(); toast(`${n} is ready. Share your join code with your drivers.`); }
    catch (e) { setErr({ name: plainError(e, 'Could not create the company. Try again.') }); } finally { setBusy(''); }
  }
  async function join() {
    const c = code.trim().toUpperCase().replace(/\s+/g, '');
    if (!c) return setErr({ code: 'Type the join code your owner gave you.' });
    setErr({}); setBusy('join');
    try { await session.api.joinCrew(c, share); await refresh(); toast('You joined the company.'); }
    catch (e) { setErr({ code: plainError(e, 'That code did not work. Check it and try again.') }); } finally { setBusy(''); }
  }

  return (
    <>
      {!online && <div className="mb-4"><Banner tone="amber">You are offline. Creating or joining a company needs a connection.</Banner></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle title="Create a company" sub="You run the trucks. Dispatch loads, chat and pay your drivers." />
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-700/20"><Building2 size={20} /></span>
          <form onSubmit={(e) => { e.preventDefault(); make(); }} className="space-y-3">
            <Field label="Company name" error={err.name}>{(id) => <Input id={id} value={name} maxLength={60} placeholder="e.g. Brown's Haulage" onChange={(e) => setName(e.target.value)} />}</Field>
            <Button type="submit" loading={busy === 'make'} disabled={!online}>Create company</Button>
          </form>
        </Card>
        <Card>
          <CardTitle title="Join with a code" sub="Driving for a company? Ask the owner for their join code." />
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950"><KeyRound size={20} /></span>
          <form onSubmit={(e) => { e.preventDefault(); join(); }} className="space-y-3">
            <Field label="Join code" error={err.code}>{(id) => <Input id={id} value={code} autoCapitalize="characters" className="font-mono uppercase tracking-widest" placeholder="ABCD-1234" onChange={(e) => setCode(e.target.value)} />}</Field>
            <Switch checked={share} onChange={setShare} label="Share my records with the company" hint="Lets the owner see your trips, loads and totals. You can change this any time." />
            <Button type="submit" loading={busy === 'join'} disabled={!online}>Join company</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

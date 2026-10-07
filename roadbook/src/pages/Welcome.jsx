import { useState } from 'react';
import { Truck, FileText, Receipt, Users, WifiOff } from 'lucide-react';
import { Button, Field, Input, Card, Banner } from '../components/ui.jsx';
import { useApp } from '../state/app.jsx';
import { configured, signIn, signUp, resetPassword, updatePassword, friendlyAuthError } from '../core/auth.js';
import { ls } from '../core/util.js';

const PERKS = [
  [FileText, 'Invoices that get you paid', 'Bill customers, track who owes you, print or share.'],
  [Receipt, 'Expenses and fuel', 'Snap a receipt and Roadbook reads it for you.'],
  [Users, 'Run a fleet', 'Dispatch loads, chat, settle driver pay.'],
  [WifiOff, 'Works with no signal', 'Everything saves on the device and syncs later.'],
];

export default function Welcome({ recovery }) {
  const { useLocal, signedIn, reboot } = useApp();
  const [mode, setMode] = useState(recovery ? 'newpw' : 'in');   // in | up | reset | newpw
  const [f, setF] = useState({ name: '', email: '', pw: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const canAccount = configured();

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'in') signedIn(await signIn(f.email, f.pw));
      else if (mode === 'up') {
        if (f.pw.length < 8) throw new Error('password too short');
        const r = await signUp(f.email, f.pw, f.name);
        if (r.needsConfirm) { ls('roadbook.migrateLocal', f.email.trim().toLowerCase()); setMsg({ tone: 'green', text: 'Check your email and tap the link we sent, then come back and sign in.' }); setMode('in'); }
        else signedIn(r.user);
      } else if (mode === 'reset') { await resetPassword(f.email); setMsg({ tone: 'green', text: 'If that email has an account, a reset link is on its way.' }); }
      else { if (f.pw.length < 8) throw new Error('password too short'); await updatePassword(f.pw); location.hash = '#/'; reboot(); }
    } catch (err) { setMsg({ tone: 'red', text: friendlyAuthError(err) }); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3"><img src="./icons/icon.svg" alt="" className="h-10 w-10 rounded-xl" /><span className="text-2xl font-bold tracking-tight">Roadbook</span></div>
        <div>
          <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">The back office for every truck on the road.</h1>
          <ul className="mt-10 space-y-5">
            {PERKS.map(([Icon, t, d]) => (
              <li key={t} className="flex gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-400"><Icon size={20} /></span><span><span className="block font-semibold">{t}</span><span className="text-sm text-ink-300">{d}</span></span></li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-ink-400">Built for owner-operators and fleets.</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><Truck className="text-brand-500" /><span className="text-xl font-bold">Roadbook</span></div>
          <h2 className="text-2xl font-bold tracking-tight">{{ in: 'Welcome back', up: 'Create your account', reset: 'Reset your password', newpw: 'Choose a new password' }[mode]}</h2>
          <p className="mt-1 text-sm text-ink-500">{mode === 'in' ? 'Sign in to back up and share across devices.' : mode === 'up' ? 'Free. Your records stay private.' : ''}</p>
          {msg && <div className="mt-4"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
          {canAccount && (
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === 'up' && <Field label="Your name">{(id) => <Input id={id} value={f.name} onChange={set('name')} autoComplete="name" required />}</Field>}
              {mode !== 'newpw' && <Field label="Email">{(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} autoComplete="email" required />}</Field>}
              {mode !== 'reset' && <Field label={mode === 'newpw' ? 'New password' : 'Password'} hint={mode !== 'in' ? 'At least 8 characters.' : undefined}>{(id) => <Input id={id} type="password" value={f.pw} onChange={set('pw')} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={mode === 'in' ? 1 : 8} />}</Field>}
              <Button type="submit" size="lg" className="w-full" loading={busy}>{{ in: 'Sign in', up: 'Create account', reset: 'Send reset link', newpw: 'Save password' }[mode]}</Button>
              <div className="flex justify-between text-sm">
                {mode === 'in' ? <><button type="button" className="font-medium text-brand-600" onClick={() => setMode('up')}>Create an account</button><button type="button" className="text-ink-500" onClick={() => setMode('reset')}>Forgot password?</button></> : mode !== 'newpw' && <button type="button" className="font-medium text-brand-600" onClick={() => setMode('in')}>Back to sign in</button>}
              </div>
            </form>
          )}
          <Card className="mt-8 !p-4">
            <p className="text-sm font-semibold">Just want to try it?</p>
            <p className="mt-1 text-xs text-ink-500">Use Roadbook with no account. Everything stays on this device. You can make an account later and keep your records.</p>
            <Button variant="outline" className="mt-3 w-full" onClick={useLocal}>Continue without an account</Button>
          </Card>
          <p className="mt-6 text-center text-xs text-ink-500"><a className="underline" href="./privacy.html">Privacy</a> · <a className="underline" href="./accessibility.html">Accessibility</a></p>
        </div>
      </section>
    </div>
  );
}

import { useRef, useState } from 'react';
import { LogOut, Download, Trash2, Upload, FlaskConical } from 'lucide-react';
import { PageHeader, Card, CardTitle, Field, Input, Select, Segmented, Button, Banner, Switch, Kbd, useConfirm } from '../components/ui.jsx';
import { hasDemo, loadDemo, clearDemo } from '../lib/demo.js';
import { useApp, session } from '../state/app.jsx';
import { useProfile } from '../state/data.js';
import { usePrefs, setPref } from '../state/prefs.js';
import { useToast } from '../components/toast.jsx';
import * as store from '../core/store.js';
import { TABLES } from '../core/db.js';
import { signOut } from '../core/auth.js';
import { ls } from '../core/util.js';

export default function Settings() {
  const { isAccount, user, status, syncNow } = useApp();
  const profile = useProfile();
  const prefs = usePrefs();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [name, setName] = useState(profile.display_name || '');
  const [truck, setTruck] = useState(profile.truck_label || '');
  const file = useRef(null);
  const cfg = window.ROADBOOK_CONFIG || {};

  const saveProfile = (patch) => store.setProfile({ ...store.getProfile(), ...patch });

  async function exportAll() {
    const out = { exported_at: new Date().toISOString(), app: 'roadbook', version: 2, profile: store.getProfile() };
    for (const t of TABLES) out[t] = store.rows(t).map(store.toServer);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    a.download = `roadbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }
  async function importAll(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'roadbook') throw new Error('not a Roadbook backup');
      let n = 0;
      for (const t of TABLES) if (Array.isArray(data[t])) { const rows = data[t].filter((r) => r?.id); await store.importRows(t, rows); n += rows.length; }
      toast(`Restored ${n} records.`);
    } catch { toast('That file is not a Roadbook backup.', { bad: true }); }
  }
  async function doSignOut() {
    if (store.dirtyCount() && !(await confirm({ title: 'Sign out?', text: `${store.dirtyCount()} changes have not been backed up yet. They stay on this device and upload next time you sign in.`, confirmLabel: 'Sign out' }))) return;
    session.signingOut = true;
    await syncNow(); await signOut(); ls('roadbook.lastUser', null); setPref({ lastMode: null }); location.reload();
  }
  async function deleteAccount() {
    if (!(await confirm({ danger: true, title: 'Delete everything?', text: 'This permanently deletes your Roadbook records and files from the server and this device. It cannot be undone.', confirmLabel: 'Delete everything' }))) return;
    try { await session.api.deleteMyAccount(); await store.getDb().wipe(); await signOut(); ls('roadbook.lastUser', null); location.reload(); } catch { toast('Could not delete. Check your signal and try again.', { bad: true }); }
  }

  return (
    <>
      <PageHeader title="Settings" sub={isAccount ? user.email : 'No account: records are saved on this device only'} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle title="You and your truck" />
          <div className="space-y-4">
            <Field label="Your name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => saveProfile({ display_name: name.trim().slice(0, 60) })} />}</Field>
            <Field label="Truck name or plate">{(id) => <Input id={id} value={truck} onChange={(e) => setTruck(e.target.value)} onBlur={() => saveProfile({ truck_label: truck.trim().slice(0, 40) })} />}</Field>
            <Field label="Money currency" hint="Used for totals and new records.">{(id) => <Select id={id} value={profile.currency || 'JMD'} onChange={(e) => saveProfile({ currency: e.target.value })}><option value="JMD">Jamaican dollars (J$)</option><option value="USD">US dollars (US$)</option></Select>}</Field>
          </div>
        </Card>

        <Card>
          <CardTitle title="Look and feel" />
          <div className="space-y-4">
            <Field label="Theme"><Segmented value={prefs.theme} onChange={(theme) => setPref({ theme })} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Field>
            <Field label="Text size"><Segmented value={prefs.textSize} onChange={(textSize) => setPref({ textSize })} options={[{ value: 100, label: 'Normal' }, { value: 115, label: 'Large' }, { value: 130, label: 'Huge' }]} /></Field>
            <Field label="Distance unit"><Segmented value={prefs.unit} onChange={(unit) => setPref({ unit })} options={[{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }]} /></Field>
            <Switch checked={!!prefs.chartTexture} onChange={(chartTexture) => setPref({ chartTexture })} label="Patterns on charts" hint="Adds diagonal hatching so series can be told apart without colour. Also used when printing." />
          </div>
        </Card>

        <Card>
          <CardTitle title="Shortcuts" sub="Work faster from a keyboard" />
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between"><span>Search or jump anywhere</span><span className="flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span></li>
            <li className="flex items-center justify-between"><span>Search (when not typing)</span><Kbd>/</Kbd></li>
            <li className="flex items-center justify-between"><span>Add something new</span><Kbd>N</Kbd></li>
            <li className="flex items-center justify-between"><span>Close a window</span><Kbd>Esc</Kbd></li>
          </ul>
        </Card>

        {!isAccount && (
          <Card>
            <CardTitle title="Sample data" sub="Explore a full set of loads, invoices and expenses" />
            <p className="mb-3 text-sm text-ink-600 dark:text-ink-300">Only for trying Roadbook without an account. It is clearly separate and one tap removes it.</p>
            {hasDemo()
              ? <Button variant="outline" icon={Trash2} onClick={async () => { await clearDemo(); toast('Sample data removed.'); }}>Remove sample data</Button>
              : <Button variant="soft" icon={FlaskConical} onClick={async () => { await loadDemo(); toast('Sample data added. Explore!'); }}>Add sample data</Button>}
          </Card>
        )}

        <Card>
          <CardTitle title="Backup and account" />
          {isAccount ? (
            <div className="space-y-3 text-sm">
              <p>Status: <b>{status.state === 'idle' ? 'Backed up' : status.state}</b>{status.pending ? ` · ${status.pending} changes waiting` : ''}{status.failed ? ` · ${status.failed} refused by server` : ''}</p>
              <div className="flex flex-wrap gap-2"><Button variant="soft" onClick={syncNow}>Sync now</Button><Button variant="outline" icon={LogOut} onClick={doSignOut}>Sign out</Button></div>
            </div>
          ) : <Banner tone="amber">You are using Roadbook without an account. Sign out of guest mode to create one: <button className="font-semibold underline" onClick={() => { setPref({ lastMode: null }); ls('roadbook.migrateLocal', null); location.reload(); }}>make an account</button>.</Banner>}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4 dark:border-ink-800">
            <Button variant="outline" icon={Download} onClick={exportAll}>Download backup</Button>
            <Button variant="outline" icon={Upload} onClick={() => file.current?.click()}>Restore backup</Button>
            <input ref={file} type="file" accept="application/json" className="hidden" onChange={importAll} />
          </div>
        </Card>

        <Card>
          <CardTitle title="About" />
          <div className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
            <p>Roadbook 2.0 · {cfg.supportEmail ? <>Help: <a className="underline" href={`mailto:${cfg.supportEmail}`}>{cfg.supportEmail}</a></> : null}</p>
            <p><a className="underline" href="./privacy.html">Privacy notice</a> · <a className="underline" href="./accessibility.html">Accessibility statement</a></p>
          </div>
          {isAccount && <div className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-800"><Button variant="danger" icon={Trash2} onClick={deleteAccount}>Delete all my data</Button></div>}
        </Card>
      </div>
      {confirmNode}
    </>
  );
}

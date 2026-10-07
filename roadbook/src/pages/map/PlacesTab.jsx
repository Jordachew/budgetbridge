import { useMemo, useState } from 'react';
import { Plus, LocateFixed, Navigation, Pencil, Trash2, MapPin, ExternalLink } from 'lucide-react';
import { Card, Button, Chips, Empty, IconButton, Banner, useConfirm, Badge } from '../../components/ui.jsx';
import { useRows, remove } from '../../state/data.js';
import { haversine, mapsLink, wazeLink } from '../../core/geo.js';
import { useMoney, useDistance } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import LeafMap from './LeafMap.jsx';
import PlaceForm from './PlaceForm.jsx';
import { PLACE_KINDS, placeKind, navTarget } from './kinds.js';

export function NavButtons({ p }) {
  return (
    <div className="flex gap-1.5">
      <Button as="a" size="sm" variant="soft" icon={Navigation} href={mapsLink({ destination: navTarget(p) })} target="_blank" rel="noreferrer">Navigate</Button>
      <Button as="a" size="sm" variant="ghost" icon={ExternalLink} href={wazeLink(navTarget(p))} target="_blank" rel="noreferrer">Waze</Button>
    </div>
  );
}

export default function PlacesTab({ meApi }) {
  const places = useRows('places');
  const { me, state, locate } = meApi;
  const money = useMoney();
  const dist = useDistance();
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [kind, setKind] = useState('all');
  const [form, setForm] = useState(null);
  const [focus, setFocus] = useState(null);

  const list = useMemo(() => {
    const l = places.filter((p) => kind === 'all' || p.kind === kind).map((p) => ({ ...p, away: me ? haversine(me, p) : null }));
    return l.sort((a, b) => (a.away ?? 0) - (b.away ?? 0) || a.name.localeCompare(b.name));
  }, [places, kind, me]);
  const markers = useMemo(() => list.map((p) => { const k = placeKind(p.kind); return { id: p.id, lat: p.lat, lng: p.lng, color: k.color, glyph: k.glyph, title: p.name }; }), [list]);

  async function addHere() {
    const p = me || await locate();
    if (p) setForm({ lat: p.lat, lng: p.lng }); else toast('Could not find your location. Tap the map to place a pin instead.', { bad: true });
  }
  async function del(p) {
    if (!(await confirm({ title: `Delete ${p.name}?`, text: 'This place will be removed from your map.', danger: true, confirmLabel: 'Delete place' }))) return;
    await remove('places', p.id); toast('Place deleted.');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={LocateFixed} onClick={addHere} loading={state === 'loading'}>Add at my location</Button>
        <Button icon={Plus} variant="outline" onClick={() => setForm({})}>Add place</Button>
        <span className="text-sm text-ink-500">or tap the map to drop a pin</span>
      </div>
      {state === 'failed' && <Banner tone="amber">We could not read your location. Check that location is allowed for this site. Everything else still works.</Banner>}
      <LeafMap markers={markers} me={me} focus={focus} fitKey={`${places.length}-${me ? 1 : 0}`} height={340} label="Map of your places" onMapClick={(pt) => setForm(pt)} />
      <Chips value={kind} onChange={setKind} options={[{ value: 'all', label: `All (${places.length})` }, ...PLACE_KINDS.map((k) => ({ value: k.id, label: k.label }))]} />
      {list.length === 0 ? (
        <Empty icon={MapPin} title={places.length ? 'Nothing of that type yet' : 'No saved places yet'} text="Save fuel stations, parking, yards and customers so you can find them again and navigate in one tap." action={<Button icon={LocateFixed} onClick={addHere}>Save where I am</Button>} />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {list.map((p) => {
            const k = placeKind(p.kind); const Icon = k.icon;
            return (
              <li key={p.id}>
                <Card className="!p-4">
                  <div className="flex items-start gap-3">
                    <button type="button" aria-label={`Show ${p.name} on the map`} onClick={() => setFocus({ lat: p.lat, lng: p.lng, n: Date.now() })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: k.color }}><Icon size={18} /></button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{p.name}</span><Badge>{k.label}</Badge></div>
                      <div className="text-xs text-ink-500">{p.away != null ? `${dist(p.away)} away` : `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`}{p.fuel_price_cents != null ? ` - ${money(p.fuel_price_cents)}/L` : ''}</div>
                      {p.note && <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{p.note}</p>}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <NavButtons p={p} />
                        <div className="flex"><IconButton icon={Pencil} label={`Edit ${p.name}`} onClick={() => setForm(p)} /><IconButton icon={Trash2} label={`Delete ${p.name}`} onClick={() => del(p)} /></div>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {form && <PlaceForm key={form.id || `${form.lat}-${form.lng}`} open place={form} onClose={() => setForm(null)} onMyLocation={locate} />}
      {node}
    </div>
  );
}

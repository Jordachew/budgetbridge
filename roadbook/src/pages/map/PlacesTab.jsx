import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, MapPin, Search, LocateFixed } from 'lucide-react';
import { Button, Empty, IconButton, Chips } from '../../components/ui.jsx';
import { useRows } from '../../state/data.js';
import { haversine } from '../../core/geo.js';
import { useMoney, useDistance } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import { softDelete } from '../../lib/undo.js';
import { PLACE_KINDS, placeKind } from './kinds.js';
import { NavButtons } from './bits.jsx';

export default function PlacesTab({ meApi, onMarkers, focusOn, setPlaceForm, addHere }) {
  const places = useRows('places');
  const { me } = meApi;
  const money = useMoney();
  const dist = useDistance();
  const toast = useToast();
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return places.filter((p) => (kind === 'all' || p.kind === kind) && (!s || `${p.name} ${p.note}`.toLowerCase().includes(s)))
      .map((p) => ({ ...p, away: me ? haversine(me, p) : null }))
      .sort((a, b) => (a.away ?? 0) - (b.away ?? 0) || a.name.localeCompare(b.name));
  }, [places, kind, me, q]);
  const markers = useMemo(() => list.map((p) => { const k = placeKind(p.kind); return { id: p.id, lat: p.lat, lng: p.lng, color: k.color, fg: k.fg, glyph: k.glyph, title: p.name }; }), [list]);
  useEffect(() => { onMarkers(markers, `places-${list.length}`); }, [markers]);

  return (
    <div>
      <p className="mb-3 text-xs text-ink-500">Tap the map to drop a pin, or save where you are standing.</p>
      {places.length > 0 && (
        <div className="mb-3 space-y-2">
          <label className="relative block"><span className="sr-only">Search places</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places" className="h-10 w-full rounded-md border border-ink-300 bg-[var(--surface)] pl-9 pr-3 text-sm dark:border-ink-600" /></label>
          <div className="-mx-1 overflow-x-auto px-1 pb-1"><div className="w-max"><Chips value={kind} onChange={setKind} options={[{ value: 'all', label: `All ${places.length}` }, ...PLACE_KINDS.filter((k) => places.some((p) => p.kind === k.id)).map((k) => ({ value: k.id, label: k.label }))]} /></div></div>
        </div>
      )}
      {list.length === 0 ? (
        <Empty icon={MapPin} title={places.length ? 'Nothing matches' : 'Save the places you use'} text="Fuel stations, yards, parking and customers, so you can find them again and navigate in one tap." action={places.length ? null : <Button icon={LocateFixed} onClick={addHere}>Save where I am</Button>} />
      ) : (
        <ul className="border-t border-[var(--hairline)]">
          {list.map((p) => {
            const k = placeKind(p.kind); const Icon = k.icon;
            return (
              <li key={p.id} className="border-b border-[var(--hairline)] py-3">
                <div className="flex items-start gap-3">
                  <button type="button" aria-label={`Show ${p.name} on the map`} onClick={() => focusOn(p)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px]" style={{ background: k.color, color: k.fg || '#fff' }}><Icon size={18} /></button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2"><span className="truncate font-bold">{p.name}</span>{p.fuel_price_cents != null && <span className="shrink-0 text-sm font-bold">{money(p.fuel_price_cents)}/L</span>}</div>
                    <div className="text-xs text-ink-500">{k.label} · {p.away != null ? `${dist(p.away)} away` : `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}`}</div>
                    {p.note && <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{p.note}</p>}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <NavButtons p={p} />
                      <div className="flex"><IconButton icon={Pencil} label={`Edit ${p.name}`} onClick={() => setPlaceForm(p)} /><IconButton icon={Trash2} label={`Delete ${p.name}`} onClick={() => softDelete(toast, 'places', p, `${p.name} deleted`)} /></div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

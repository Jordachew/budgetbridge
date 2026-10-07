import { useMemo, useState } from 'react';
import { Fuel, LocateFixed, Search, BookmarkPlus, Check, TrendingDown } from 'lucide-react';
import { Card, Button, Input, Segmented, Empty, Banner, Badge } from '../../components/ui.jsx';
import { useRows, save, create } from '../../state/data.js';
import { haversine } from '../../core/geo.js';
import { parseMoney, fmtMoney } from '../../core/format.js';
import { useMoney, useDistance, useCurrency } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import LeafMap from './LeafMap.jsx';
import { NavButtons } from './PlacesTab.jsx';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

async function findStations(me) {
  const q = `[out:json][timeout:20];(node["amenity"="fuel"](around:15000,${me.lat},${me.lng});way["amenity"="fuel"](around:15000,${me.lat},${me.lng}););out center 60;`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(OVERPASS, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const j = await res.json();
    return (j.elements || []).map((e) => ({
      key: `${e.type}${e.id}`, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon,
      name: (e.tags?.name || e.tags?.brand || e.tags?.operator || 'Fuel station').slice(0, 100),
    })).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)).map((s) => ({ ...s, away: haversine(me, s) })).sort((a, b) => a.away - b.away).slice(0, 30);
  } finally { clearTimeout(t); }
}

function PriceEditor({ place }) {
  const cur = useCurrency();
  const toast = useToast();
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  async function go() {
    const c = parseMoney(v);
    if (c == null || c <= 0 || c > 1000000) { setErr('Type a price like 215.50'); return; }
    setErr('');
    await save('places', { ...place, fuel_price_cents: c });
    setV(''); toast(`${place.name} is now ${fmtMoney(c, cur)} per litre.`);
  }
  return (
    <form className="flex items-start gap-2" onSubmit={(e) => { e.preventDefault(); go(); }}>
      <div className="w-28"><Input aria-label={`New price per litre for ${place.name}`} inputMode="decimal" placeholder="New price" value={v} onChange={(e) => setV(e.target.value)} className="!h-8" />{err && <p className="mt-1 text-xs text-red-600">{err}</p>}</div>
      <Button size="sm" variant="soft" type="submit" icon={Check}>Update</Button>
    </form>
  );
}

export default function FuelTab({ meApi }) {
  const places = useRows('places');
  const { me, state, locate } = meApi;
  const money = useMoney();
  const dist = useDistance();
  const toast = useToast();
  const [sort, setSort] = useState('price');
  const [near, setNear] = useState({ state: 'idle', list: [] });

  const fuel = useMemo(() => {
    const l = places.filter((p) => p.kind === 'fuel').map((p) => ({ ...p, away: me ? haversine(me, p) : null }));
    if (sort === 'distance' && me) return l.sort((a, b) => a.away - b.away);
    return l.sort((a, b) => (a.fuel_price_cents ?? Infinity) - (b.fuel_price_cents ?? Infinity) || (a.away ?? 0) - (b.away ?? 0));
  }, [places, me, sort]);
  const cheapest = fuel.find((p) => p.fuel_price_cents != null);

  const markers = useMemo(() => [
    ...fuel.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, color: p === cheapest ? '#10b981' : '#f97316', glyph: p.fuel_price_cents != null ? '$' : 'F', title: `${p.name}${p.fuel_price_cents != null ? ` - ${money(p.fuel_price_cents)}/L` : ''}`, ring: p === cheapest })),
    ...near.list.map((s) => ({ id: s.key, lat: s.lat, lng: s.lng, color: '#94a3b8', glyph: 'F', size: 24, title: s.name })),
  ], [fuel, near.list, cheapest, money]);

  async function find() {
    setNear({ state: 'locating', list: [] });
    const p = me || await locate();
    if (!p) { setNear({ state: 'nolocation', list: [] }); return; }
    setNear({ state: 'searching', list: [] });
    try { setNear({ state: 'done', list: await findStations(p) }); } catch (e) { console.warn(e); setNear({ state: 'failed', list: [] }); }
  }
  async function keep(s) {
    await create('places', { kind: 'fuel', name: s.name, lat: s.lat, lng: s.lng, note: '', fuel_price_cents: null });
    toast(`${s.name} saved to your places. Add its price from the list above.`);
  }
  const saved = (s) => places.some((p) => p.kind === 'fuel' && Math.abs(p.lat - s.lat) < 0.0003 && Math.abs(p.lng - s.lng) < 0.0003);

  return (
    <div className="space-y-4">
      <LeafMap markers={markers} me={me} fitKey={`${fuel.length}-${near.list.length}-${me ? 1 : 0}`} height={320} label="Map of fuel stations" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={sort} onChange={setSort} options={[{ value: 'price', label: 'Cheapest first' }, { value: 'distance', label: 'Nearest first' }]} />
        <Button variant="outline" icon={LocateFixed} loading={state === 'loading'} onClick={locate}>{me ? 'Update my location' : 'My location'}</Button>
      </div>
      {sort === 'distance' && !me && <Banner tone="blue">Tap "My location" to sort by distance.</Banner>}

      <section aria-label="Your fuel stations">
        <h2 className="mb-2 text-sm font-semibold">Your fuel stations</h2>
        {fuel.length === 0 ? <Empty icon={Fuel} title="No fuel stations saved" text="Use the finder below to save stations near you, then keep their prices up to date." /> : (
          <ul className="space-y-2">
            {fuel.map((p) => (
              <li key={p.id}>
                <Card className={`!p-4 ${p === cheapest ? 'ring-2 !ring-emerald-500' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{p.name}</span>{p === cheapest && fuel.filter((x) => x.fuel_price_cents != null).length > 1 && <Badge tone="green"><TrendingDown size={12} className="mr-1" />Cheapest</Badge>}</div>
                      <div className="text-xs text-ink-500">{p.away != null ? `${dist(p.away)} away` : 'Distance unknown'}</div>
                    </div>
                    <div className="text-right"><div className="text-xl font-bold tabular-nums">{p.fuel_price_cents != null ? money(p.fuel_price_cents) : '-'}</div><div className="text-xs text-ink-500">per litre</div></div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><NavButtons p={p} /><PriceEditor place={p} /></div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Find fuel near me">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold">Find fuel near me</h2><p className="text-xs text-ink-500">Looks up stations within 15 km on OpenStreetMap. Needs internet.</p></div>
            <Button icon={Search} onClick={find} loading={near.state === 'locating' || near.state === 'searching'}>Search nearby</Button>
          </div>
          {near.state === 'nolocation' && <div className="mt-3"><Banner tone="amber">We could not read your location, so we cannot search. Allow location for this site and try again.</Banner></div>}
          {near.state === 'failed' && <div className="mt-3"><Banner tone="amber">The station finder could not be reached. You may be offline or the service is busy. Your saved stations above still work.</Banner></div>}
          {near.state === 'done' && near.list.length === 0 && <p className="mt-3 text-sm text-ink-500">No stations found within 15 km.</p>}
          {near.list.length > 0 && (
            <ul className="mt-3 divide-y divide-ink-100 dark:divide-ink-800">
              {near.list.map((s) => (
                <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0"><div className="truncate text-sm font-medium">{s.name}</div><div className="text-xs text-ink-500">{dist(s.away)} away</div></div>
                  <div className="flex gap-1.5"><NavButtons p={s} />{saved(s) ? <Badge tone="green">Saved</Badge> : <Button size="sm" icon={BookmarkPlus} variant="outline" onClick={() => keep(s)}>Save to my places</Button>}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
      <p className="text-xs text-ink-500">Prices are entered by you, so check them at the pump.</p>
    </div>
  );
}

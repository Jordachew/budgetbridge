import { useEffect, useMemo, useState } from 'react';
import { Fuel, Search, BookmarkPlus, Check, TrendingDown, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Input, Segmented, Empty, Banner, Badge } from '../../components/ui.jsx';
import { useRows, save, create } from '../../state/data.js';
import { haversine } from '../../core/geo.js';
import { parseMoney, fmtMoney } from '../../core/format.js';
import { useMoney, useDistance, useCurrency } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import { NavButtons } from './bits.jsx';

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
    const { away: _a, ...row } = place;
    await save('places', { ...row, fuel_price_cents: c });
    setV(''); toast(`${place.name} is now ${fmtMoney(c, cur)} per litre.`);
  }
  return (
    <form className="flex items-start gap-2" onSubmit={(e) => { e.preventDefault(); go(); }}>
      <div className="w-28"><Input aria-label={`New price per litre for ${place.name}`} inputMode="decimal" placeholder="New price" value={v} onChange={(e) => setV(e.target.value)} className="!h-9" />{err && <p className="mt-1 text-xs text-red-600">{err}</p>}</div>
      <Button size="sm" variant="soft" type="submit" icon={Check} className="!h-9">Update</Button>
    </form>
  );
}

export default function FuelTab({ meApi, onMarkers, focusOn }) {
  const places = useRows('places');
  const vehicles = useRows('vehicles');
  const { me, locate } = meApi;
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
  const priced = fuel.filter((p) => p.fuel_price_cents != null);
  const cheapest = priced.length ? priced.reduce((a, b) => (b.fuel_price_cents < a.fuel_price_cents ? b : a)) : null;
  const avg = priced.length ? priced.reduce((a, p) => a + p.fuel_price_cents, 0) / priced.length : 0;
  const tank = Math.max(0, ...vehicles.map((v) => v.tank_litres || 0)) || 100;
  const saving = cheapest ? Math.round(avg - cheapest.fuel_price_cents) : 0;

  const markers = useMemo(() => [
    ...fuel.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, color: p === cheapest ? 'var(--good)' : 'var(--series-2)', glyph: p.fuel_price_cents != null ? '$' : 'F', title: `${p.name}${p.fuel_price_cents != null ? ` - ${money(p.fuel_price_cents)}/L` : ''}`, ring: p === cheapest })),
    ...near.list.map((s) => ({ id: s.key, lat: s.lat, lng: s.lng, color: 'var(--muted)', glyph: 'F', size: 24, title: s.name })),
  ], [fuel, near.list, cheapest, money]);
  useEffect(() => { onMarkers(markers, `fuel-${fuel.length}-${near.list.length}`); }, [markers]);

  async function find() {
    setNear({ state: 'locating', list: [] });
    const p = me || await locate();
    if (!p) { setNear({ state: 'nolocation', list: [] }); return; }
    setNear({ state: 'searching', list: [] });
    try { setNear({ state: 'done', list: await findStations(p) }); } catch (e) { console.warn(e); setNear({ state: 'failed', list: [] }); }
  }
  async function keep(s) {
    await create('places', { kind: 'fuel', name: s.name, lat: s.lat, lng: s.lng, note: '', fuel_price_cents: null });
    toast(`${s.name} saved. Add its price from the list.`);
  }
  const saved = (s) => places.some((p) => p.kind === 'fuel' && Math.abs(p.lat - s.lat) < 0.0003 && Math.abs(p.lng - s.lng) < 0.0003);

  return (
    <div>
      {cheapest && priced.length > 1 ? (
        <div className="mb-4 rounded-md border-l-4 border-[var(--good)] bg-ink-100/70 px-3 py-3 text-sm dark:bg-ink-800/60" role="status">
          {saving > 0 ? (
            <>
              <p><b>{cheapest.name}</b> is the cheapest at <b>{money(cheapest.fuel_price_cents)}</b> a litre, <b>{money(saving)}</b> under your average of {money(Math.round(avg))}.</p>
              <p className="mt-1 text-ink-600 dark:text-ink-300">Filling {tank} litres there saves about <b>{money(saving * tank)}</b>.</p>
            </>
          ) : <p>Your stations all charge about the same, {money(Math.round(avg))} a litre.</p>}
        </div>
      ) : <p className="mb-3 text-sm text-ink-600 dark:text-ink-300">Add a price to two or more stations and Roadbook shows how much the cheapest one saves you.</p>}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={sort} onChange={setSort} options={[{ value: 'price', label: 'Cheapest' }, { value: 'distance', label: 'Nearest' }]} />
        <Button as={Link} to="/expenses?new=1&cat=fuel" variant="ghost" size="sm" icon={Receipt}>Log fuel</Button>
      </div>
      {sort === 'distance' && !me && <div className="mb-2"><Banner tone="blue">Tap the locate button on the map to sort by distance.</Banner></div>}

      {fuel.length === 0 ? <Empty icon={Fuel} title="No fuel stations saved" text="Search near you below, save the stations you use, then keep their prices up to date." /> : (
        <ol className="border-t border-[var(--hairline)]">
          {fuel.map((p, i) => {
            const best = p === cheapest && priced.length > 1;
            return (
              <li key={p.id} className={`border-b border-[var(--hairline)] py-3 ${best ? '-mx-2 border-l-4 border-l-[var(--good)] bg-ink-100/60 px-2 dark:bg-ink-800/50' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink-300 text-xs font-bold text-ink-600 dark:border-ink-600 dark:text-ink-300" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => focusOn(p)} className="min-w-0 text-left"><span className="block truncate font-bold">{p.name}</span><span className="text-xs text-ink-500">{p.away != null ? `${dist(p.away)} away` : 'Distance unknown'}</span></button>
                      <div className="shrink-0 text-right"><div className="text-xl font-bold leading-none">{p.fuel_price_cents != null ? money(p.fuel_price_cents) : '-'}</div><div className="mt-0.5 text-xs text-ink-500">per litre{cheapest && p !== cheapest && p.fuel_price_cents != null ? ` · +${money(p.fuel_price_cents - cheapest.fuel_price_cents)}` : ''}</div></div>
                    </div>
                    {best && <div className="mt-1"><Badge tone="green" icon={TrendingDown}>Cheapest</Badge></div>}
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-2"><NavButtons p={p} /><PriceEditor place={p} /></div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="mt-5" aria-label="Find fuel near me">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-display text-lg font-semibold leading-tight">Find fuel near me</h3><p className="text-xs text-ink-500">Stations within 15 km. Needs internet.</p></div>
          <Button icon={Search} variant="outline" onClick={find} loading={near.state === 'locating' || near.state === 'searching'}>Search</Button>
        </div>
        {near.state === 'nolocation' && <div className="mt-3"><Banner tone="amber">We could not read your location. Allow location for this site and try again.</Banner></div>}
        {near.state === 'failed' && <div className="mt-3"><Banner tone="amber">The station finder could not be reached. You may be offline. Your saved stations still work.</Banner></div>}
        {near.state === 'done' && near.list.length === 0 && <p className="mt-3 text-sm text-ink-500">No stations found within 15 km.</p>}
        {near.list.length > 0 && (
          <ul className="mt-3 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            {near.list.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0"><div className="truncate text-sm font-bold">{s.name}</div><div className="text-xs text-ink-500">{dist(s.away)} away</div></div>
                <div className="flex gap-1.5">{saved(s) ? <Badge tone="green" icon={Check}>Saved</Badge> : <Button size="sm" icon={BookmarkPlus} variant="outline" onClick={() => keep(s)}>Save</Button>}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-4 text-xs text-ink-500">Prices are entered by you, so check them at the pump.</p>
    </div>
  );
}

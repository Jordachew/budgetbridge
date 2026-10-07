import { sleep } from '../../core/util.js';

const COORD = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Turns typed text into { lat, lng } using OpenStreetMap Nominatim. Returns null when not found; throws when unreachable. */
export async function geocode(q) {
  const text = String(q || '').trim();
  if (!text) return null;
  const m = COORD.exec(text);
  if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: +m[1], lng: +m[2] };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(text)}`, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const j = await res.json();
    if (!j.length) return null;
    return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
  } finally { clearTimeout(t); }
}

/** Looks up several labels one after another (Nominatim asks for at most one request a second). */
export async function geocodeAll(labels, onEach) {
  const out = {};
  let first = true;
  for (const l of labels) {
    if (!first) await sleep(1100);
    first = false;
    try { out[l] = (await geocode(l)) || 'notfound'; } catch { out[l] = 'offline'; }
    onEach?.({ ...out });
  }
  return out;
}

// Distance and direction on the globe, plus the rules for trusting GPS fixes.

const R = 6371008.8; // mean earth radius, meters
const rad = (x) => (x * Math.PI) / 180;
const deg = (x) => (x * 180) / Math.PI;

/** Great-circle distance in meters between {lat,lng} points. */
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Compass bearing 0-360 from a to b. */
export function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function compass(degrees) { return POINTS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]; }

/** "3.2 km north-east" (or miles) from one place to another. */
export function describeRelative(from, to, unit = 'km') {
  const m = haversine(from, to);
  const v = unit === 'mi' ? m / 1609.344 : m / 1000;
  const text = m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${v < 10 ? v.toFixed(1) : Math.round(v)} ${unit}`;
  return m < 50 ? 'right here' : `${text} ${compass(bearing(from, to))}`;
}

export const GPS = { maxAccuracy: 60, maxSpeedMps: 55, minStep: 10 };

/**
 * Decide whether a new GPS fix should count toward distance.
 * prev/fix are { lat, lng, accuracy, t } with t in milliseconds.
 * Returns { ok, d } where d is the meters to add.
 */
export function judgeFix(prev, fix) {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return { ok: false, d: 0, reason: 'bad' };
  if (Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return { ok: false, d: 0, reason: 'bad' };
  if (!(fix.accuracy <= GPS.maxAccuracy)) return { ok: false, d: 0, reason: 'weak' };
  if (!prev) return { ok: true, d: 0, reason: 'first' };
  const dt = (fix.t - prev.t) / 1000;
  if (!(dt > 0)) return { ok: false, d: 0, reason: 'time' };
  const d = haversine(prev, fix);
  if (d / dt > GPS.maxSpeedMps) return { ok: false, d: 0, reason: 'jump' };
  const noise = Math.max(GPS.minStep, Math.min(fix.accuracy, prev.accuracy ?? fix.accuracy));
  if (d < noise) return { ok: false, d: 0, reason: 'still' };
  return { ok: true, d, reason: 'moved' };
}

/** Keeps a point only when it is at least `minMeters` from the last kept one (plus the final point). */
export function thinPath(points, minMeters = 30, maxPoints = 2500) {
  if (points.length <= 2) return points.slice();
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (haversine({ lat: out[out.length - 1][0], lng: out[out.length - 1][1] }, { lat: points[i][0], lng: points[i][1] }) >= minMeters) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  if (out.length <= maxPoints) return out;
  const step = Math.ceil((out.length - 1) / (maxPoints - 1));
  const slim = out.filter((_, i) => i % step === 0);
  if (slim[slim.length - 1] !== out[out.length - 1]) slim.push(out[out.length - 1]);
  return slim;
}

/** Distance in meters along a [[lat,lng,t],...] path. */
export function pathLength(points) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversine({ lat: points[i - 1][0], lng: points[i - 1][1] }, { lat: points[i][0], lng: points[i][1] });
  return m;
}

/** Maps / Waze links open the driver's own navigation app: no API key, no tracking by us. */
export function mapsLink({ origin, destination, stops = [] }) {
  const p = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (origin) p.set('origin', origin);
  if (destination) p.set('destination', destination);
  const wp = stops.filter(Boolean).slice(0, 8);
  if (wp.length) p.set('waypoints', wp.join('|'));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
export function wazeLink(destination) {
  const p = new URLSearchParams({ q: destination, navigate: 'yes' });
  return `https://waze.com/ul?${p.toString()}`;
}

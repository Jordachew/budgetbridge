// Trip recorder. Counts distance from GPS fixes (ignoring weak, jumpy or standing-still fixes),
// keeps the screen awake, and saves progress every few seconds so a reload or dead battery
// does not lose the trip.

import { judgeFix, thinPath } from './geo.js';

export function createTracker({ geo = globalThis.navigator?.geolocation, now = () => Date.now(), onUpdate = () => {}, checkpoint = () => {}, wakeLock = true } = {}) {
  let watchId = null;
  let lock = null;
  let lastSaved = 0;
  let s = null;           // trip state

  const snapshot = () => (s ? { ...s, path: s.path } : null);
  const emit = () => onUpdate(snapshot());

  async function holdScreen() {
    if (!wakeLock || !globalThis.navigator?.wakeLock) return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); } catch { /* battery saver etc: fine */ }
  }
  const onVisible = () => { if (globalThis.document?.visibilityState === 'visible' && s && !lock) holdScreen(); };

  function onFix(pos) {
    if (!s) return;
    const c = pos.coords;
    const fix = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, t: pos.timestamp || now() };
    const j = judgeFix(s.last, fix);
    s.quality = j.reason === 'weak' ? 'weak' : j.reason === 'bad' ? s.quality : 'good';
    s.fixes += 1;
    if (j.ok) {
      s.distance_m += j.d;
      s.last = fix;
      s.path.push([Math.round(fix.lat * 1e5) / 1e5, Math.round(fix.lng * 1e5) / 1e5, Math.round(fix.t / 1000)]);
      if (s.path.length > 6000) s.path = thinPath(s.path, 30, 3000);
    }
    s.speed_mps = Number.isFinite(c.speed) && c.speed >= 0 ? c.speed : j.ok && s.prevT ? j.d / ((fix.t - s.prevT) / 1000) : s.speed_mps;
    if (j.ok) s.prevT = fix.t;
    s.pos = { lat: fix.lat, lng: fix.lng };
    emit();
    if (now() - lastSaved > 8000) { lastSaved = now(); checkpoint(snapshot()); }
  }
  function onError(err) {
    if (!s) return;
    s.quality = err.code === 1 ? 'denied' : 'none';
    emit();
  }

  function begin(state) {
    if (!geo) { onUpdate({ ...state, quality: 'unsupported' }); return false; }
    s = state;
    watchId = geo.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    holdScreen();
    globalThis.document?.addEventListener('visibilitychange', onVisible);
    emit();
    return true;
  }

  return {
    start(meta) {
      if (s) return false;
      return begin({ id: meta.id, load_id: meta.load_id || null, origin_label: meta.origin_label || '', dest_label: meta.dest_label || '',
        started_at: new Date(now()).toISOString(), distance_m: 0, path: [], last: null, fixes: 0, quality: 'searching', speed_mps: 0, prevT: null, pos: null });
    },
    /** Continue a trip that was in progress when the app closed. */
    resume(saved) { if (s) return false; return begin({ ...saved, last: null, prevT: null, quality: 'searching' }); },
    stop() {
      if (!s) return null;
      if (watchId != null) geo?.clearWatch(watchId);
      watchId = null;
      try { lock?.release?.(); } catch { /* ignore */ }
      lock = null;
      globalThis.document?.removeEventListener('visibilitychange', onVisible);
      const out = { id: s.id, load_id: s.load_id, origin_label: s.origin_label, dest_label: s.dest_label, started_at: s.started_at,
        ended_at: new Date(now()).toISOString(), distance_m: Math.round(s.distance_m), path: thinPath(s.path, 30, 2500) };
      s = null;
      return out;
    },
    active: () => !!s,
    state: snapshot,
    lastPosition: () => s?.pos || null,
  };
}

/** One-off position, for stamping a delivery or an alert. Resolves null if unavailable. */
export function getPositionOnce({ timeout = 12000, maxAge = 30000 } = {}) {
  return new Promise((resolve) => {
    const g = globalThis.navigator?.geolocation;
    if (!g) return resolve(null);
    g.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), t: p.timestamp }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: maxAge },
    );
  });
}

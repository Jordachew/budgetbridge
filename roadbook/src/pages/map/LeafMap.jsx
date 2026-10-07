// A small Leaflet wrapper. Everything is drawn with DOM elements (no HTML strings), so names
// typed by drivers can never inject markup. Works with blank tiles when there is no internet.
import { useEffect, useRef } from 'react';
import L from 'leaflet';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function pinIcon({ color = '#f97316', glyph = '', size = 30, ring = false }) {
  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font:700 ${Math.round(size * 0.42)}px/1 system-ui,sans-serif;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);${ring ? 'outline:3px solid ' + color + '55;' : ''}`;
  el.textContent = glyph;
  return L.divIcon({ html: el, className: 'rb-pin', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}

/**
 * markers: [{ id, lat, lng, color, glyph, title, onClick }]
 * path: [[lat,lng,...],...]   line: same, drawn dashed (straight-line estimates)
 * fitKey: change it to re-fit the view to what is drawn.  focus: { lat, lng, n } flies there.
 */
export default function LeafMap({ markers = [], path, line, onMapClick, fitKey, focus, me, height = 360, className = '', label = 'Map' }) {
  const host = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const click = useRef(onMapClick);
  click.current = onMapClick;

  useEffect(() => {
    const m = L.map(host.current, { zoomControl: true, attributionControl: true }).setView([18.1, -77.3], 8);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e) => click.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = layer.current; const m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    const pts = [];
    if (path?.length > 1) {
      L.polyline(path.map((p) => [p[0], p[1]]), { color: '#f97316', weight: 5, opacity: 0.9 }).addTo(g);
      path.forEach((p) => pts.push([p[0], p[1]]));
    }
    if (line?.length > 1) {
      L.polyline(line.map((p) => [p.lat, p.lng]), { color: '#0ea5e9', weight: 3, dashArray: '8 8' }).addTo(g);
    }
    for (const k of markers) {
      if (!Number.isFinite(k.lat) || !Number.isFinite(k.lng)) continue;
      const mk = L.marker([k.lat, k.lng], { icon: pinIcon(k), keyboard: true, title: k.title || '' }).addTo(g);
      if (k.title) { const d = document.createElement('div'); d.textContent = k.title; d.style.fontWeight = '600'; mk.bindPopup(d); }
      if (k.onClick) mk.on('click', () => k.onClick(k));
      pts.push([k.lat, k.lng]);
    }
    if (me) {
      L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(g);
    }
    map.current.__pts = pts;
  }, [markers, path, line, me]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const pts = [...(m.__pts || [])];
    if (!pts.length && me) pts.push([me.lat, me.lng]);
    if (pts.length === 1) m.setView(pts[0], Math.max(m.getZoom(), 13));
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], Math.max(map.current.getZoom(), 14), { duration: 0.6 });
  }, [focus]);

  return <div ref={host} role="region" aria-label={label} style={{ height }} className={`z-0 w-full overflow-hidden rounded-2xl bg-ink-200 ring-1 ring-ink-200/70 dark:bg-ink-800 dark:ring-ink-800 ${className}`} />;
}

// A small Leaflet wrapper. Everything is drawn with DOM elements (no HTML strings), so names
// typed by drivers can never inject markup. Works with blank tiles when there is no internet.
import { useEffect, useRef } from 'react';
import L from 'leaflet';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function pinIcon({ color = 'var(--series-2)', fg = '#fff', glyph = '', size = 30, ring = false }) {
  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:9px;background:${color};color:${fg};display:flex;align-items:center;justify-content:center;font:700 ${Math.round(size * 0.44)}px/1 "Atkinson Hyperlegible",system-ui,sans-serif;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);${ring ? 'outline:3px solid #f5b000;outline-offset:2px;' : ''}`;
  el.textContent = glyph;
  return L.divIcon({ html: el, className: 'rb-pin', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}

/**
 * markers: [{ id, lat, lng, color, glyph, title, onClick }]
 * path: [[lat,lng,...],...]   line: same, drawn dashed (straight-line estimates)
 * fitKey: change it to re-fit the view to what is drawn.  focus: { lat, lng, n } flies there.
 */
export default function LeafMap({ markers = [], path, line, onMapClick, fitKey, focus, me, height = 360, className = '', label = 'Map', zoomPosition = 'topleft', inset }) {
  const host = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const click = useRef(onMapClick);
  click.current = onMapClick;

  useEffect(() => {
    const m = L.map(host.current, { zoomControl: false, attributionControl: true }).setView([18.1, -77.3], 8);
    L.control.zoom({ position: zoomPosition }).addTo(m);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(m);
    // Dark mode: invert the light OpenStreetMap tiles so the map does not glare.
    const root = document.documentElement;
    const skin = () => { const pane = m.getPane('tilePane'); if (pane) pane.style.filter = root.getAttribute('data-theme') === 'dark' ? 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88) saturate(0.7)' : ''; };
    skin();
    const mo = new MutationObserver(skin);
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e) => click.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    return () => { mo.disconnect(); ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = layer.current; const m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    const pts = [];
    if (path?.length > 1) {
      L.polyline(path.map((p) => [p[0], p[1]]), { color: '#121317', weight: 9, opacity: 0.55, lineCap: 'round' }).addTo(g);
      L.polyline(path.map((p) => [p[0], p[1]]), { color: '#f5b000', weight: 5, opacity: 1, lineCap: 'round' }).addTo(g);
      path.forEach((p) => pts.push([p[0], p[1]]));
    }
    if (line?.length > 1) {
      L.polyline(line.map((p) => [p.lat, p.lng]), { color: '#2a78d6', weight: 4, dashArray: '2 9', lineCap: 'round' }).addTo(g);
    }
    for (const k of markers) {
      if (!Number.isFinite(k.lat) || !Number.isFinite(k.lng)) continue;
      const mk = L.marker([k.lat, k.lng], { icon: pinIcon(k), keyboard: true, title: k.title || '' }).addTo(g);
      if (k.title) { const d = document.createElement('div'); d.textContent = k.title; d.style.fontWeight = '600'; mk.bindPopup(d); }
      if (k.onClick) mk.on('click', () => k.onClick(k));
      pts.push([k.lat, k.lng]);
    }
    if (me) {
      L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2a78d6', fillOpacity: 1 }).addTo(g);
    }
    map.current.__pts = pts;
  }, [markers, path, line, me]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const pts = [...(m.__pts || [])];
    if (!pts.length && me) pts.push([me.lat, me.lng]);
    const left = inset?.left || 0; const bottom = inset?.bottom || 0;
    if (pts.length === 1) { m.setView(pts[0], Math.max(m.getZoom(), 13), { animate: false }); m.panBy([-left / 2, bottom / 2], { animate: false }); }
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [30 + left, 30], paddingBottomRight: [30, 30 + bottom], maxZoom: 16 });
  }, [fitKey]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], Math.max(map.current.getZoom(), 14), { duration: 0.6 });
  }, [focus]);

  return <div ref={host} role="region" aria-label={label} style={{ height }} className={`z-0 w-full overflow-hidden rounded-[10px] bg-ink-200 ring-1 ring-[var(--hairline)] dark:bg-ink-800 ${className}`} />;
}

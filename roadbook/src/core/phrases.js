// The exact words the phone says out loud. Short, calm, plain. Pure functions so they can be tested.

import { describeRelative } from './geo.js';

export const ALERT_KINDS = [
  { id: 'accident', label: 'Accident', spoken: 'an accident', icon: 'alert' },
  { id: 'flood', label: 'Flooding', spoken: 'flooding', icon: 'flood' },
  { id: 'roadworks', label: 'Roadworks', spoken: 'roadworks', icon: 'road' },
  { id: 'police', label: 'Police stop', spoken: 'a police stop', icon: 'siren' },
  { id: 'breakdown', label: 'Broken down', spoken: 'a broken down vehicle', icon: 'wrench' },
  { id: 'traffic', label: 'Heavy traffic', spoken: 'heavy traffic', icon: 'truck' },
  { id: 'landslide', label: 'Landslide', spoken: 'a landslide', icon: 'landslide' },
  { id: 'fuel', label: 'Fuel problem', spoken: 'a fuel problem', icon: 'fuel' },
  { id: 'other', label: 'Other problem', spoken: 'a road problem', icon: 'flag' },
];
export const alertKind = (id) => ALERT_KINDS.find((k) => k.id === id) || ALERT_KINDS[ALERT_KINDS.length - 1];

export function spokenDistance(m, unit = 'km') {
  if (unit === 'mi') {
    const mi = m / 1609.344;
    if (mi < 0.2) return 'less than a quarter mile';
    return `${mi < 10 ? mi.toFixed(1).replace(/\.0$/, '') : Math.round(mi)} ${Math.abs(mi - 1) < 0.05 ? 'mile' : 'miles'}`;
  }
  if (m < 100) return 'very close';
  if (m < 1000) return `${Math.round(m / 100) * 100} metres`;
  const km = m / 1000;
  const txt = km < 10 ? km.toFixed(1).replace(/\.0$/, '') : String(Math.round(km));
  return `${txt} ${txt === '1' ? 'kilometre' : 'kilometres'}`;
}

export function alertSpeech(alert, here, unit = 'km') {
  const k = alertKind(alert.kind);
  let where = '';
  if (here && Number.isFinite(alert.lat)) where = ` ${describeRelative(here, alert, unit)}`;
  const note = alert.note ? ` ${alert.note.slice(0, 120)}.` : '';
  return `Warning. ${cap(k.spoken)} reported${where}.${note} Take care.`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function reminderSpeech(r, whenText) {
  return `Reminder. ${r.title}.${whenText ? ` ${whenText}.` : ''}`;
}
export const tripStartSpeech = () => 'Trip started. Drive safe.';
export const tripEndSpeech = (distanceText) => `Trip finished. You drove ${distanceText}.`;
export const savedSpeech = (what, amountText) => `${what} saved${amountText ? `, ${amountText}` : ''}.`;
export const messageSpeech = (name, body) => `Message from ${name}. ${body.slice(0, 200)}`;

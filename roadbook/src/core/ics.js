// Calendar file (.ics) so a reminder can also ring from the phone's own calendar,
// which works even when this app is closed.

const pad = (n) => String(n).padStart(2, '0');
export function icsDate(d) {
  const x = new Date(d);
  return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}${pad(x.getUTCSeconds())}Z`;
}
export function icsEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** Lines longer than 75 bytes are folded onto continuation lines that start with a space. */
export function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let bytes = 0;
  const limit = 74;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length === 0 ? 75 : limit)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const RRULE = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };

/** events: [{ uid, title, start, durationMinutes?, description?, alarmMinutes?, repeat? }] */
export function buildICS(events, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roadbook//Trucker app//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    const start = new Date(e.start);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + (e.durationMinutes ?? 30) * 60000);
    lines.push('BEGIN:VEVENT', `UID:${icsEscape(e.uid)}@roadbook`, `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsEscape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (RRULE[e.repeat]) lines.push(`RRULE:${RRULE[e.repeat]}`);
    const alarms = e.alarmMinutes ?? [60];
    for (const m of alarms) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:-PT${Math.max(0, Math.round(m))}M`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

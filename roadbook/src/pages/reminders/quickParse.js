// "Renew insurance on 1 Dec" -> { title: 'Renew insurance', due: Date }. Small, forgiving, pure.
// Understands: today, tonight, tomorrow, next week, next month, in 3 days/weeks/months, monday / next friday,
// 1 Dec, 1st December 2027, Dec 1, 1/12 (day first) and times such as at 3pm or 15:30.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const monthIndex = (w) => MONTHS.indexOf(w.slice(0, 3).toLowerCase());
const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; };
const validDate = (y, m, d) => { const x = new Date(y, m, d); return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d ? x : null; };

function takeTime(s) {
  let m = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(s);
  if (m) {
    let h = Number(m[1]) % 12; if (/pm/i.test(m[3])) h += 12;
    if (Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2] || 0) < 60) return { h, min: Number(m[2] || 0), rest: s.replace(m[0], ' ') };
  }
  m = /\bat\s+(\d{1,2}):(\d{2})\b/i.exec(s) || /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(s);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return { h: Number(m[1]), min: Number(m[2]), rest: s.replace(m[0], ' ') };
  m = /\b(?:at\s+)?noon\b/i.exec(s);
  if (m) return { h: 12, min: 0, rest: s.replace(m[0], ' ') };
  return null;
}

function takeDate(s, now) {
  const today = at(now, 0);
  let m;
  if ((m = /\b(?:the\s+)?day after tomorrow\b/i.exec(s))) return { date: addDays(today, 2), rest: s.replace(m[0], ' ') };
  if ((m = /\b(tomorrow|tmrw|tmr)\b/i.exec(s))) return { date: addDays(today, 1), rest: s.replace(m[0], ' ') };
  if ((m = /\btonight\b/i.exec(s))) return { date: today, tonight: true, rest: s.replace(m[0], ' ') };
  if ((m = /\btoday\b/i.exec(s))) return { date: today, rest: s.replace(m[0], ' ') };
  if ((m = /\bnext\s+week\b/i.exec(s))) return { date: addDays(today, 7), rest: s.replace(m[0], ' ') };
  if ((m = /\bnext\s+month\b/i.exec(s))) return { date: addMonths(today, 1), rest: s.replace(m[0], ' ') };
  if ((m = /\bnext\s+year\b/i.exec(s))) return { date: addMonths(today, 12), rest: s.replace(m[0], ' ') };
  if ((m = /\bin\s+(\d{1,3})\s*(day|days|week|weeks|month|months)\b/i.exec(s))) {
    const n = Number(m[1]); const u = m[2].toLowerCase();
    return { date: u.startsWith('day') ? addDays(today, n) : u.startsWith('week') ? addDays(today, n * 7) : addMonths(today, n), rest: s.replace(m[0], ' ') };
  }
  if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON_RE}\\b(?:,?\\s+(\\d{4}))?`, 'i').exec(s))) return fromDM(Number(m[1]), monthIndex(m[2]), m[3], m[0], s, now);
  if ((m = new RegExp(`\\b${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'i').exec(s))) return fromDM(Number(m[2]), monthIndex(m[1]), m[3], m[0], s, now);
  if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(s))) return fromDM(Number(m[1]), Number(m[2]) - 1, m[3] && (m[3].length === 2 ? `20${m[3]}` : m[3]), m[0], s, now);
  if ((m = new RegExp(`\\b(?:(next|this|on)\\s+)?(${DAYS.join('|')}|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\b`, 'i').exec(s))) {
    const w = m[2].toLowerCase();
    const idx = DAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));
    let diff = (idx - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    if (/^next$/i.test(m[1] || '') && diff <= 0) diff += 7;
    return { date: addDays(today, diff), rest: s.replace(m[0], ' ') };
  }
  return null;
}

function fromDM(day, mon, yearStr, matched, s, now) {
  if (mon < 0 || mon > 11 || day < 1 || day > 31) return null;
  const today = at(now, 0);
  let y = yearStr ? Number(yearStr) : today.getFullYear();
  let d = validDate(y, mon, day);
  if (!d) return null;
  if (!yearStr && d < today) { y += 1; d = validDate(y, mon, day); if (!d) return null; }
  return { date: d, rest: s.replace(matched, ' ') };
}

const tidy = (s) => {
  let t = s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) t = t.replace(/^(remind me to|remind me|reminder|please|to)\s+/i, '').replace(/\s+(on|at|by|for|before|due|in|until|this)$/i, '').replace(/^(on|at|by|due)\s+/i, '');
  t = t.replace(/[\s,;:.-]+$/, '').replace(/^[\s,;:.-]+/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
};

/** Returns { title, due: Date|null, hasTime, dateText }. due is null when no date words were found. */
export function parseQuickReminder(text, now = new Date()) {
  const raw = String(text || '').trim();
  if (!raw) return { title: '', due: null, hasTime: false };
  const t = takeTime(raw);
  const afterTime = t ? t.rest : raw;
  const d = takeDate(afterTime, now);
  if (!d) return { title: tidy(t ? afterTime : raw), due: null, hasTime: !!t };
  let due;
  let hasTime = !!t;
  if (t) due = at(d.date, t.h, t.min);
  else if (d.tonight) { due = at(d.date, 20); hasTime = true; }
  else if (d.date.getTime() === at(now, 0).getTime()) { due = now.getHours() < 16 ? at(d.date, 17) : new Date(now.getTime() + 3600000); hasTime = true; }
  else due = at(d.date, 9);
  return { title: tidy(d.rest), due, hasTime };
}

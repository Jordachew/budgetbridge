// Reads text from a scanned receipt and from a spoken sentence. Everything returned is a
// SUGGESTION the driver confirms on screen: nothing here ever saves an expense by itself.

import { MAX_CENTS } from './format.js';

export const CATEGORIES = [
  { id: 'fuel', label: 'Fuel', icon: 'fuel' },
  { id: 'toll', label: 'Toll', icon: 'road' },
  { id: 'food', label: 'Food', icon: 'food' },
  { id: 'repairs', label: 'Repairs', icon: 'wrench' },
  { id: 'tyres', label: 'Tyres', icon: 'tyre' },
  { id: 'parking', label: 'Parking', icon: 'parking' },
  { id: 'fines', label: 'Fines', icon: 'flag' },
  { id: 'lodging', label: 'Sleeping', icon: 'bed' },
  { id: 'phone', label: 'Phone', icon: 'phone' },
  { id: 'permits', label: 'Permits', icon: 'doc' },
  { id: 'wages', label: 'Helper pay', icon: 'user' },
  { id: 'other', label: 'Other', icon: 'dots' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryLabel = (id) => (CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1]).label;

const KEYWORDS = [
  ['fuel', /\b(petrol|diesel|gasoline|gas\s*station|fuel|ulsd|unleaded|lpg|petcom|texaco|rubis|total\s*energies?|shell|epping|litres?|ltrs?|pump)\b/],
  ['toll', /\b(toll|highway\s*2000|tj\s*highway|transjamaican|t1|t2|t3|e-?tag|tag\s*top)\b/],
  ['tyres', /\b(tyres?|tires?|retread|wheel\s*alignment|balancing|puncture)\b/],
  ['repairs', /\b(repairs?|mechanic|auto\s*parts?|spare\s*parts?|battery|oil\s*change|brake|filter|garage|workshop|radiator|clutch|service)\b/],
  ['parking', /\b(parking|park\s*fee|car\s*park)\b/],
  ['fines', /\b(fine|ticket|traffic\s*court|tax\s*office\s*fine|penalty)\b/],
  ['lodging', /\b(hotel|guest\s*house|lodging|motel|inn|room\s*rate|accommodation)\b/],
  ['phone', /\b(flow|digicel|top\s*up|data\s*plan|airtime|recharge)\b/],
  ['permits', /\b(permit|licen[cs]e|fitness|insurance|registration|inspection|customs|port\s*fees?)\b/],
  ['food', /\b(restaurant|jerk|patty|patties|bakery|kfc|juici|tastee|burger|lunch|dinner|breakfast|meal|cook\s*shop|chicken|soup|drink|food|supermarket|shop\s*rite|grocery)\b/],
];

export function guessCategory(text) {
  const t = String(text || '').toLowerCase();
  for (const [id, re] of KEYWORDS) if (re.test(t)) return id;
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function validDate(y, m, d, now) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (dt.getTime() > todayUTC + 86400000) return null;                 // not in the future
  if (dt.getTime() < todayUTC - 5 * 366 * 86400000) return null;        // not older than 5 years
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Finds a date in receipt text. Jamaica writes day first, so 03/10/2026 is 3 October. */
export function findDate(text, now = new Date()) {
  const t = String(text || '');
  let m;
  const fullYear = (y) => (y < 100 ? 2000 + y : y);
  if ((m = t.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) {
    const v = validDate(+m[1], +m[2], +m[3], now);
    if (v) return { date: v, ambiguous: false };
  }
  const re = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/g;
  while ((m = re.exec(t))) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3]);
    const v = validDate(y, b, a, now);
    if (v) return { date: v, ambiguous: a <= 12 && b <= 12 && a !== b };
    const swapped = validDate(y, a, b, now);
    if (swapped) return { date: swapped, ambiguous: false };
  }
  const months = MONTHS.join('|');
  if ((m = t.match(new RegExp(`\\b(\\d{1,2})\\s*[- ]?(${months})[a-z]*[ ,'-]*(\\d{2}|\\d{4})\\b`, 'i')))) {
    const v = validDate(fullYear(+m[3]), MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1], now);
    if (v) return { date: v, ambiguous: false };
  }
  if ((m = t.match(new RegExp(`\\b(${months})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{2}|\\d{4})\\b`, 'i')))) {
    const v = validDate(fullYear(+m[3]), MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2], now);
    if (v) return { date: v, ambiguous: false };
  }
  return { date: null, ambiguous: false };
}

const AMOUNT_RE = /(?<![\d.,])(?:J\$|US\$|\$)?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d])/g;

function amountsOnLine(line) {
  const out = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const raw = m[1];
    const hasDecimals = raw.includes('.');
    const digits = raw.replace(/[,.]/g, '');
    if (!hasDecimals && digits.length >= 7) continue;          // account / phone / invoice numbers
    const [w, f = ''] = raw.replace(/,/g, '').split('.');
    const cents = Number(w) * 100 + Number((f + '00').slice(0, 2));
    if (cents <= 0 || cents > MAX_CENTS) continue;
    out.push(cents);
  }
  return out;
}

const TOTAL_RE = /(grand\s*total|total\s*due|amount\s*due|balance\s*due|net\s*total|total\s*amount|amt\s*due|to\s*pay|\btotal\b)/i;
const NOT_TOTAL_RE = /(sub\s*-?\s*total|total\s*(gct|tax|vat|savings|discount)|(gct|tax|vat)\s*total|total\s*items?|total\s*qty|total\s*points)/i;
const SKIP_RE = /(change|tender|cash|visa|master\s*card|card\s*no|auth|approval|ref\b|invoice\s*no|receipt\s*no|tel\b|phone|odometer|points|discount|trn|gct\s*reg)/i;

/** Picks the most likely total from the text, with a note on how sure we are. */
export function findTotal(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const totals = [];
  for (const line of lines) {
    if (TOTAL_RE.test(line) && !NOT_TOTAL_RE.test(line)) {
      const a = amountsOnLine(line);
      if (a.length) totals.push(a[a.length - 1]);
    }
  }
  if (totals.length) return { cents: Math.max(...totals), sure: true };
  const loose = [];
  for (const line of lines) {
    if (SKIP_RE.test(line) || NOT_TOTAL_RE.test(line)) continue;
    for (const c of amountsOnLine(line)) if (/\./.test(line)) loose.push(c);
  }
  return loose.length ? { cents: Math.max(...loose), sure: false } : { cents: null, sure: false };
}

export function findLitres(text) {
  const m = String(text || '').match(/(\d{1,4}(?:\.\d{1,3})?)\s*(?:l\b|ltrs?\b|litres?\b|liters?\b)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return v > 0 && v <= 2000 ? Math.round(v * 100) / 100 : null;
}

const NOT_VENDOR = /(receipt|invoice|tax|tel|phone|date|www|\.com|gct|trn|cashier|thank|welcome|customer|copy|reg\s*no)/i;
export function findVendor(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6);
  for (const l of lines) {
    const letters = (l.match(/[A-Za-z]/g) || []).length;
    if (letters >= 3 && letters / l.length > 0.5 && !NOT_VENDOR.test(l)) return l.replace(/[^\w &'.-]/g, '').trim().slice(0, 40);
  }
  return '';
}

export function parseReceiptText(text, now = new Date()) {
  const t = String(text || '');
  const total = findTotal(t);
  const d = findDate(t, now);
  const vendor = findVendor(t);
  const category = guessCategory(`${vendor}\n${t}`);
  return {
    amount_cents: total.cents,
    amount_sure: total.sure,
    date: d.date,
    date_ambiguous: d.ambiguous,
    vendor,
    category,
    litres: category === 'fuel' ? findLitres(t) : null,
  };
}

/* ---------- speech: "fuel twelve thousand five hundred" ---------- */

const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const FILLER = new Set(['and', 'dollars', 'dollar', 'jmd', 'j', 'bucks', 'hundred', 'thousand', 'million', 'k', 'point']);

const isNumToken = (w) => w in UNITS || w in TENS || /^\d[\d,]*(\.\d+)?$/.test(w);

/** "twelve thousand five hundred" -> 12500. Returns null if no number is spoken. */
export function wordsToNumber(text) {
  const tokens = String(text || '').toLowerCase().replace(/[$,]/g, (c) => (c === ',' ? '' : ' ')).replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  let total = 0, current = 0, seen = false, i = 0;
  while (i < tokens.length) {
    const w = tokens[i];
    if (w in UNITS) { current += UNITS[w]; seen = true; }
    else if (w in TENS) { current += TENS[w]; seen = true; }
    else if (/^\d+(\.\d+)?$/.test(w)) { current += Number(w); seen = true; }
    else if (w === 'hundred') { if (!seen) { i++; continue; } current = (current || 1) * 100; }
    else if (w === 'thousand' || w === 'k') { if (!seen) { i++; continue; } total += (current || 1) * 1000; current = 0; }
    else if (w === 'million') { if (!seen) { i++; continue; } total += (current || 1) * 1e6; current = 0; }
    else if (w === 'point' && seen) {
      let frac = '';
      let j = i + 1;
      while (j < tokens.length && (tokens[j] in UNITS || /^\d$/.test(tokens[j]))) { frac += tokens[j] in UNITS ? UNITS[tokens[j]] : tokens[j]; j++; }
      if (frac) { const v = total + current + Number('0.' + frac); return Math.round(v * 100) / 100; }
    }
    i++;
  }
  return seen ? total + current : null;
}

/** Finds the first run of number-ish words, e.g. "fuel twelve thousand five hundred at petcom". */
export function extractSpokenAmount(text) {
  const tokens = String(text || '').toLowerCase().replace(/[$]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  let start = -1, end = -1;
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const num = isNumToken(w) || (start >= 0 && FILLER.has(w) && w !== 'j' && w !== 'jmd' && w !== 'dollars' && w !== 'dollar' && w !== 'bucks');
    if (num) { if (start < 0) { if (FILLER.has(w)) continue; start = i; } end = i; }
    else if (start >= 0) break;
  }
  if (start < 0) return null;
  return wordsToNumber(tokens.slice(start, end + 1).join(' '));
}

export function parseSpokenExpense(text) {
  const amount = extractSpokenAmount(text);
  const cents = amount == null ? null : Math.round(amount * 100);
  return {
    amount_cents: cents != null && cents > 0 && cents <= MAX_CENTS ? cents : null,
    category: guessCategory(text),
    note: String(text || '').trim().slice(0, 120),
  };
}

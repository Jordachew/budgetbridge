// CSV export. Cells that start with = + - @ are prefixed with an apostrophe so a spreadsheet
// can never run them as a formula (CSV injection). Numbers are written as numbers.

export function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v instanceof Date) return v.toISOString();
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{ label, get: (row) => value }] */
export function toCSV(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.get(r))).join(','));
  return [head, ...body].join('\r\n') + '\r\n';
}

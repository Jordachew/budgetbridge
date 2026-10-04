// Tamper-evident delivery proof: a SHA-256 fingerprint over the delivery details plus the
// signature and photo bytes. Change one pixel or one number and the fingerprint no longer matches.

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

/** JSON with sorted keys so the same details always give the same text. */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export const PROOF_FIELDS = ['load_id', 'delivered_at', 'lat', 'lng', 'accuracy_m', 'receiver_name', 'items', 'has_discrepancy', 'discrepancy_note'];

export async function proofHash(delivery, signatureBytes, photoBytes) {
  const core = {};
  for (const k of PROOF_FIELDS) core[k] = delivery[k] ?? null;
  // The database writes times as "2026-10-03T10:00:00+00:00"; normalise so the fingerprint is the same either way.
  if (core.delivered_at) core.delivered_at = new Date(core.delivered_at).toISOString();
  for (const k of ['lat', 'lng', 'accuracy_m']) if (core[k] != null) core[k] = Number(core[k]);
  const parts = [canonical(core), signatureBytes ? await sha256Hex(signatureBytes) : '-', photoBytes ? await sha256Hex(photoBytes) : '-'];
  return sha256Hex(parts.join('|'));
}

export async function verifyProof(delivery, signatureBytes, photoBytes) {
  return !!delivery.proof_hash && (await proofHash(delivery, signatureBytes, photoBytes)) === delivery.proof_hash;
}

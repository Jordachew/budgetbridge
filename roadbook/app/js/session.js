// Shared run-time state: who is signed in, the server API, the sync engine and the trip tracker.
import { ls } from './util.js';

export const S = {
  user: null,          // { id, email } or null in local mode
  api: null,           // api-supabase object (account mode only)
  sync: null,          // sync engine
  tracker: null,       // GPS trip tracker
  crews: [],           // [{ id, name, role, share_data, owner_id }]
  online: true,
  status: { state: 'idle', pending: 0, failed: 0 },
};
export const isAccount = () => !!S.user;
export const myRole = () => (S.crews.some((c) => c.role === 'owner') ? 'owner' : S.crews.length ? 'driver' : 'solo');
export const lastUser = (v) => ls('roadbook.lastUser', v);

// The only file that talks to Supabase. Everything else goes through the injected api object,
// so the app can be pointed at a different backend later by replacing this one file.

import { SHARED_TABLES } from './sync.js';

const BUCKET = 'roadbook-files';
const PAGE = 1000;

function fail(error, status) {
  const e = new Error(error?.message || 'Request failed');
  e.status = status ?? error?.status ?? (error?.code ? 400 : 0);
  if (/failed to fetch|network|load failed/i.test(error?.message || '')) e.status = 0;
  e.code = error?.code;
  return e;
}
const check = ({ error, status }) => { if (error) throw fail(error, status); };

// Every table and function in the database starts with rb_ so Roadbook can share a Supabase project with other apps.
const PREFIX = 'rb_';
const tn = (t) => PREFIX + t;

export function makeApi(rawClient, uid) {
  // Wrap the client so the rest of this file (and the app) can keep using plain names like 'loads'.
  const client = {
    from: (t) => rawClient.from(tn(t)),
    rpc: (n, a) => rawClient.rpc(tn(n), a),
    storage: rawClient.storage,
    channel: (n) => rawClient.channel(n),
    removeChannel: (c) => rawClient.removeChannel(c),
  };
  const personal = new Set(['expenses', 'income', 'trips', 'reminders', 'route_plans']);

  const api = {
    client: rawClient,
    async upsert(table, rows) {
      if (!rows.length) return;
      const opts = SHARED_TABLES.has(table) ? { onConflict: 'id', ignoreDuplicates: true } : { onConflict: 'id' };
      if (table === 'loads') {
        // A load made by the owner can only be UPDATED by the driver (an upsert would fail the insert rule).
        const mine = rows.filter((r) => r.created_by === uid || !r.created_by);
        const theirs = rows.filter((r) => r.created_by && r.created_by !== uid);
        if (mine.length) check(await client.from(table).upsert(mine, opts));
        for (const r of theirs) check(await client.from(table).update(r).eq('id', r.id));
        return;
      }
      check(await client.from(table).upsert(rows, opts));
    },

    async pull(table, since) {
      const out = [];
      for (let from = 0; ; from += PAGE) {
        let q = client.from(table).select('*');
        if (personal.has(table)) q = q.eq('user_id', uid);
        else if (table === 'loads') q = q.or(`user_id.eq.${uid},created_by.eq.${uid}`);
        if (since) q = q.gte('updated_at', since);
        else if (SHARED_TABLES.has(table)) q = q.gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString());
        q = q.order('updated_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
        const res = await q;
        check(res);
        out.push(...res.data);
        if (res.data.length < PAGE) break;
        if (out.length > 20000) break;   // safety valve
      }
      return out;
    },

    async uploadFile(path, blob, type) {
      const { error } = await client.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: type || blob.type || 'application/octet-stream' });
      if (error) throw fail(error, error.statusCode ? Number(error.statusCode) : undefined);
    },
    async downloadFile(path) {
      const { data, error } = await client.storage.from(BUCKET).download(path);
      if (error) { if (/not found|404/i.test(error.message || '')) return null; throw fail(error); }
      return data;
    },

    async getProfile() {
      const res = await client.from('profiles').select('display_name,truck_label,currency').eq('id', uid).maybeSingle();
      check(res);
      return res.data;   // null on a first sign-in: the sync engine then creates it
    },
    async saveProfile(p) {
      check(await client.from('profiles').upsert({ id: uid, display_name: (p.display_name || '').slice(0, 60), truck_label: (p.truck_label || '').slice(0, 40), currency: p.currency === 'USD' ? 'USD' : 'JMD' }, { onConflict: 'id' }));
    },

    // ----- crew -----
    async rpc(name, args) { const res = await client.rpc(name, args); check(res); return res.data; },
    async myCrews() {
      const res = await client.from('crew_members').select('crew_id, role, share_data, crews(name, owner_id, brand_color, phone)').eq('user_id', uid);
      check(res);
      return res.data.map((m) => ({ id: m.crew_id, role: m.role, share_data: m.share_data, name: m.crews?.name || 'Crew', owner_id: m.crews?.owner_id, brand_color: m.crews?.brand_color || '', phone: m.crews?.phone || '' }));
    },
    createCrew: (name) => api.rpc('create_crew', { p_name: name }),
    joinCrew: (code, share) => api.rpc('join_crew', { p_code: code, p_share: !!share }),
    leaveCrew: (crew) => api.rpc('leave_crew', { p_crew: crew }),
    updateCrew: (crew, name, color, phone) => api.rpc('update_crew', { p_crew: crew, p_name: name, p_color: color || '', p_phone: phone || '' }),
    setMemberRole: (crew, user, role) => api.rpc('set_member_role', { p_crew: crew, p_user: user, p_role: role }),
    deleteCrew: (crew) => api.rpc('delete_crew', { p_crew: crew }),
    removeMember: (crew, user) => api.rpc('remove_member', { p_crew: crew, p_user: user }),
    setShare: (crew, share) => api.rpc('set_share_data', { p_crew: crew, p_share: !!share }),
    joinCode: (crew) => api.rpc('crew_join_code', { p_crew: crew }),
    newJoinCode: (crew) => api.rpc('regenerate_join_code', { p_crew: crew }),
    roster: (crew) => api.rpc('crew_roster', { p_crew: crew }),
    report: (crew, from, to) => api.rpc('crew_report', { p_crew: crew, p_from: from, p_to: to }),
    deleteMessage: (id) => api.rpc('delete_message', { p_id: id }),
    clearAlert: (id) => api.rpc('clear_alert', { p_id: id }),

    /** Live updates for chat and road alerts. Returns an unsubscribe function. */
    subscribe(onEvent) {
      const ch = client.channel('roadbook-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: tn('messages') }, (p) => onEvent('messages', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: tn('road_alerts') }, (p) => onEvent('road_alerts', p))
        .subscribe();
      return () => { client.removeChannel(ch); };
    },

    // ----- delete everything -----
    async listFiles(prefix) {
      const files = [];
      const walk = async (p) => {
        const { data, error } = await client.storage.from(BUCKET).list(p, { limit: 1000 });
        if (error) throw fail(error);
        for (const it of data) {
          if (it.id) files.push(`${p}/${it.name}`); else await walk(`${p}/${it.name}`);
        }
      };
      await walk(prefix);
      return files;
    },
    async deleteMyAccount() {
      const files = await api.listFiles(uid);
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await client.storage.from(BUCKET).remove(files.slice(i, i + 100));
        if (error) throw fail(error);
      }
      await api.rpc('delete_my_account');
    },
  };
  return api;
}

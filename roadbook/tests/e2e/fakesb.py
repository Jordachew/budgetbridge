"""A tiny fake Supabase: a Python 'server' shared by several browser pages, plus a JS client that
talks to it with the same call shapes the real supabase-js client uses. Used to test the crew,
chat, alert, dispatch and sync screens end to end without a real project."""
import json, uuid, datetime, re

def now(): return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f+00:00')

class FakeServer:
    def __init__(self):
        self.names = {}
        self.users = {}      # email -> {id, password, name}
        self.t = {k: {} for k in ['loads','expenses','income','trips','deliveries','reminders','route_plans','messages','road_alerts']}
        self.profiles = {}
        self.crews = {}      # id -> {name, owner_id, code}
        self.members = []    # {crew_id,user_id,role,share_data,joined_at}
        self.files = {}
        self.log = []
        self.tick = 0
    def stamp(self):
        self.tick += 1
        return (datetime.datetime(2026,10,3,12,0,0,tzinfo=datetime.timezone.utc) + datetime.timedelta(milliseconds=self.tick)).strftime('%Y-%m-%dT%H:%M:%S.%f+00:00')
    def is_member(self, crew, uid): return any(m['crew_id']==crew and m['user_id']==uid for m in self.members)
    def is_owner(self, crew, uid): return any(m['crew_id']==crew and m['user_id']==uid and m['role']=='owner' for m in self.members)
    def is_manager(self, crew, uid): return any(m['crew_id']==crew and m['user_id']==uid and m['role'] in ('owner','admin') for m in self.members)
    def owner_of(self, uid): return any(m['role']=='owner' and self.is_member(m['crew_id'], uid) and any(x['user_id']==uid and x['crew_id']==m['crew_id'] for x in self.members) for m in self.members if m['user_id']!=uid)

    def handle(self, op, p):
        self.log.append(op)
        fn = getattr(self, 'op_'+op)
        try: return {'data': fn(p)}
        except Exception as e: return {'error': {'message': str(e), 'status': 400}}

    # auth
    def op_signUp(self, p):
        if p['email'] in self.users: raise Exception('User already registered')
        uid = str(uuid.uuid4()); self.users[p['email']] = {'id': uid, 'password': p['password']}
        self.names[uid] = (p.get('name') or '')[:60]   # like the real thing: no profile row until the app saves one
        return {'id': uid, 'email': p['email'], 'user_metadata': {'display_name': self.names[uid]}}
    def op_signIn(self, p):
        u = self.users.get(p['email'])
        if not u or u['password'] != p['password']: raise Exception('Invalid login credentials')
        return {'id': u['id'], 'email': p['email'], 'user_metadata': {'display_name': self.names.get(u['id'], '')}}
    # tables
    def op_select(self, p):
        t, uid = p['table'], p['uid']
        rows = list(self.t[t].values())
        if t in ('messages','road_alerts'): rows = [r for r in rows if self.is_member(r['crew_id'], uid)]
        elif t == 'deliveries': rows = [r for r in rows if r['user_id']==uid]
        elif t == 'loads': rows = [r for r in rows if r['user_id']==uid or r['created_by']==uid]
        else: rows = [r for r in rows if r['user_id']==uid]
        for f in p.get('filters', []):
            if f['op']=='gte': rows = [r for r in rows if str(r.get(f['col']))>=f['val']]
            if f['op']=='eq': rows = [r for r in rows if r.get(f['col'])==f['val']]
        rows.sort(key=lambda r: (r['updated_at'], r['id']))
        a, b = p.get('range', [0, 999]); return rows[a:b+1]
    def op_upsert(self, p):
        t, uid = p['table'], p['uid']
        for r in p['rows']:
            r = dict(r)
            if t in ('messages','road_alerts'):
                if r['user_id']!=uid or not self.is_member(r['crew_id'], uid): raise Exception('new row violates row-level security policy')
                if r['id'] in self.t[t] and p.get('ignore'): continue
            elif t == 'loads':
                ex = self.t[t].get(r['id'])
                if ex is None and r['created_by']!=uid: raise Exception('rls loads insert')
                if ex is not None and uid not in (ex['user_id'], ex['created_by']): raise Exception('rls loads update')
                if ex is None and r['user_id']!=uid and not any(self.is_owner(m['crew_id'], uid) and self.is_member(m['crew_id'], r['user_id']) for m in self.members): raise Exception('rls: not your driver')
            elif r.get('user_id')!=uid: raise Exception('rls insert')
            if t=='expenses' and not (r.get('amount_cents',0) > 0): raise Exception('check constraint amount')
            r['updated_at'] = self.stamp(); r.setdefault('created_at', r['updated_at'])
            self.t[t][r['id']] = r
        return None
    def op_myCrews(self, p):
        return [{'crew_id': m['crew_id'], 'role': m['role'], 'share_data': m['share_data'], 'crews': {'name': self.crews[m['crew_id']]['name'], 'owner_id': self.crews[m['crew_id']]['owner_id'], 'brand_color': self.crews[m['crew_id']].get('brand_color',''), 'phone': self.crews[m['crew_id']].get('phone','')}} for m in self.members if m['user_id']==p['uid']]
    def op_profileGet(self, p): return self.profiles.get(p['uid'])
    def op_profileSave(self, p): self.profiles.setdefault(p['uid'], {}).update({k: v for k, v in p['values'].items() if k != 'id'}); return None
    # storage
    def op_upload(self, p): self.files[p['path']] = p['b64']; return None
    def op_download(self, p):
        if p['path'] not in self.files: raise Exception('Object not found')
        return self.files[p['path']]
    # rpc
    def op_rpc(self, p):
        n, a, uid = p['name'], p['args'] or {}, p['uid']
        if n == 'create_crew':
            cid = str(uuid.uuid4()); code = uuid.uuid4().hex[:6].upper()
            self.crews[cid] = {'name': a['p_name'], 'owner_id': uid, 'code': code}
            self.members.append({'crew_id': cid, 'user_id': uid, 'role': 'owner', 'share_data': False, 'joined_at': now()}); return cid
        if n == 'join_crew':
            for cid, c in self.crews.items():
                if c['code'] == a['p_code'].upper():
                    if not self.is_member(cid, uid): self.members.append({'crew_id': cid, 'user_id': uid, 'role': 'driver', 'share_data': a['p_share'], 'joined_at': now()})
                    return cid
            return None
        if n == 'crew_roster':
            return [{'user_id': m['user_id'], 'display_name': (self.profiles.get(m['user_id']) or {}).get('display_name') or 'Driver', 'role': m['role'], 'share_data': m['share_data'], 'joined_at': m['joined_at']} for m in self.members if m['crew_id']==a['p_crew']]
        if n == 'crew_join_code':
            if not self.is_manager(a['p_crew'], uid): raise Exception('Only the crew owner can do this')
            return self.crews[a['p_crew']]['code']
        if n == 'set_share_data':
            for m in self.members:
                if m['crew_id']==a['p_crew'] and m['user_id']==uid: m['share_data']=a['p_share']
            return None
        if n == 'crew_report':
            if not self.is_manager(a['p_crew'], uid): raise Exception('Only the crew owner can do this')
            out = []
            for m in self.members:
                if m['crew_id']!=a['p_crew'] or m['role']!='driver': continue
                name = (self.profiles.get(m['user_id']) or {}).get('display_name') or 'Driver'
                if not m['share_data']: out.append({'user_id': m['user_id'], 'display_name': name, 'shared': False}); continue
                tr = [x for x in self.t['trips'].values() if x['user_id']==m['user_id'] and not x.get('deleted_at')]
                ex = [x for x in self.t['expenses'].values() if x['user_id']==m['user_id'] and not x.get('deleted_at')]
                tot = {}
                for x in ex: tot[x['currency']] = tot.get(x['currency'],0)+x['amount_cents']
                out.append({'user_id': m['user_id'], 'display_name': name, 'shared': True, 'distance_m': sum(x['distance_m'] for x in tr), 'trips': len(tr), 'loads_delivered': 0, 'expenses': tot, 'income': {}})
            return out
        if n == 'delete_message':
            r = self.t['messages'].get(a['p_id'])
            if r and (r['user_id']==uid or self.is_manager(r['crew_id'], uid)): r['deleted_at']=now(); r['updated_at']=self.stamp()
            return None
        if n == 'clear_alert':
            r = self.t['road_alerts'].get(a['p_id'])
            if r and self.is_member(r['crew_id'], uid): r['cleared_at']=now(); r['updated_at']=self.stamp()
            return None
        if n == 'delete_my_account':
            for t in self.t.values():
                for k in [k for k,v in t.items() if v.get('user_id')==uid]: del t[k]
            self.members = [m for m in self.members if m['user_id']!=uid]; self.profiles.pop(uid, None)
            self.users = {e:u for e,u in self.users.items() if u['id']!=uid}; return None
        if n == 'set_member_role':
            if not self.is_owner(a['p_crew'], uid): raise Exception('Only the crew owner can do this')
            for m in self.members:
                if m['crew_id']==a['p_crew'] and m['user_id']==a['p_user'] and m['role'] in ('admin','driver'): m['role']=a['p_role']
            return None
        if n == 'update_crew':
            if not self.is_owner(a['p_crew'], uid): raise Exception('Only the crew owner can do this')
            self.crews[a['p_crew']].update({'name': a['p_name'], 'brand_color': a['p_color'], 'phone': a['p_phone']}); return None
        if n in ('leave_crew','delete_crew','remove_member','regenerate_join_code'): return None
        raise Exception('unknown rpc '+n)

CLIENT_JS = r"""
(() => {
  const call = (op, p) => window.__srv(op, p).then((r) => r);
  const KEY = 'fake.session';
  const getS = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const listeners = [];
  const unwrap = (r) => (r.error ? { data: null, error: { message: r.error.message, status: r.error.status } , status: r.error.status } : { data: r.data, error: null, status: 200 });
  const bare = (n) => { if (!n.startsWith('rb_')) throw new Error('table/function without rb_ prefix: ' + n); return n.slice(3); };
  function Q(rawTable) {
    const table = bare(rawTable);
    const q = { table, filters: [], range: null, mode: 'select', rows: null, opts: {} };
    const api = {
      select() { return api; },
      eq(col, val) { q.filters.push({ op: 'eq', col, val }); return api; },
      gte(col, val) { q.filters.push({ op: 'gte', col, val }); return api; },
      or() { return api; },
      order() { return api; },
      range(a, b) { q.range = [a, b]; return api; },
      upsert(rows, opts) { q.mode = 'upsert'; q.rows = rows; q.opts = opts || {}; return api; },
      update(values) { q.mode = 'update'; q.values = values; return api; },
      maybeSingle() { q.single = true; return api; },
      then(res, rej) { return run().then(res, rej); },
    };
    async function run() {
      const uid = getS()?.user?.id;
      if (!uid) return { data: null, error: { message: 'JWT expired', status: 401 }, status: 401 };
      if (table === 'profiles') {
        if (q.mode === 'upsert') return unwrap(await call('profileSave', { uid, values: q.rows }));
        const r = await call('profileGet', { uid }); return { data: r.data, error: null, status: 200 };
      }
      if (table === 'crew_members') return unwrap(await call('myCrews', { uid }));
      if (q.mode === 'upsert') return unwrap(await call('upsert', { table, uid, rows: q.rows, ignore: !!q.opts.ignoreDuplicates }));
      return unwrap(await call('select', { table, uid, filters: q.filters, range: q.range || [0, 999] }));
    }
    return api;
  }
  const client = {
    auth: {
      async getSession() { const s = getS(); return { data: { session: s }, error: null }; },
      async signInWithPassword({ email, password }) { const r = await call('signIn', { email, password }); if (r.error) return { data: null, error: r.error }; const s = { user: r.data }; localStorage.setItem(KEY, JSON.stringify(s)); return { data: { user: r.data, session: s }, error: null }; },
      async signUp({ email, password, options }) { const r = await call('signUp', { email, password, name: options?.data?.display_name }); if (r.error) return { data: null, error: r.error }; const s = { user: r.data }; localStorage.setItem(KEY, JSON.stringify(s)); return { data: { user: r.data, session: s }, error: null }; },
      async signOut() { localStorage.removeItem(KEY); listeners.forEach((f) => f('SIGNED_OUT', null)); return { error: null }; },
      onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      async resetPasswordForEmail() { return { error: null }; },
      async updateUser() { return { error: null }; },
    },
    from: (t) => Q(t),
    async rpc(rawName, args) { const name = bare(rawName); const uid = getS()?.user?.id; const r = await call('rpc', { name, args, uid }); return unwrap(r); },
    storage: { from: () => ({
      async upload(path, blob) { const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); const r = await call('upload', { path, b64 }); return r.error ? { error: r.error } : { error: null }; },
      async download(path) { const r = await call('download', { path }); if (r.error) return { data: null, error: { message: 'Object not found' } }; const res = await fetch(r.data); return { data: await res.blob(), error: null }; },
      async list() { return { data: [], error: null }; }, async remove() { return { error: null }; },
    }) },
    channel() { const c = { on() { return c; }, subscribe() { return c; } }; return c; },
    removeChannel() {},
  };
  window.supabase = { createClient: () => client };
})();
"""
CONFIG_JS = "window.ROADBOOK_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseKey:'sb_publishable_fake',appName:'Roadbook',supportEmail:'help@example.com'};"

async def attach(ctx, server):
    async def srv(op, payload=None):
        return server.handle(op, payload or {})
    async def on_page(page):
        await page.expose_function('__srv', srv)
    ctx.on('page', lambda p: None)
    await ctx.add_init_script(CLIENT_JS)
    async def fake_vendor(r): await r.fulfill(body='/* fake */', content_type='text/javascript')
    async def fake_config(r): await r.fulfill(body=CONFIG_JS, content_type='text/javascript')
    await ctx.route('**/vendor/supabase.js', fake_vendor)
    await ctx.route('**/config.js', fake_config)
    await ctx.expose_function('__srv', srv)

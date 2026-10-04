import { h, icon, clear } from '../util.js';
import * as store from '../store.js';
import { route } from '../router.js';
import { S, isAccount } from '../session.js';
import { within, sumCents, sumDistance } from '../calc.js';
import { periodRange } from '../dates.js';
import { fmtDateTime, fmtDistance, fmtRelative } from '../format.js';
import { banner, pill } from '../ui.js';
import { live, money, dist, loadName, odometerNow, cur } from './common.js';
import { reminderState, sortReminders, whenText } from '../reminders-logic.js';
import { prefs } from '../prefs.js';
import { STATUS } from './loads.js';
import { activeAlerts, currentCrew, unreadCount } from './crew.js';

route('/', (ctx) => {
  ctx.header({ title: 'Roadbook', actions: [{ icon: 'settings', label: 'Settings', href: '#/settings' }] });
  ctx.tab = 'home';
  const out = h('div', { class: 'stack' });
  ctx.root.append(out);
  function draw() {
    clear(out);
    const p = store.getProfile();
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    out.append(h('div', null, h('h2', { style: { fontSize: '1.9em' } }, `${hello}${p.display_name ? ', ' + p.display_name.split(' ')[0] : ''}`), p.truck_label ? h('div', { class: 'muted' }, p.truck_label) : null));

    if (!isAccount()) out.append(h('a', { class: 'banner', href: '#/settings/sync', style: { color: 'inherit', textDecoration: 'none' } }, icon('offline', 24), h('div', { class: 'grow' }, h('b', null, 'Saved on this phone only.'), h('div', { class: 'small' }, 'Tap to back up with a free account.'))));

    // trip in progress
    const t = S.tracker?.state();
    if (t) out.append(h('a', { class: 'trip-live', href: '#/trips', style: { display: 'block', color: '#fff', textDecoration: 'none' } }, h('div', { class: 'gps-q' }, icon('gps', 22), 'Trip running'), h('div', { class: 'big-num mono' }, fmtDistance(t.distance_m, prefs().unit)), h('div', null, 'Tap to see or finish')));

    // alerts
    const crew = currentCrew();
    if (crew) {
      const al = activeAlerts(crew.id);
      if (al.length) out.append(h('a', { class: 'banner bad', href: '#/alerts', style: { color: 'inherit', textDecoration: 'none' } }, icon('alert', 24), h('div', { class: 'grow' }, h('b', null, `${al.length} road ${al.length === 1 ? 'problem' : 'problems'} reported`), h('div', { class: 'small' }, 'Tap to see where'))));
      const un = unreadCount();
      if (un) out.append(h('a', { class: 'banner info', href: '#/chat', style: { color: 'inherit', textDecoration: 'none' } }, icon('chat', 24), h('div', { class: 'grow' }, h('b', null, `${un} new ${un === 1 ? 'message' : 'messages'}`))));
    }

    // big actions
    out.append(h('div', { class: 'tiles' },
      h('a', { class: 'tile hot', href: '#/expense/new' }, h('span', { class: 'ico' }, icon('plus', 32)), h('span', null, h('div', { class: 'label' }, 'Add expense'), h('div', { class: 'sub' }, 'Fuel, toll, food…'))),
      h('a', { class: 'tile', href: '#/expense/new?scan=1' }, h('span', { class: 'ico' }, icon('scan', 32)), h('span', null, h('div', { class: 'label' }, 'Scan receipt'), h('div', { class: 'sub' }, 'Take a photo'))),
      h('a', { class: 'tile', href: '#/trips' }, h('span', { class: 'ico' }, icon('gps', 32)), h('span', null, h('div', { class: 'label' }, t ? 'See trip' : 'Start trip'), h('div', { class: 'sub' }, 'Counts your miles'))),
      h('a', { class: 'tile warn', href: '#/alert/new' }, h('span', { class: 'ico' }, icon('siren', 32)), h('span', null, h('div', { class: 'label' }, 'Report problem'), h('div', { class: 'sub' }, 'Warn other drivers'))),
      h('a', { class: 'tile', href: '#/loads' }, h('span', { class: 'ico' }, icon('box', 32)), h('span', null, h('div', { class: 'label' }, 'My loads'), h('div', { class: 'sub' }, 'Goods and delivery'))),
      h('a', { class: 'tile', href: '#/reminders' }, h('span', { class: 'ico' }, icon('bell', 32)), h('span', null, h('div', { class: 'label' }, 'Reminders'), h('div', { class: 'sub' }, 'Service, papers')))));

    // what's next
    const active = live('loads').filter((l) => !['delivered', 'reconciled', 'cancelled'].includes(l.status) && l.user_id === store.userId()).sort((a, b) => (a.pickup_at || a.created_at || '').localeCompare(b.pickup_at || b.created_at || ''));
    if (active[0]) {
      const l = active[0]; const st = STATUS[l.status];
      out.append(h('a', { class: 'card stack', href: `#/load/${l.id}`, style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Next load'), pill(st.label, st.kind)), h('div', { style: { fontWeight: '700', fontSize: '1.1em' } }, loadName(l)), h('div', { class: 'muted' }, [l.pickup_label, l.drop_label].filter(Boolean).join(' → ') || 'Tap to add places'), l.drop_at ? h('div', { class: 'small' }, `Deliver by ${fmtDateTime(l.drop_at)}`) : null));
    }
    const odo = odometerNow();
    const c = { now: new Date(), odometer_m: odo };
    const rems = sortReminders(live('reminders').filter((r) => !r.done_at), c).filter((r) => ['overdue', 'due', 'soon'].includes(reminderState(r, c))).slice(0, 3);
    if (rems.length) out.append(h('div', { class: 'card tight' }, h('div', { class: 'day-head' }, 'Needs attention'), h('ul', { class: 'list' }, rems.map((r) => h('li', null, h('a', { class: 'item', href: '#/reminders' }, h('span', { class: 'ico' }, icon('bell', 26)), h('span', { class: 'grow' }, h('div', { class: 't' }, r.title), h('div', { class: 'muted small' }, whenText(r, c, { distance: (m) => fmtDistance(m, prefs().unit), relative: (iso) => fmtRelative(iso) }))), pill(reminderState(r, c) === 'soon' ? 'Soon' : 'Now', reminderState(r, c) === 'soon' ? 'warn' : 'bad')))))));

    // today
    const day = periodRange('day');
    const todayExp = sumCents(within(live('expenses'), 'spent_at', day), cur());
    const todayKm = sumDistance(within(live('trips'), 'started_at', day));
    const wk = periodRange('week');
    out.append(h('div', { class: 'tiles' },
      h('a', { class: 'card', href: '#/expenses', style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'muted' }, 'Spent today'), h('div', { class: 'big-num mono' }, money(todayExp))),
      h('a', { class: 'card', href: '#/trips', style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'muted' }, 'Driven today'), h('div', { class: 'big-num mono' }, dist(todayKm)))));
    const fresh = !live('expenses').length && !live('trips').length && !live('loads').length;
    if (fresh) out.append(banner('info', 'star', h('div', null, h('b', null, 'New here?'), h('p', null, 'Start by adding an expense, or tap Help to see how everything works.'), h('a', { class: 'btn small', href: '#/help' }, 'How it works'))));
    void wk;
  }
  draw();
  ctx.watch(['expenses', 'trips', 'loads', 'reminders', 'road_alerts', 'messages', 'profile', 'crews', 'trip-live', 'income'], draw);
});

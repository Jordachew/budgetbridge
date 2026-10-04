import { h, icon } from '../util.js';
import { route } from '../router.js';

const TOPICS = [
  ['plus', 'Add an expense', 'Tap the yellow Add expense button. Type the amount, tap what it was for, and save. Or tap the microphone and say "fuel five thousand". To use a receipt, tap Scan a receipt and take a photo. The app reads it and fills in what it can. Always check the amount before you save.'],
  ['gps', 'Count your miles', 'Open Trips and tap Start trip. Keep the screen on and the phone charging while you drive. When you arrive, tap Finish trip. No GPS? Use "Add a trip by odometer" and type the numbers on your dashboard.'],
  ['box', 'Loads and delivery', 'Add the goods you carry under Loads. When you arrive, tap Deliver this load. Count what arrived, get the receiver to sign with their finger, take a photo, and confirm. The phone saves the time, the place and a fingerprint so the proof cannot be changed later.'],
  ['wallet', 'Your money', 'The Money tab shows what came in, what you spent and what is left. "Settle up" shows what the company owes you for things you paid yourself, after taking off advances.'],
  ['bell', 'Reminders', 'Add reminders for oil changes, insurance, your licence or a rest stop. The phone speaks them while Roadbook is open. To get a ring even when the app is closed, tap "Add to my phone calendar".'],
  ['siren', 'Warn other drivers', 'In a crew, tap Report problem when you see an accident, flood, police stop or roadworks. Everyone in your crew is warned out loud if they are near.'],
  ['offline', 'No signal?', 'Everything still works with no signal. Your records are saved on the phone and upload by themselves when you have signal again. The dot at the top shows the state.'],
  ['mic', 'Voice', 'Use the microphone button to say things instead of typing. In Settings you can turn the spoken alerts on or off, change the speed, and test how they sound.'],
  ['lock', 'Your privacy', 'Your records belong to you. Only your company owner and admins can see your numbers, and only if you switch on sharing in Crew. You can download everything or delete your Roadbook data in Settings at any time.'],
];

route('/help', (ctx) => {
  ctx.header({ title: 'Help', back: '/settings' });
  ctx.tab = 'none';
  ctx.root.append(...TOPICS.map(([ic, t, body], i) => h('details', { class: 'card', open: i === 0 }, h('summary', { style: { display: 'flex', alignItems: 'center', gap: '12px', minHeight: '52px', cursor: 'pointer', fontWeight: '700', fontSize: '1.1em' } }, icon(ic, 28), t), h('p', { style: { marginTop: '8px' } }, body))),
    h('div', { class: 'card stack' }, h('h3', null, 'Still stuck?'), window.ROADBOOK_CONFIG?.supportEmail ? h('a', { class: 'btn', href: 'mailto:' + window.ROADBOOK_CONFIG.supportEmail }, icon('send', 24), 'Email for help') : h('p', { class: 'muted' }, 'Ask the person who gave you this app.')));
});

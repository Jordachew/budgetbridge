// Voice: the phone talks (alerts, reminders) and listens (say "fuel 5000" instead of typing).
// Talking uses the phone's own voices. Listening uses the browser's speech service, which on Chrome
// sends the audio to Google to turn it into text, so it only starts when the driver taps the mic.

import { prefs } from './prefs.js';

const synth = () => globalThis.speechSynthesis;
export const canSpeak = () => !!synth() && typeof SpeechSynthesisUtterance !== 'undefined';
const Recognition = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const canListen = () => !!Recognition();

let voiceCache = null;
function pickVoice() {
  const vs = synth()?.getVoices?.() || [];
  if (!vs.length) return null;
  if (voiceCache && vs.includes(voiceCache)) return voiceCache;
  voiceCache = vs.find((v) => /^en[-_]JM/i.test(v.lang)) || vs.find((v) => /^en[-_](GB|US|CA)/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  return voiceCache;
}

let lastSpoken = '';
export const lastSpokenText = () => lastSpoken;

/** Speak a line. `force` speaks even if the driver turned voice off (used by the "Test voice" button). */
export function speak(text, { force = false, interrupt = true, rate } = {}) {
  if (!canSpeak() || (!prefs().voice && !force)) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      if (interrupt) synth().cancel();
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 400));
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = rate ?? prefs().voiceRate;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      lastSpoken = text;
      synth().speak(u);
    } catch { resolve(false); }
  });
}
export const stopSpeaking = () => { try { synth()?.cancel(); } catch { /* ignore */ } };

/**
 * Listen once. Returns { stop }. onResult(text) fires with the final words;
 * onEnd(reason) fires when listening stops ('done' | 'denied' | 'nospeech' | 'error' | 'unsupported').
 */
export function listen({ onResult, onEnd, onInterim, lang = 'en-US' }) {
  const R = Recognition();
  if (!R) { onEnd?.('unsupported'); return { stop() {} }; }
  const rec = new R();
  rec.lang = lang;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  let got = false;
  let ended = false;
  const end = (reason) => { if (!ended) { ended = true; onEnd?.(reason); } };
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (const r of e.results) { text += r[0].transcript; if (r.isFinal) final = true; }
    if (final) { got = true; onResult?.(text.trim()); } else onInterim?.(text.trim());
  };
  rec.onerror = (e) => end(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' ? 'nospeech' : 'error');
  rec.onend = () => end(got ? 'done' : 'nospeech');
  try { rec.start(); } catch { end('error'); }
  return { stop() { try { rec.stop(); } catch { /* ignore */ } } };
}

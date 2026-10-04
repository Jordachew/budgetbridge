// "Add to home screen" support. Chrome gives us an install prompt we can trigger from a button.
let deferred = null;
const subs = new Set();
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f()); });
window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()); });
export function getInstallPrompt() {
  return {
    canPrompt: () => !!deferred,
    async prompt() { if (!deferred) return 'unavailable'; deferred.prompt(); const r = await deferred.userChoice; deferred = null; return r.outcome; },
    isStandalone: () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
    isIOS: () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    onChange: (f) => { subs.add(f); return () => subs.delete(f); },
  };
}

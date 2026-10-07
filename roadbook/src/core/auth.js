// Sign-in. Email + password through Supabase Auth. The session lives in this browser only.
import { createClient } from '@supabase/supabase-js';

let client = null;

export function configured() {
  const c = window.ROADBOOK_CONFIG || {};
  return !!(c.supabaseUrl && c.supabaseKey);
}
export function getClient() {
  if (client) return client;
  if (!configured()) return null;
  const c = window.ROADBOOK_CONFIG;
  client = createClient(c.supabaseUrl, c.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return client;
}

/** Plain-words error messages. */
export function friendlyAuthError(e) {
  const m = String(e?.message || e || '');
  if (/invalid login|invalid credentials/i.test(m)) return 'That email or password is not right. Check it and try again.';
  if (/email not confirmed/i.test(m)) return 'Please open the email we sent you and tap the link, then sign in.';
  if (/already registered|already exists/i.test(m)) return 'That email already has an account. Try signing in instead.';
  if (/password.*(short|least|characters|weak)/i.test(m)) return 'Choose a longer password (at least 8 characters).';
  if (/rate|too many|seconds/i.test(m)) return 'Too many tries. Please wait a minute and try again.';
  if (/fetch|network|offline/i.test(m)) return 'No signal right now. Connect to the internet to sign in.';
  if (/valid email|invalid email/i.test(m)) return 'That email does not look right.';
  return 'Something went wrong. Please try again.';
}

export async function currentUser() {
  const c = getClient();
  if (!c) return null;
  try {
    const { data } = await c.auth.getSession();
    return data.session?.user ?? null;
  } catch { return null; }
}
export async function signIn(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data.user;
}
export async function signUp(email, password, displayName) {
  const { data, error } = await getClient().auth.signUp({
    email: email.trim(), password,
    options: { data: { display_name: (displayName || '').trim().slice(0, 60) }, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
  return { user: data.user, needsConfirm: !data.session };
}
export async function resetPassword(email) {
  const { error } = await getClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}
export async function updatePassword(pw) {
  const { error } = await getClient().auth.updateUser({ password: pw });
  if (error) throw error;
}
export async function signOut() { const c = getClient(); if (c) await c.auth.signOut(); }
export function onAuth(fn) {
  const c = getClient();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((event, session) => fn(event, session));
  return () => data.subscription.unsubscribe();
}

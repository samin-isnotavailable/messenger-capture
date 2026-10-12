import { supabase } from './supabaseClient.js';

/**
 * Signs a user in with email/password.
 * Throws on failure — caller is responsible for showing the error.
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * Returns the current signed-in user plus their role from `profiles`,
 * or null if nobody's signed in. Role defaults to 'staff' if the
 * profiles row is somehow missing, so a broken profile never
 * silently grants admin access.
 */
export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, department_id')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.warn('Could not load profile role, defaulting to staff:', error.message);
  }

  return {
    id: session.user.id,
    email: session.user.email,
    role: profile?.role || 'staff',
    departmentId: profile?.department_id ?? null,
  };
}

/**
 * Subscribes to auth state changes (sign in / sign out / token refresh).
 * `callback` is called with no meaningful args — callers should re-fetch
 * getCurrentUser() themselves rather than trust the raw session payload,
 * since role isn't part of the auth session.
 */
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange(() => callback());
}

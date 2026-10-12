import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export async function getStoredSession() {
  const { session } = await chrome.storage.local.get('session');
  return session || null;
}

export async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error_description || body.msg || 'Sign in failed');
  }

  const session = await res.json();
  await chrome.storage.local.set({ session });
  return session;
}

export async function signOut() {
  await chrome.storage.local.remove('session');
}

/**
 * Inserts a task via the PostgREST endpoint, authenticated as the signed-in
 * user (not the anon key alone) — so the same tasks_insert_authenticated
 * RLS policy the web app relies on applies here too.
 */
export async function insertTask(task) {
  const session = await getStoredSession();
  if (!session) throw new Error('Not signed in to Taskapture');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(task),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to create task');
  }
}

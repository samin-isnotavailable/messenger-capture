import { getCurrentUser, signIn } from './auth.js';
import { supabase } from './supabaseClient.js';
import { state, loadAll, subscribe, unsubscribe, canSeeAll, isSuperAdmin } from './store.js';
import { renderShell } from './shell.js';
import { mountBoard, setBoardTab, unmountBoard, defaultTab } from './board.js';
import { mountAdmin, unmountAdmin } from './admin.js';
import { esc, icon } from './lib/util.js';
import './style.css';

const app = document.getElementById('app');
let session = null; // { userId, shell, route, tab }

// ---------------------------------------------------------------- routing
// #/            board, default tab for this user
// #/board/<t>   board on tab t (all | unsorted | mine | department id)
// #/admin       admin console (super admin only)

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'admin') return { route: 'admin', tab: null };
  if (parts[0] === 'board' && parts[1]) {
    const raw = decodeURIComponent(parts[1]);
    return { route: 'board', tab: /^\d+$/.test(raw) ? Number(raw) : raw };
  }
  return { route: 'board', tab: null };
}

// Staff only ever get their own department, whatever the URL says.
function allowedTab(tab) {
  if (!canSeeAll()) return defaultTab();
  if (tab === 'all' || tab === 'unsorted') return tab;
  if (typeof tab === 'number' && state.departments.some((d) => d.id === tab)) return tab;
  return defaultTab();
}

function go(route, tab) {
  const hash = route === 'admin' ? '#/admin' : tab === null || tab === undefined ? '#/' : `#/board/${tab}`;
  if (location.hash !== hash) location.hash = hash;
  else applyRoute();
}

function applyRoute() {
  if (!session) return;
  let { route, tab } = parseHash();
  if (route === 'admin' && !isSuperAdmin()) route = 'board';
  tab = route === 'board' ? allowedTab(tab ?? defaultTab()) : session.tab;

  const view = session.shell.view;
  if (route === 'board' && session.route === 'board') {
    if (tab !== session.tab) setBoardTab(tab);
  } else {
    if (session.route === 'board') unmountBoard();
    if (session.route === 'admin') unmountAdmin();
    view.replaceChildren();
    window.scrollTo(0, 0);
    if (route === 'board') mountBoard(view, tab);
    else mountAdmin(view, (t) => go('board', t));
  }
  session.route = route;
  session.tab = tab;
  session.shell.setRoute(route, tab);

  // If the URL asked for something this user can't have, show the
  // address of what they actually got.
  const canonical = route === 'admin' ? '#/admin' : tab === defaultTab() ? '#/' : `#/board/${tab}`;
  const asked = location.hash || '#/';
  if (asked !== canonical && !(asked === '#/' && tab === defaultTab())) {
    history.replaceState(null, '', canonical);
  }
  document.title = route === 'admin' ? 'Admin · Taskapture' : 'Taskapture';
}

window.addEventListener('hashchange', applyRoute);

// ---------------------------------------------------------------- app lifecycle

async function startApp(user) {
  app.innerHTML = loadingScreen();
  try {
    await loadAll(user);
  } catch (err) {
    app.innerHTML = errorScreen(err.message);
    app.querySelector('#retry')?.addEventListener('click', () => startApp(user));
    return;
  }
  subscribe();

  const ctx = {
    route: 'board',
    activeTab: null,
    onTab: (t) => go('board', t),
  };
  const shell = renderShell(app, ctx);
  session = { userId: user.id, shell, route: null, tab: null };
  applyRoute();
}

function stopApp() {
  if (!session) return;
  if (session.route === 'board') unmountBoard();
  if (session.route === 'admin') unmountAdmin();
  session.shell.destroy?.();
  unsubscribe();
  session = null;
}

// Serialised so the initial load and an early auth event can't both
// start the app at once.
let pending = Promise.resolve();
function refresh() {
  pending = pending.then(async () => {
    const user = await getCurrentUser();
    if (user && session?.userId === user.id) return; // same person, nothing to redo
    if (!user && !session && app.querySelector('#login-form')) return; // already on login
    stopApp();
    if (user) await startApp(user);
    else renderLogin();
  });
  return pending;
}

// Only a sign-in, sign-out or account switch needs a re-render. Token
// refreshes fire this too and must not reload the whole board.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') refresh();
});
refresh();

// ---------------------------------------------------------------- screens

function loadingScreen() {
  return `
    <div class="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-400">
      <span class="w-2.5 h-2.5 bg-cyanaccent-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-pulse"></span>
      <span class="font-mono text-xs uppercase tracking-widest">Syncing tasks</span>
    </div>`;
}

function errorScreen(message) {
  return `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="max-w-md w-full bg-obsidian-850 border border-red-800/60 rounded-xl p-6 flex flex-col gap-3">
        <div class="flex items-center gap-2 text-red-300 font-semibold">${icon('error', 20)}Couldn't load Taskapture</div>
        <p class="font-mono text-xs text-slate-400 break-words">${esc(message)}</p>
        <div class="flex gap-2">
          <button id="retry" class="btn-primary">${icon('refresh', 16)}Retry</button>
          <button onclick="location.reload()" class="btn-ghost">Reload page</button>
        </div>
      </div>
    </div>`;
}

function renderLogin() {
  document.title = 'Sign in · Taskapture';
  app.innerHTML = `
    <div class="min-h-screen flex flex-col">
      <div class="h-px w-full bg-gradient-to-r from-transparent via-cyanaccent-400/50 to-transparent"></div>
      <div class="flex-1 flex items-center justify-center p-4">
        <div class="w-full max-w-sm flex flex-col gap-6">
          <div class="flex flex-col items-center gap-2">
            <div class="flex items-center gap-2.5">
              <span class="w-3 h-3 bg-cyanaccent-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)]"></span>
              <span class="font-bold text-2xl tracking-wider uppercase text-white">Taskapture</span>
            </div>
            <span class="font-mono text-[11px] uppercase tracking-widest text-slate-500">Capture it. Assign it. Get it done.</span>
          </div>
          <form id="login-form" class="bg-obsidian-850 border border-obsidian-700 rounded-xl p-6 flex flex-col gap-4 shadow-2xl">
            <div class="flex flex-col gap-1.5">
              <label for="email" class="label-caps">Email</label>
              <input id="email" type="email" class="field" autocomplete="username" required />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="password" class="label-caps">Password</label>
              <input id="password" type="password" class="field" autocomplete="current-password" required />
            </div>
            <p id="login-error" class="hidden text-xs text-red-300 bg-red-950/40 border border-red-800/60 rounded px-3 py-2"></p>
            <button type="submit" id="login-btn" class="btn-primary justify-center !py-2.5">${icon('login', 16)}Sign in</button>
          </form>
        </div>
      </div>
    </div>`;

  const form = app.querySelector('#login-form');
  const errorEl = app.querySelector('#login-error');
  const btn = app.querySelector('#login-btn');
  app.querySelector('#email').focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    btn.disabled = true;
    try {
      await signIn(app.querySelector('#email').value, app.querySelector('#password').value);
      // onAuthStateChange(SIGNED_IN) takes it from here.
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      btn.disabled = false;
    }
  });
}

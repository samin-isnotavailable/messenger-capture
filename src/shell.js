import { signOut } from './auth.js';
import { state, on, canSeeAll, isSuperAdmin, deptById, personLabel, profileById } from './store.js';
import { esc, icon, initials } from './lib/util.js';

// Header + footer shared by the board and the admin console.
// `ctx.route` is 'board' or 'admin'; `ctx.activeTab` is a department id,
// 'all' or 'unsorted'; `ctx.onTab(tab)` is called when a tab is clicked.

export function renderShell(container, ctx) {
  const user = state.user;
  const me = profileById(user.id);
  const myName = personLabel(me || user.id);

  container.innerHTML = `
    <header class="sticky top-0 z-40 bg-obsidian-950/90 backdrop-blur-md border-b border-obsidian-700/80">
      <div class="w-full px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 max-w-[1720px] mx-auto">
        <div class="flex items-center gap-6 min-w-0">
          <a href="#/" class="flex items-center gap-2 flex-shrink-0" id="logo">
            <span class="w-2.5 h-2.5 bg-cyanaccent-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.7)]"></span>
            <span class="font-bold text-base tracking-wider uppercase text-white">Taskapture</span>
          </a>
          <nav id="dept-nav" class="hidden lg:flex items-center gap-1 bg-obsidian-850 p-1 rounded-lg border border-obsidian-700/60"></nav>
        </div>
        <div class="flex items-center gap-2.5">
          <div class="hidden md:flex items-center bg-obsidian-850 border border-obsidian-700/70 px-2.5 py-1 rounded-full gap-2">
            <span class="font-mono text-xs text-slate-400 pl-1">${esc(user.email)}</span>
            <span class="bg-blue-950 text-blue-300 border border-blue-700/60 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">${esc(user.role)}</span>
          </div>
          <span id="route-switch" class="contents"></span>
          <button id="signout-btn" class="btn-ghost !py-1" type="button">Sign out</button>
          <div class="w-8 h-8 rounded-full bg-slate-800 border border-blue-500/40 text-blue-300 flex items-center justify-center flex-shrink-0 font-bold text-xs" title="${esc(myName)}">${esc(initials(myName))}</div>
        </div>
        <nav id="dept-nav-mobile" class="lg:hidden w-full flex items-center gap-1 overflow-x-auto scrollbar-none -mb-0.5"></nav>
      </div>
    </header>
    <main id="view" class="w-full flex-1 flex flex-col"></main>
    <footer class="w-full bg-obsidian-950 border-t border-obsidian-700/60 py-3 mt-auto">
      <div class="w-full px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400 max-w-[1720px] mx-auto">
        <span>Taskapture · Capture it. Assign it. Get it done.</span>
        <span id="conn" class="font-mono text-[11px] flex items-center gap-1.5"></span>
      </div>
    </footer>
  `;

  container.querySelector('#signout-btn').addEventListener('click', signOut);
  renderTabs(container, ctx);
  renderRouteSwitch(container, ctx);
  renderConnection(container);
  const off = on('connection', () => renderConnection(container));

  return {
    view: container.querySelector('#view'),
    setRoute(route, tab) {
      ctx.route = route;
      ctx.activeTab = tab;
      renderTabs(container, ctx);
      renderRouteSwitch(container, ctx);
    },
    destroy: off,
  };
}

// Super admins get a button to flip between the board and the console.
function renderRouteSwitch(container, ctx) {
  const el = container.querySelector('#route-switch');
  if (!isSuperAdmin()) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML =
    ctx.route === 'admin'
      ? `<a href="#/" class="btn-ghost !py-1">${icon('view_list', 15)}Board</a>`
      : `<a href="#/admin" class="px-2.5 py-1 rounded text-xs uppercase font-medium tracking-wider bg-obsidian-800 hover:bg-obsidian-700 text-slate-200 border border-obsidian-700 transition-colors flex items-center gap-1.5">
           <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>Admin
         </a>`;
}

function renderTabs(container, ctx) {
  const desktop = container.querySelector('#dept-nav');
  const mobile = container.querySelector('#dept-nav-mobile');

  if (!canSeeAll()) {
    // Staff only ever see their own department, so a label, not tabs.
    const dept = deptById(state.user.departmentId);
    const label = `<span class="px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider bg-techblue-600/20 text-cyanaccent-400 border border-techblue-500/30">${esc(dept ? dept.name : 'No department')}</span>`;
    desktop.innerHTML = label;
    mobile.innerHTML = label;
    return;
  }

  const tabs = [{ id: 'all', name: 'All' }, ...state.departments, { id: 'unsorted', name: 'Unsorted' }];
  const active = ctx.route === 'board' ? ctx.activeTab : null;
  const html = tabs
    .map((t) => {
      const on = active === t.id;
      const cls = on
        ? 'bg-techblue-600/20 text-cyanaccent-400 border border-techblue-500/30'
        : 'text-slate-400 hover:text-white hover:bg-obsidian-800 border border-transparent';
      return `<button type="button" data-tab="${t.id}" class="px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider whitespace-nowrap transition-colors ${cls}">${esc(t.name)}</button>`;
    })
    .join('');
  desktop.innerHTML = html;
  mobile.innerHTML = html;

  [desktop, mobile].forEach((nav) =>
    nav.querySelectorAll('[data-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const raw = btn.dataset.tab;
        ctx.onTab(isNaN(Number(raw)) ? raw : Number(raw));
      })
    )
  );
}

function renderConnection(container) {
  const el = container.querySelector('#conn');
  if (!el) return;
  const map = {
    live: ['text-cyanaccent-400', 'bg-cyanaccent-400 animate-pulse', 'LIVE · REALTIME SYNC'],
    connecting: ['text-amber-400', 'bg-amber-400', 'CONNECTING'],
    offline: ['text-red-400', 'bg-red-400', 'OFFLINE · REFRESH TO RESYNC'],
  };
  const [text, dot, label] = map[state.connection] || map.connecting;
  el.className = `font-mono text-[11px] flex items-center gap-1.5 font-semibold ${text}`;
  el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${dot}"></span>${label}`;
}

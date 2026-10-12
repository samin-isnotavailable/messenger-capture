import { state, on, deptById, personLabel, updateProfile, assigneesOf } from './store.js';
import { ROLES, DEPT_TAG, DEPT_BAR, DEFAULT_DEPT_TAG } from './lib/config.js';
import { esc, icon, initials, fmtTime, fmtDate, relativeTime, statusLabel, isOverdue } from './lib/util.js';
import { toast } from './lib/toast.js';
import { openTaskModal } from './modals.js';

// Admin & Governance Console. Layout follows the Stitch "Obsidian Kinetic"
// admin screen; every number on it is computed from real rows, nothing
// is simulated.

const ui = { q: '', role: 'all' };
let root = null;
let offs = [];
let streamCleared = 0; // activity entries at or before this time are hidden

const DAY = 86400000;

export function mountAdmin(view, goBoard) {
  root = view;
  root.innerHTML = `
    <div class="h-px w-full bg-gradient-to-r from-transparent via-cyanaccent-400/50 to-transparent"></div>
    <section class="w-full px-4 sm:px-6 py-6 bg-obsidian-950/70 border-b border-slate-800/60">
      <div class="max-w-[1720px] mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div class="flex flex-col gap-2 min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2.5">
              <span class="relative flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyanaccent-400 opacity-60"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-cyanaccent-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]"></span>
              </span>
              <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase">Admin &amp; Governance Console</h1>
            </div>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyanaccent-500/10 border border-cyanaccent-500/25 text-cyanaccent-300 font-mono text-[11px] uppercase tracking-wide">
              <span class="w-1.5 h-1.5 rounded-full bg-cyanaccent-400 animate-pulse"></span>RLS enforced // Supabase auth
            </span>
          </div>
          <p class="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
            Roles and departments decide what each person can see and edit. Changes here apply to
            <span class="font-mono text-cyanaccent-400 bg-obsidian-900 px-1 py-0.5 rounded border border-slate-800">public.profiles</span>
            immediately and are enforced by row-level security on
            <span class="font-mono text-cyanaccent-400 bg-obsidian-900 px-1 py-0.5 rounded border border-slate-800">public.tasks</span>.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2.5 self-start xl:self-auto">
          <button type="button" id="a-triage" class="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-obsidian-950 text-xs uppercase font-bold tracking-wider flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]">
            ${icon('move_to_inbox', 18)}<span>Triage unsorted</span><span id="a-triage-n" class="font-mono text-[10px] bg-obsidian-950/25 px-1.5 py-0.5 rounded"></span>
          </button>
          <button type="button" id="a-csv" class="px-3 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-slate-200 border border-slate-700/80 text-xs uppercase font-medium tracking-wider flex items-center gap-1.5 transition-colors">
            ${icon('download', 18, 'text-cyanaccent-400')}<span>Export roster CSV</span>
          </button>
        </div>
      </div>
    </section>

    <section class="w-full px-4 sm:px-6 py-5">
      <div id="a-kpis" class="max-w-[1720px] mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"></div>
    </section>

    <section class="w-full px-4 sm:px-6 pb-6">
      <div class="max-w-[1720px] mx-auto flex flex-col gap-3">
        <div class="bg-obsidian-850/80 border border-slate-800/80 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center gap-3">
          <label class="relative flex-1 min-w-0">
            ${icon('search', 18, 'absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none')}
            <input id="a-search" class="field !pl-10" placeholder="Filter roster by username, email, or department" autocomplete="off" />
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-[11px] text-slate-500 uppercase flex items-center gap-1">${icon('filter_list', 15)}Role:</span>
            <div id="a-roles" class="flex flex-wrap items-center gap-1.5"></div>
          </div>
        </div>

        <div class="bg-obsidian-850/60 border border-slate-800/80 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left min-w-[980px]">
              <thead>
                <tr class="border-b border-slate-800 font-mono text-[11px] uppercase tracking-wider text-slate-500">
                  <th class="px-4 py-3 font-medium">Member / credentials</th>
                  <th class="px-4 py-3 font-medium">Display name</th>
                  <th class="px-4 py-3 font-medium">Security role</th>
                  <th class="px-4 py-3 font-medium">Assigned dept</th>
                  <th class="px-4 py-3 font-medium">Active tasks</th>
                  <th class="px-4 py-3 font-medium">Last activity</th>
                  <th class="px-4 py-3 font-medium text-right">Save</th>
                </tr>
              </thead>
              <tbody id="a-rows"></tbody>
            </table>
          </div>
          <div class="px-4 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500">
            <span id="a-showing"></span>
            <span>New people sign up through Supabase Auth, then get a role and department here.</span>
          </div>
        </div>
      </div>
    </section>

    <section class="w-full px-4 sm:px-6 pb-6">
      <div class="max-w-[1720px] mx-auto flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <span class="w-9 h-9 rounded-lg bg-obsidian-850 border border-slate-800 flex items-center justify-center text-cyanaccent-400">${icon('tune', 20)}</span>
          <div>
            <h2 class="text-sm sm:text-base font-bold uppercase tracking-tight text-white">Department pipelines</h2>
            <p class="font-mono text-[11px] text-slate-500">Live load per department, from the task table</p>
          </div>
        </div>
        <div id="a-depts" class="grid grid-cols-1 lg:grid-cols-3 gap-4"></div>
      </div>
    </section>

    <section class="w-full px-4 sm:px-6 pb-8">
      <div class="max-w-[1720px] mx-auto bg-obsidian-900/95 border border-slate-800/90 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        <div class="px-4 py-3 bg-obsidian-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="hidden sm:flex items-center gap-1.5">
              <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
              <span class="w-3 h-3 rounded-full bg-amber-500/80"></span>
              <span class="w-3 h-3 rounded-full bg-emerald-500/80"></span>
            </div>
            <div class="flex items-center gap-2 min-w-0">
              ${icon('terminal', 18, 'text-cyanaccent-400')}
              <span class="font-mono text-xs text-slate-200 font-semibold tracking-wide truncate">realtime.taskapture.activity</span>
            </div>
          </div>
          <div class="flex items-center gap-3 font-mono text-[11px]">
            <span id="a-live" class="px-2 py-0.5 rounded-full flex items-center gap-1.5 border"></span>
            <button type="button" id="a-clear" class="text-slate-400 hover:text-white uppercase transition-colors">Clear</button>
          </div>
        </div>
        <div id="a-stream" class="p-3 bg-obsidian-950/90 flex flex-col gap-1.5 font-mono text-[11px] max-h-80 overflow-y-auto"></div>
      </div>
    </section>
  `;

  root.querySelector('#a-triage').addEventListener('click', () => goBoard('unsorted'));
  root.querySelector('#a-csv').addEventListener('click', exportCsv);
  root.querySelector('#a-search').addEventListener('input', (e) => {
    ui.q = e.target.value.trim().toLowerCase();
    renderRoster();
  });
  root.querySelector('#a-clear').addEventListener('click', () => {
    streamCleared = Date.now();
    renderStream();
  });
  root.querySelector('#a-stream').addEventListener('click', (e) => {
    const t = e.target.closest('[data-open]');
    if (t) openTaskModal(Number(t.dataset.open));
  });

  renderAllAdmin();
  offs = [
    on('task', () => {
      renderKpis();
      renderDepts();
      renderRoster();
    }),
    on('assignees', () => {
      renderKpis();
      renderRoster();
    }),
    on('profiles', () => {
      renderKpis();
      renderRoster();
      renderDepts();
    }),
    on('reset', renderAllAdmin),
    on('activity', renderStream),
    on('connection', renderLive),
  ];
}

export function unmountAdmin() {
  offs.forEach((off) => off());
  offs = [];
  root = null;
}

function renderAllAdmin() {
  if (!root) return;
  renderKpis();
  renderRoster();
  renderDepts();
  renderStream();
  renderLive();
}

// ---------------------------------------------------------------- data helpers

const tasks = () => [...state.tasks.values()];
const isOpen = (t) => (t.workflow_status || 'inbox') !== 'done';

function openAssignedCount(profileId) {
  let n = 0;
  for (const t of state.tasks.values()) {
    if (!isOpen(t)) continue;
    if (assigneesOf(t.id).some((a) => a.assigned_to === profileId && !a.completed_at)) n += 1;
  }
  return n;
}

// Most recent thing this person did that the data records: a completion
// they ticked (for themselves or someone else) or a task they created.
function lastActivity(profileId) {
  let latest = null;
  const consider = (at) => {
    if (at && (!latest || new Date(at) > new Date(latest))) latest = at;
  };
  for (const t of state.tasks.values()) if (t.user_id === profileId) consider(t.created_at);
  for (const rows of state.assignees.values()) {
    for (const a of rows) {
      if (a.completed_at && (a.fulfilled_by || a.assigned_to) === profileId) consider(a.completed_at);
    }
  }
  return latest;
}

function doneWithin(t, ms) {
  const rows = assigneesOf(t.id).filter((a) => a.completed_at);
  if (!rows.length) return false;
  const last = Math.max(...rows.map((a) => new Date(a.completed_at).getTime()));
  return Date.now() - last <= ms;
}

// ---------------------------------------------------------------- KPI strip

// Tailwind only ships classes it can find written out in full, so every
// tone is spelled out here instead of being built from a template.
const CARD_TONE = {
  cyan: {
    card: 'hover:border-cyan-500/40',
    glow: 'bg-cyan-500/5 group-hover:bg-cyan-500/10',
    icon: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  },
  amber: {
    card: 'hover:border-amber-500/40',
    glow: 'bg-amber-500/5 group-hover:bg-amber-500/10',
    icon: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  },
  red: {
    card: 'hover:border-red-500/40',
    glow: 'bg-red-500/5 group-hover:bg-red-500/10',
    icon: 'bg-red-500/10 border-red-500/20 text-red-400',
  },
  emerald: {
    card: 'hover:border-emerald-500/40',
    glow: 'bg-emerald-500/5 group-hover:bg-emerald-500/10',
    icon: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  },
};

const BADGE_TONE = {
  amber: ['text-amber-400 bg-amber-950/60 border-amber-700/50', 'bg-amber-400'],
  emerald: ['text-emerald-400 bg-emerald-950/60 border-emerald-700/50', 'bg-emerald-400'],
  red: ['text-red-400 bg-red-950/60 border-red-700/50', 'bg-red-400'],
};

const HEALTH_TONE = {
  red: ['text-red-400', 'bg-red-400'],
  emerald: ['text-emerald-400', 'bg-emerald-400'],
};

function kpiCard({ tone, iconName, label, badge, body, foot }) {
  const t = CARD_TONE[tone];
  return `
    <div class="bg-obsidian-850/70 border border-slate-800/80 ${t.card} p-4 rounded-xl flex flex-col justify-between gap-3.5 transition-all group relative overflow-hidden">
      <div class="absolute -right-6 -bottom-6 w-24 h-24 ${t.glow} rounded-full blur-xl pointer-events-none transition-colors"></div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-8 h-8 rounded-lg border ${t.icon} flex items-center justify-center flex-shrink-0">${icon(iconName, 18)}</span>
          <span class="font-mono text-[11px] uppercase tracking-wider text-slate-400 truncate">${label}</span>
        </div>
        ${badge || ''}
      </div>
      ${body}
      <div class="flex items-center justify-between gap-2 font-mono text-[11px] text-slate-400 bg-obsidian-900/80 p-2 rounded-lg border border-slate-800/80">${foot}</div>
    </div>`;
}

function badge(tone, text, pulse = false) {
  const [cls, dot] = BADGE_TONE[tone];
  return `<span class="font-mono text-[10px] border px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${cls}">
    <span class="w-1.5 h-1.5 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}"></span>${text}</span>`;
}

function renderKpis() {
  if (!root) return;
  const people = state.profiles;
  const count = (r) => people.filter((p) => p.role === r).length;
  const noDept = people.filter((p) => p.role === 'staff' && !p.department_id).length;
  const stack = people
    .slice(0, 3)
    .map(
      (p) =>
        `<span class="h-6 w-6 rounded-full bg-blue-900 border border-slate-800 text-[10px] text-blue-200 flex items-center justify-center font-bold font-mono">${esc(initials(personLabel(p)))}</span>`
    )
    .join('');
  const more = people.length > 3 ? `<span class="h-6 w-6 rounded-full bg-slate-800 border border-slate-700 text-[9px] text-slate-300 flex items-center justify-center font-mono">+${people.length - 3}</span>` : '';

  const open = tasks().filter(isOpen);
  const perDept = state.departments.map((d) => ({ d, n: open.filter((t) => t.department_id === d.id).length }));
  const totalOpenInDepts = perDept.reduce((s, x) => s + x.n, 0) || 1;
  const busiest = [...perDept].sort((a, b) => b.n - a.n)[0];

  const unsorted = open.filter((t) => t.department_id == null);
  const unassigned = open.filter((t) => t.department_id != null && !assigneesOf(t.id).length);
  const triage = unsorted.length + unassigned.length;
  root.querySelector('#a-triage-n').textContent = String(unsorted.length);

  const overdue = open.filter(isOverdue);
  const doneWeek = tasks().filter((t) => !isOpen(t) && doneWithin(t, 7 * DAY)).length;
  const highOpen = open.filter((t) => t.priority === 'high').length;

  root.querySelector('#a-kpis').innerHTML = [
    kpiCard({
      tone: 'cyan',
      iconName: 'badge',
      label: 'Active workforce',
      badge: noDept ? badge('amber', `${noDept} NO DEPT`) : badge('emerald', 'ALL ROUTED'),
      body: `<div class="flex items-baseline justify-between pt-1">
          <div class="text-3xl font-bold text-white tracking-tight flex items-baseline gap-2">${people.length}<span class="text-xs font-mono font-normal text-slate-400 uppercase">Enrolled</span></div>
          <div class="flex -space-x-1.5">${stack}${more}</div>
        </div>`,
      foot: `<span><span class="text-blue-400 font-semibold">${count('super_admin')} Admin</span> <span class="text-slate-600">·</span> <span class="text-cyanaccent-400 font-semibold">${count('manager')} Manager${count('manager') === 1 ? '' : 's'}</span> <span class="text-slate-600">·</span> <span class="text-slate-300">${count('staff')} Staff</span></span>`,
    }),
    kpiCard({
      tone: 'amber',
      iconName: 'speed',
      label: 'Pipeline load',
      badge: badge('amber', `${open.length} OPEN`, true),
      body: `<div class="flex flex-col gap-2 pt-1">
          <div class="flex flex-wrap items-center justify-between gap-x-3 text-xs font-mono">
            ${perDept.map(({ d, n }) => `<span class="text-slate-400">${esc(d.name)}: <span class="text-slate-100 font-bold">${n}</span></span>`).join('')}
          </div>
          <div class="w-full h-2.5 bg-obsidian-900 rounded-full overflow-hidden flex p-0.5 border border-slate-800 gap-0.5">
            ${perDept.map(({ d, n }) => (n ? `<div class="h-full rounded-full ${DEPT_BAR[d.name] || 'bg-slate-400'}" style="width:${(n / totalOpenInDepts) * 100}%" title="${esc(d.name)}: ${n} open"></div>` : '')).join('')}
          </div>
        </div>`,
      foot: busiest && busiest.n ? `<span>Busiest: ${esc(busiest.d.name)}</span><span class="text-amber-400 font-medium">${highOpen} high priority</span>` : '<span>No open work in any department</span>',
    }),
    kpiCard({
      tone: 'red',
      iconName: 'warning',
      label: 'Triage queue',
      badge: triage ? badge('red', 'NEEDS ROUTING', true) : badge('emerald', 'CLEAR'),
      body: `<div class="flex items-baseline justify-between pt-1 gap-2">
          <div class="text-3xl font-bold ${triage ? 'text-red-400' : 'text-white'} tracking-tight flex items-baseline gap-2">${triage}<span class="text-xs font-mono font-normal text-slate-400 uppercase">Open items</span></div>
          <button type="button" data-goto="unsorted" class="px-2.5 py-1 rounded bg-cyanaccent-500/10 hover:bg-cyanaccent-500/20 text-cyanaccent-400 border border-cyanaccent-500/30 font-mono text-[10px] uppercase font-semibold flex items-center gap-1 transition-colors">Resolve ${icon('arrow_forward', 13)}</button>
        </div>`,
      foot: `<span>${unsorted.length} with no department</span><span class="text-amber-400 font-semibold">${unassigned.length} with nobody assigned</span>`,
    }),
    kpiCard({
      tone: 'emerald',
      iconName: 'task_alt',
      label: 'Delivery',
      badge: overdue.length ? badge('red', `${overdue.length} OVERDUE`) : badge('emerald', 'ON SCHEDULE'),
      body: `<div class="flex items-baseline justify-between pt-1">
          <div class="text-3xl font-bold text-white tracking-tight flex items-baseline gap-2">${doneWeek}<span class="text-xs font-mono font-normal text-slate-400 uppercase">Done in 7 days</span></div>
        </div>`,
      foot: `<span>Overdue open tasks</span><span class="${overdue.length ? 'text-red-400' : 'text-emerald-400'} font-semibold">${overdue.length}</span>`,
    }),
  ].join('');

  root.querySelector('[data-goto="unsorted"]').addEventListener('click', () => root.querySelector('#a-triage').click());
}

// ---------------------------------------------------------------- roster

const ROLE_STYLE = {
  super_admin: 'bg-blue-950 text-blue-300 border-blue-700/60',
  manager: 'bg-cyan-950 text-cyan-300 border-cyan-700/60',
  staff: 'bg-slate-800 text-slate-300 border-slate-700',
};

function rosterFiltered() {
  return [...state.profiles]
    .filter((p) => ui.role === 'all' || p.role === ui.role)
    .filter((p) => {
      if (!ui.q) return true;
      const hay = `${p.username || ''} ${p.email || ''} ${deptById(p.department_id)?.name || ''}`.toLowerCase();
      return hay.includes(ui.q);
    })
    .sort((a, b) => ROLES.indexOf(b.role) - ROLES.indexOf(a.role) || personLabel(a).localeCompare(personLabel(b)));
}

function renderRoleChips() {
  const all = state.profiles;
  const chips = [{ v: 'all', l: 'All', n: all.length }, ...[...ROLES].reverse().map((r) => ({ v: r, l: r.replace('_', ' '), n: all.filter((p) => p.role === r).length }))];
  const box = root.querySelector('#a-roles');
  box.innerHTML = chips
    .map(
      (c) => `<button type="button" data-role="${c.v}" class="px-2.5 py-1 rounded font-mono text-[11px] uppercase border transition-colors ${
        ui.role === c.v ? 'bg-cyan-500 text-obsidian-950 border-cyan-400 font-bold' : 'bg-obsidian-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-600'
      }">${esc(c.l)} (${c.n})</button>`
    )
    .join('');
  box.querySelectorAll('[data-role]').forEach((b) =>
    b.addEventListener('click', () => {
      ui.role = b.dataset.role;
      renderRoster();
    })
  );
}

function renderRoster() {
  if (!root) return;
  // Don't wipe a row someone is in the middle of editing.
  const editing = root.querySelector('#a-rows tr[data-dirty="1"]');
  renderRoleChips();
  if (editing) return;

  const rows = rosterFiltered();
  const tbody = root.querySelector('#a-rows');
  root.querySelector('#a-showing').innerHTML = `<span class="text-emerald-400">●</span> Showing ${rows.length} of ${state.profiles.length} accounts`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-10 text-center text-sm text-slate-500">No one matches this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(rosterRow).join('');
  tbody.querySelectorAll('tr[data-id]').forEach(bindRosterRow);
}

function rosterRow(p) {
  const name = personLabel(p);
  const isSelf = p.id === state.user.id;
  const dept = deptById(p.department_id);
  const active = openAssignedCount(p.id);
  const last = lastActivity(p.id);
  const needsDept = p.role === 'staff' && !dept;

  return `
    <tr data-id="${p.id}" class="border-b border-slate-800/70 hover:bg-obsidian-800/40 transition-colors">
      <td class="px-4 py-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="w-8 h-8 rounded-full bg-slate-800 border ${p.role === 'super_admin' ? 'border-blue-500/50 text-blue-300' : 'border-slate-600 text-slate-300'} flex items-center justify-center text-[11px] font-bold flex-shrink-0">${esc(initials(name))}</span>
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-semibold text-slate-100 truncate">${esc(name)}${isSelf ? ' <span class="text-slate-500 font-normal text-xs">(you)</span>' : ''}</span>
            <span class="font-mono text-[11px] text-slate-500 truncate">${esc(p.email || '')}</span>
          </div>
        </div>
      </td>
      <td class="px-4 py-3">
        <input data-f="username" value="${esc(p.username || '')}" placeholder="username" class="field !text-xs !py-1.5 !w-40" />
      </td>
      <td class="px-4 py-3">
        ${
          isSelf
            ? `<span class="inline-flex items-center gap-1.5 border text-[10px] font-mono px-2 py-1 rounded uppercase ${ROLE_STYLE[p.role] || ROLE_STYLE.staff}" title="You can't change your own role">${icon('lock', 12)}${esc(p.role)}</span>`
            : `<select data-f="role" class="field !text-xs !py-1.5 !w-36 font-mono uppercase">
                ${ROLES.map((r) => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>`
        }
      </td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <select data-f="department_id" class="field !text-xs !py-1.5 !w-36 ${needsDept ? '!border-amber-600/70' : ''}">
            <option value="">No department</option>
            ${state.departments.map((d) => `<option value="${d.id}" ${p.department_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
          </select>
          ${needsDept ? `<span class="text-amber-400" title="Staff without a department can't see any board">${icon('warning', 16)}</span>` : ''}
        </div>
      </td>
      <td class="px-4 py-3">
        <span class="font-mono text-xs px-2.5 py-1 rounded-full border ${active ? 'bg-obsidian-900 border-slate-700 text-slate-200' : 'border-slate-800 text-slate-500'}">${active} task${active === 1 ? '' : 's'}</span>
      </td>
      <td class="px-4 py-3">
        <span class="font-mono text-[11px] ${last ? 'text-slate-300' : 'text-slate-500'}" title="${last ? esc(fmtDate(last)) : ''}">${last ? esc(relativeTime(last)) : 'No activity yet'}</span>
      </td>
      <td class="px-4 py-3 text-right">
        <button type="button" data-save disabled class="px-3 py-1.5 rounded font-mono text-[11px] uppercase border border-slate-800 text-slate-500 disabled:cursor-not-allowed transition-colors">Saved</button>
      </td>
    </tr>`;
}

function bindRosterRow(tr) {
  const id = tr.dataset.id;
  const btn = tr.querySelector('[data-save]');
  const markDirty = () => {
    tr.dataset.dirty = '1';
    btn.disabled = false;
    btn.textContent = 'Save';
    btn.className = 'px-3 py-1.5 rounded font-mono text-[11px] uppercase border border-cyan-500/60 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition-colors';
  };
  tr.querySelectorAll('[data-f]').forEach((f) => f.addEventListener('input', markDirty));
  tr.querySelectorAll('select[data-f]').forEach((f) => f.addEventListener('change', markDirty));

  btn.addEventListener('click', async () => {
    const patch = {};
    const u = tr.querySelector('[data-f="username"]').value.trim();
    patch.username = u || null;
    const role = tr.querySelector('[data-f="role"]');
    if (role) patch.role = role.value;
    const dept = tr.querySelector('[data-f="department_id"]').value;
    patch.department_id = dept ? Number(dept) : null;

    btn.disabled = true;
    btn.textContent = 'Saving';
    try {
      await updateProfile(id, patch);
      delete tr.dataset.dirty;
      toast(`${personLabel(id)} updated`);
      renderRoster();
      renderKpis();
    } catch (err) {
      const msg = /duplicate|unique/i.test(err.message) ? 'That username is already taken.' : err.message;
      toast(msg, 'error');
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });
}

function exportCsv() {
  const rows = rosterFiltered();
  const header = ['username', 'email', 'role', 'department', 'active_tasks', 'last_activity'];
  const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')].concat(
    rows.map((p) =>
      [p.username, p.email, p.role, deptById(p.department_id)?.name || '', openAssignedCount(p.id), lastActivity(p.id) || '']
        .map(quote)
        .join(',')
    )
  );
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `taskapture-roster-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- departments

function renderDepts() {
  if (!root) return;
  const all = tasks();
  root.querySelector('#a-depts').innerHTML = state.departments
    .map((d) => {
      const mine = all.filter((t) => t.department_id === d.id);
      const open = mine.filter(isOpen);
      const inProgress = open.filter((t) => t.workflow_status === 'in_progress').length;
      const blocked = open.filter((t) => t.workflow_status === 'blocked').length;
      const overdue = open.filter(isOverdue).length;
      const doneWeek = mine.filter((t) => !isOpen(t) && doneWithin(t, 7 * DAY)).length;
      const members = state.profiles.filter((p) => p.department_id === d.id);
      const lead = members.find((p) => p.role === 'manager') || null;
      const withDue = mine.filter((t) => t.due_date);
      const onTime = withDue.length ? Math.round((withDue.filter((t) => !isOverdue(t)).length / withDue.length) * 100) : null;
      const health = overdue || blocked ? ['red', overdue ? `${overdue} overdue` : `${blocked} blocked`] : ['emerald', 'Healthy queue'];
      const [healthText, healthDot] = HEALTH_TONE[health[0]];
      const dot = DEPT_BAR[d.name] || 'bg-slate-400';

      const line = (label, value) => `
        <div class="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-slate-800/70 last:border-0">
          <span class="font-mono text-[11px] text-slate-500">${label}</span>
          <span class="text-xs text-slate-200 text-right">${value}</span>
        </div>`;

      return `
        <div class="bg-obsidian-850/70 border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full ${dot}"></span>
              <span class="font-bold text-sm text-white">${esc(d.name)} pipeline</span>
            </div>
            <span class="border text-[10px] font-mono px-2 py-0.5 rounded uppercase ${DEPT_TAG[d.name] || DEFAULT_DEPT_TAG}">${members.length} member${members.length === 1 ? '' : 's'}</span>
          </div>
          <div class="bg-obsidian-900/70 border border-slate-800/80 rounded-lg">
            ${line('Department lead:', lead ? `<span class="inline-flex items-center gap-1.5"><span class="w-5 h-5 rounded-full bg-blue-900 text-[9px] text-blue-200 font-bold flex items-center justify-center">${esc(initials(personLabel(lead)))}</span>${esc(personLabel(lead))}</span>` : '<span class="text-amber-400">No manager set</span>')}
            ${line('Open tasks:', `<span class="font-mono">${open.length}</span> <span class="text-slate-500 font-mono">(${inProgress} in progress)</span>`)}
            ${line('Blocked / overdue:', `<span class="font-mono ${blocked || overdue ? 'text-red-400' : 'text-slate-300'}">${blocked} / ${overdue}</span>`)}
            ${line('Done in 7 days:', `<span class="font-mono text-emerald-400">${doneWeek}</span>`)}
          </div>
          <div class="flex items-center justify-between gap-2 pt-1">
            <span class="font-mono text-[11px] ${healthText} flex items-center gap-1.5 font-semibold">
              <span class="w-1.5 h-1.5 rounded-full ${healthDot}"></span>${health[1]}${onTime !== null ? ` · ${onTime}% within due date` : ''}
            </span>
            <a href="#/board/${d.id}" class="px-2.5 py-1 rounded bg-obsidian-850 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white font-mono text-[10px] uppercase flex items-center gap-1 transition-colors">Open board ${icon('arrow_forward', 13)}</a>
          </div>
        </div>`;
    })
    .join('');
}

// ---------------------------------------------------------------- activity stream

const KIND_STYLE = {
  TASK_CREATE: ['bg-cyan-950 text-cyan-300 border-cyan-800', 'CREATED', 'text-cyanaccent-400'],
  TASK_FULFILL: ['bg-emerald-950 text-emerald-300 border-emerald-800', 'FULFILLED', 'text-emerald-400'],
  REOPEN: ['bg-amber-950 text-amber-300 border-amber-800', 'REOPENED', 'text-amber-400'],
  STATUS_CHANGE: ['bg-blue-950 text-blue-300 border-blue-800', 'STATUS', 'text-blue-400'],
  DEPT_MOVE: ['bg-violet-950 text-violet-300 border-violet-800', 'ROUTED', 'text-violet-400'],
  TASK_DELETE: ['bg-red-950 text-red-300 border-red-800', 'DELETED', 'text-red-400'],
  PROFILE_UPDATE: ['bg-purple-950 text-purple-300 border-purple-800', 'ACCESS', 'text-purple-300'],
};

function taskRef(id, fallbackTitle) {
  const t = state.tasks.get(id);
  const title = (t?.task || fallbackTitle || '').replace(/\s+/g, ' ').trim();
  const short = title.length > 60 ? `${title.slice(0, 57)}...` : title;
  if (!t) return `<span class="text-slate-400">#${id}${short ? ` ${esc(short)}` : ''}</span>`;
  return `<button type="button" data-open="${id}" class="text-slate-200 hover:text-cyanaccent-400 hover:underline">#${id} ${esc(short)}</button>`;
}

const who = (id) => `<span class="text-blue-400">${esc(id ? personLabel(id) : 'someone')}</span>`;

function describe(e) {
  switch (e.kind) {
    case 'TASK_CREATE':
      return `${taskRef(e.taskId)} created by ${who(e.actor)}`;
    case 'TASK_FULFILL':
      return e.for
        ? `${who(e.actor)} completed ${who(e.for)}'s part of ${taskRef(e.taskId)}`
        : `${who(e.actor)} completed their part of ${taskRef(e.taskId)}`;
    case 'REOPEN':
      return `${who(e.actor)}'s part of ${taskRef(e.taskId)} was reopened`;
    case 'STATUS_CHANGE':
      return `${taskRef(e.taskId)} moved ${esc(statusLabel(e.from))} → <span class="text-slate-100">${esc(statusLabel(e.to))}</span>`;
    case 'DEPT_MOVE':
      return `${taskRef(e.taskId)} routed to <span class="text-slate-100">${esc(deptById(e.to)?.name || 'Unsorted')}</span>`;
    case 'TASK_DELETE':
      return `${taskRef(e.taskId, e.title)} deleted`;
    case 'PROFILE_UPDATE': {
      const bits = [];
      if (e.patch?.role) bits.push(`role ${e.patch.role}`);
      if ('department_id' in (e.patch || {})) bits.push(`dept ${deptById(e.patch.department_id)?.name || 'none'}`);
      return `${who(e.actor)} updated ${who(e.target)}${bits.length ? `: ${esc(bits.join(', '))}` : ''}`;
    }
    default:
      return esc(e.kind);
  }
}

function renderStream() {
  if (!root) return;
  const box = root.querySelector('#a-stream');
  const items = state.activity.filter((e) => new Date(e.at).getTime() > streamCleared);
  if (!items.length) {
    box.innerHTML = `<p class="text-slate-500 px-2 py-6 text-center">Waiting for new events. Anything that happens on the board appears here live.</p>`;
    return;
  }
  box.innerHTML = items
    .slice(0, 60)
    .map((e) => {
      const [tag, label, tail] = KIND_STYLE[e.kind] || KIND_STYLE.STATUS_CHANGE;
      const today = new Date(e.at).toDateString() === new Date().toDateString();
      const stamp = today ? fmtTime(e.at) : `${fmtDate(e.at)} ${fmtTime(e.at)}`;
      return `
        <div class="flex items-center justify-between gap-3 p-2 rounded-md bg-obsidian-900/70 hover:bg-slate-800/50 border ${e.live ? 'border-cyan-800/60' : 'border-slate-800/60'} transition-colors">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-slate-500 flex-shrink-0">[${esc(stamp)}]</span>
            <span class="px-1.5 rounded border text-[10px] font-bold flex-shrink-0 ${tag}">${label}</span>
            <span class="text-slate-300 truncate">${describe(e)}</span>
          </div>
          <span class="${tail} font-bold flex-shrink-0 hidden sm:inline">${e.live ? 'LIVE' : 'LOG'}</span>
        </div>`;
    })
    .join('');
}

function renderLive() {
  if (!root) return;
  const el = root.querySelector('#a-live');
  const live = state.connection === 'live';
  el.className = `px-2 py-0.5 rounded-full flex items-center gap-1.5 border ${
    live ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50' : 'text-amber-400 bg-amber-950/60 border-amber-800/50'
  }`;
  el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}"></span>${live ? 'LIVE STREAM' : 'RECONNECTING'}`;
}

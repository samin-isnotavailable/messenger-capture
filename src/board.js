import {
  state,
  on,
  canSeeAll,
  isSuperAdmin,
  deptById,
  personLabel,
  taskTypes,
  assigneesOf,
  completionInfo,
  updateTask,
  deleteTask,
} from './store.js';
import { STATUSES, STATUS_DOT, PRIORITY, DEPT_TAG, DEFAULT_DEPT_TAG, SOURCES } from './lib/config.js';
import {
  esc,
  icon,
  initials,
  typeLabel,
  statusLabel,
  displayParts,
  splitUrl,
  fmtDate,
  fmtShort,
  fmtTime,
  isOverdue,
  isDueToday,
  copyText,
  taskAge,
  STALE_DAYS,
} from './lib/util.js';
import { toast } from './lib/toast.js';
import { openCreateModal, openTaskModal, confirmDialog } from './modals.js';

const prefs = {
  get(key, fallback) {
    try {
      return localStorage.getItem(`tk.${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`tk.${key}`, value);
    } catch {
      /* private mode or blocked storage: fine, it just won't persist */
    }
  },
};

// ---------------------------------------------------------------- sorting
// Up to three chained levels: the first decides, the next only breaks
// ties. Done tasks always sink below open ones, whatever the chain.
const SORT_FIELDS = {
  priority: { label: 'Priority', dir: { desc: 'High → Low', asc: 'Low → High' }, defaultDir: 'desc' },
  due_date: { label: 'Due Date', dir: { asc: 'Earliest first', desc: 'Latest first' }, defaultDir: 'asc' },
  created_at: { label: 'Date of Entry', dir: { desc: 'Newest first', asc: 'Oldest first' }, defaultDir: 'desc' },
};
// Default is plain newest first, same as the board has always been.
// Priority / due date ordering is opt-in through the Sort menu.
const DEFAULT_SORT = [{ field: 'created_at', dir: 'desc' }];

// 'sort.v2': anyone who saved the old three-level default while testing
// starts fresh on newest first.
function loadSort() {
  try {
    const saved = JSON.parse(prefs.get('sort.v2', 'null'));
    if (Array.isArray(saved) && saved.length && saved.length <= 3) {
      const seen = new Set();
      const ok = saved.every((s) => SORT_FIELDS[s?.field] && ['asc', 'desc'].includes(s.dir) && !seen.has(s.field) && seen.add(s.field));
      if (ok) return saved;
    }
  } catch {
    /* bad JSON in storage: use the default */
  }
  return DEFAULT_SORT.map((s) => ({ ...s }));
}

const ui = {
  tab: 'all',
  view: prefs.get('view', 'list'),
  hideDone: prefs.get('hideDone', '0') === '1',
  mine: false,
  status: 'all',
  source: 'all',
  queuedOnly: false,
  sort: loadSort(),
};

let root = null;
let offs = [];
let ageTimer = null;

export function defaultTab() {
  if (canSeeAll()) return 'all';
  return state.user.departmentId ?? 'mine';
}

export function mountBoard(view, tab) {
  root = view;
  ui.tab = tab;
  root.innerHTML = `
    <section class="w-full px-4 sm:px-6 py-4 flex flex-col gap-3 max-w-[1720px] mx-auto">
      <form id="quick" class="w-full bg-obsidian-850 border border-obsidian-700/80 focus-within:border-techblue-500/70 rounded-xl p-2 flex items-center gap-2 transition-colors shadow-[0_0_0_1px_rgba(0,0,0,0.2)]">
        <span class="flex items-center pl-2 flex-shrink-0">${icon('add_task', 20, 'text-cyanaccent-400')}</span>
        <input id="quick-input" autocomplete="off" class="w-full min-w-0 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none px-2 py-1.5" placeholder="${window.matchMedia('(max-width: 640px)').matches ? 'Add a task or paste URL' : 'Add a task or paste URL... (Press Enter to configure)'}" />
        <div class="flex items-center gap-2 pr-1 flex-shrink-0">
          <span id="quick-dept" class="hidden sm:inline bg-obsidian-800 border border-obsidian-700 text-slate-400 font-mono text-[11px] px-2 py-1 rounded tracking-wider uppercase"></span>
          <button type="submit" class="btn-primary">${icon('tune', 16)}<span class="hidden sm:inline">Configure</span></button>
        </div>
      </form>

      <div class="w-full flex flex-wrap items-center justify-between gap-3 pt-1">
        <div class="flex flex-wrap items-center gap-4">
          ${checkToggle('f-hide', 'Hide Done', ui.hideDone)}
          ${checkToggle('f-mine', 'Assigned to me', ui.mine)}
          <div class="relative">
            <select id="f-status" class="field-sm appearance-none pr-7" aria-label="Filter by status">
              <option value="all">All statuses</option>
              ${STATUSES.map((s) => `<option value="${s}">${statusLabel(s)}</option>`).join('')}
            </select>
            ${icon('expand_more', 16, 'absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none')}
          </div>
          <div class="relative">
            <select id="f-source" class="field-sm appearance-none pr-7" aria-label="Filter by source">
              <option value="all">All sources</option>
              ${SOURCES.map((s) => `<option value="${s.value}">${s.label}</option>`).join('')}
            </select>
            ${icon('expand_more', 16, 'absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none')}
          </div>
          <div class="relative" id="sort-wrap">
            <button type="button" id="sort-trigger" aria-haspopup="true" aria-expanded="false" class="flex items-center gap-1.5 bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 hover:border-techblue-500/60 text-slate-300 text-xs px-2.5 py-1.5 rounded transition-all max-w-full"></button>
            <div id="sort-menu" class="hidden absolute left-0 top-full mt-1.5 z-30 w-[min(340px,calc(100vw-2rem))] bg-obsidian-850 border border-obsidian-700 rounded-lg shadow-2xl p-3 flex flex-col gap-2.5"></div>
          </div>
          <span id="count" class="font-mono text-[11px] text-slate-500"></span>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center bg-obsidian-850 p-1 rounded-lg border border-obsidian-700/80 gap-1">
            <button type="button" data-view="list" class="view-btn px-2.5 py-1 rounded text-xs uppercase font-medium flex items-center gap-1.5 transition-colors">${icon('format_list_bulleted', 15)}List</button>
            <button type="button" data-view="kanban" class="view-btn px-2.5 py-1 rounded text-xs uppercase font-medium flex items-center gap-1.5 transition-colors">${icon('view_kanban', 15)}Kanban</button>
          </div>
          <button type="button" id="queued" class="px-3 py-1.5 rounded border font-mono text-xs flex items-center gap-1.5 transition-colors" title="Tasks still in Inbox, waiting to be picked up">
            <span class="w-1.5 h-1.5 rounded-full bg-cyanaccent-400 animate-pulse"></span><span id="queued-text" class="font-bold tracking-wide"></span>
          </button>
        </div>
      </div>

      <div id="queued-banner" class="hidden w-full bg-blue-950/40 border border-blue-700/60 rounded-lg p-2.5 px-4 flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs text-blue-200">${icon('info', 18, 'text-cyanaccent-400')}<span>Showing <strong id="queued-banner-n"></strong> in Inbox, waiting to be picked up.</span></div>
        <button type="button" id="queued-clear" class="text-xs text-blue-300 hover:text-white underline font-mono flex items-center gap-1">${icon('close', 14)}Reset filter</button>
      </div>
    </section>

    <section class="w-full px-4 sm:px-6 pb-12 max-w-[1720px] mx-auto flex-1">
      <div id="list" class="flex flex-col gap-2.5"></div>
      <div id="kanban" class="hidden w-full overflow-x-auto pb-4"></div>
    </section>
  `;

  bindControls();
  bindSort();
  syncControls();
  renderAll();

  offs = [
    on('task', onTaskEvent),
    on('assignees', (taskId) => patchTask(taskId)),
    on('profiles', () => renderAll()),
    on('reset', () => renderAll()),
  ];

  // Ages tick over without a redraw: refresh just the age badges.
  ageTimer = setInterval(refreshAges, 60000);
}

function refreshAges() {
  if (!root) return;
  root.querySelectorAll('[data-age]').forEach((el) => {
    const task = state.tasks.get(Number(el.dataset.age));
    if (task) el.outerHTML = el.dataset.kind === 'card' ? ageCard(task) : ageBadge(task);
  });
}

export function setBoardTab(tab) {
  ui.tab = tab;
  ui.queuedOnly = false;
  syncControls();
  renderAll();
}

export function unmountBoard() {
  offs.forEach((off) => off());
  offs = [];
  clearInterval(ageTimer);
  ageTimer = null;
  document.removeEventListener('mousedown', onSortOutside);
  document.removeEventListener('keydown', onSortKey);
  root = null;
}

// ---------------------------------------------------------------- sort menu

const arrow = (s) => (s.field === 'due_date' ? (s.dir === 'asc' ? '▴' : '▾') : s.dir === 'desc' ? '▾' : '▴');

function renderSortTrigger() {
  const chips = ui.sort
    .map(
      (s, i) =>
        `<span class="inline-flex items-center gap-1 bg-obsidian-800 border text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap ${
          i === 0 ? 'text-cyanaccent-400 border-techblue-500/30 font-semibold' : 'text-slate-300 border-obsidian-700'
        }">${i + 1}. ${SORT_FIELDS[s.field].label} ${arrow(s)}</span>`
    )
    .join('');
  root.querySelector('#sort-trigger').innerHTML = `
    ${icon('swap_vert', 15, 'text-cyanaccent-400')}
    <span class="font-medium">Sort</span>
    <span class="hidden sm:flex items-center gap-1 ml-0.5 min-w-0">${chips}</span>
    <span class="sm:hidden font-mono text-[10px] text-cyanaccent-400">${ui.sort.length}</span>
    ${icon('expand_more', 14, 'text-slate-400 ml-0.5')}`;
}

function renderSortMenu() {
  const menu = root.querySelector('#sort-menu');
  const rows = ui.sort
    .map((s, i) => {
      const f = SORT_FIELDS[s.field];
      // Every field is offered at every level; picking one that another
      // level already uses swaps the two (see bindSort).
      const options = Object.entries(SORT_FIELDS)
        .map(([k, v]) => `<option value="${k}" ${k === s.field ? 'selected' : ''}>${v.label}</option>`)
        .join('');
      return `
        <div class="flex items-center gap-2" data-level="${i}">
          <span class="font-mono text-[11px] w-4 text-slate-500">${i + 1}.</span>
          <select data-sort-field class="field-sm flex-1 min-w-0" aria-label="Sort level ${i + 1} field">${options}</select>
          <button type="button" data-sort-dir class="field-sm !px-2 whitespace-nowrap font-mono text-[11px] text-cyanaccent-400 hover:border-techblue-500" title="Flip direction">${esc(f.dir[s.dir])}</button>
          ${
            ui.sort.length > 1
              ? `<button type="button" data-sort-remove class="text-slate-500 hover:text-red-400 p-0.5" title="Remove this level" aria-label="Remove sort level ${i + 1}">${icon('close', 15)}</button>`
              : '<span class="w-5"></span>'
          }
        </div>`;
    })
    .join('');

  menu.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="label-caps !text-[11px]">Sort by</span>
      <span class="font-mono text-[10px] text-slate-500">later levels break ties</span>
    </div>
    ${rows}
    <div class="flex items-center justify-between pt-1 border-t border-obsidian-700/70">
      ${
        ui.sort.length < 3
          ? `<button type="button" data-sort-add class="text-xs text-cyanaccent-400 hover:text-cyanaccent-300 flex items-center gap-1 pt-2">${icon('add', 15)}Add level</button>`
          : '<span></span>'
      }
      <button type="button" data-sort-reset class="text-xs text-slate-400 hover:text-white flex items-center gap-1 pt-2">${icon('restart_alt', 15)}Reset</button>
    </div>
    <p class="font-mono text-[10px] text-slate-500">Done tasks always stay at the bottom.</p>`;
}

function applySort() {
  prefs.set('sort.v2', JSON.stringify(ui.sort));
  renderSortTrigger();
  renderSortMenu();
  renderAll();
}

function setSortOpen(open) {
  const menu = root?.querySelector('#sort-menu');
  if (!menu) return;
  menu.classList.toggle('hidden', !open);
  root.querySelector('#sort-trigger').setAttribute('aria-expanded', String(open));
  if (open) {
    renderSortMenu();
    document.addEventListener('mousedown', onSortOutside);
    document.addEventListener('keydown', onSortKey);
  } else {
    document.removeEventListener('mousedown', onSortOutside);
    document.removeEventListener('keydown', onSortKey);
  }
}
function onSortOutside(e) {
  if (!root?.querySelector('#sort-wrap')?.contains(e.target)) setSortOpen(false);
}
function onSortKey(e) {
  if (e.key === 'Escape') setSortOpen(false);
}

function bindSort() {
  renderSortTrigger();
  root.querySelector('#sort-trigger').addEventListener('click', () => {
    setSortOpen(root.querySelector('#sort-menu').classList.contains('hidden'));
  });
  const menu = root.querySelector('#sort-menu');
  menu.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-sort-field]');
    if (!sel) return;
    const i = Number(sel.closest('[data-level]').dataset.level);
    const other = ui.sort.findIndex((s, j) => j !== i && s.field === sel.value);
    if (other !== -1) {
      // Already used further down or up: swap the two levels.
      [ui.sort[i], ui.sort[other]] = [ui.sort[other], ui.sort[i]];
    } else {
      ui.sort[i] = { field: sel.value, dir: SORT_FIELDS[sel.value].defaultDir };
    }
    applySort();
  });
  menu.addEventListener('click', (e) => {
    const level = e.target.closest('[data-level]');
    const i = level ? Number(level.dataset.level) : -1;
    if (e.target.closest('[data-sort-dir]')) {
      ui.sort[i].dir = ui.sort[i].dir === 'asc' ? 'desc' : 'asc';
      applySort();
    } else if (e.target.closest('[data-sort-remove]')) {
      ui.sort.splice(i, 1);
      applySort();
    } else if (e.target.closest('[data-sort-add]')) {
      const next = Object.keys(SORT_FIELDS).find((k) => !ui.sort.some((s) => s.field === k));
      if (next) ui.sort.push({ field: next, dir: SORT_FIELDS[next].defaultDir });
      applySort();
    } else if (e.target.closest('[data-sort-reset]')) {
      ui.sort = DEFAULT_SORT.map((s) => ({ ...s }));
      applySort();
    }
  });
}

// ---------------------------------------------------------------- controls

function checkToggle(id, label, checked) {
  return `
    <label class="flex items-center gap-2 cursor-pointer select-none group">
      <input id="${id}" type="checkbox" class="peer sr-only" ${checked ? 'checked' : ''} />
      <span class="check-box">${icon('check', 14)}</span>
      <span class="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">${label}</span>
    </label>`;
}

function bindControls() {
  const input = root.querySelector('#quick-input');
  root.querySelector('#quick').addEventListener('submit', (e) => {
    e.preventDefault();
    openCreateModal(input.value.trim(), tabDepartment(), () => {
      input.value = '';
    });
  });

  root.querySelector('#f-hide').addEventListener('change', (e) => {
    ui.hideDone = e.target.checked;
    prefs.set('hideDone', ui.hideDone ? '1' : '0');
    renderAll();
  });
  root.querySelector('#f-mine').addEventListener('change', (e) => {
    ui.mine = e.target.checked;
    renderAll();
  });
  root.querySelector('#f-status').addEventListener('change', (e) => {
    ui.status = e.target.value;
    ui.queuedOnly = false;
    syncControls();
    renderAll();
  });
  root.querySelector('#f-source').addEventListener('change', (e) => {
    ui.source = e.target.value;
    renderAll();
  });
  root.querySelectorAll('.view-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      ui.view = btn.dataset.view;
      prefs.set('view', ui.view);
      syncControls();
      renderAll();
    })
  );
  root.querySelector('#queued').addEventListener('click', () => {
    ui.queuedOnly = !ui.queuedOnly;
    if (ui.queuedOnly) ui.status = 'all';
    syncControls();
    renderAll();
  });
  root.querySelector('#queued-clear').addEventListener('click', () => {
    ui.queuedOnly = false;
    syncControls();
    renderAll();
  });
}

function syncControls() {
  if (!root) return;
  root.querySelector('#f-status').value = ui.status;
  root.querySelector('#f-source').value = ui.source;
  root.querySelectorAll('.view-btn').forEach((btn) => {
    const on = btn.dataset.view === ui.view;
    btn.className = `view-btn px-2.5 py-1 rounded text-xs uppercase font-medium flex items-center gap-1.5 transition-colors ${
      on ? 'bg-techblue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-obsidian-800'
    }`;
  });
  const q = root.querySelector('#queued');
  q.className = `px-3 py-1.5 rounded border font-mono text-xs flex items-center gap-1.5 transition-colors ${
    ui.queuedOnly
      ? 'bg-cyanaccent-400/15 border-cyanaccent-400/60 text-cyanaccent-300'
      : 'bg-blue-950/50 border-blue-700/60 text-blue-300 hover:border-cyanaccent-400/50'
  }`;
  const dept = tabDepartment();
  const chip = root.querySelector('#quick-dept');
  chip.textContent = ui.tab === 'all' ? 'Pick dept' : ui.tab === 'unsorted' ? 'Unsorted' : dept ? deptById(dept)?.name || '' : 'Mine';
}

// The department the Configure modal should preselect for this tab.
function tabDepartment() {
  return typeof ui.tab === 'number' ? ui.tab : null;
}

// ---------------------------------------------------------------- filtering

function inTab(task) {
  if (ui.tab === 'all') return true;
  if (ui.tab === 'unsorted') return task.department_id == null;
  if (ui.tab === 'mine') return assigneesOf(task.id).some((a) => a.assigned_to === state.user.id);
  return task.department_id === ui.tab;
}

function statusOf(task) {
  return task.workflow_status || 'inbox';
}

function passes(task) {
  if (!inTab(task)) return false;
  const status = statusOf(task);
  if (ui.hideDone && status === 'done') return false;
  if (ui.queuedOnly && status !== 'inbox') return false;
  if (ui.status !== 'all' && status !== ui.status) return false;
  if (ui.source !== 'all' && (task.source_type || 'manual') !== ui.source) return false;
  if (ui.mine && !assigneesOf(task.id).some((a) => a.assigned_to === state.user.id)) return false;
  return true;
}

const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
const time = (v) => (v ? new Date(v).getTime() : NaN);

function compareBy(a, b, { field, dir }) {
  if (field === 'priority') {
    const c = (PRIORITY_RANK[a.priority] || 2) - (PRIORITY_RANK[b.priority] || 2);
    return dir === 'asc' ? c : -c;
  }
  if (field === 'due_date') {
    const ta = time(a.due_date);
    const tb = time(b.due_date);
    // No due date always goes last, in either direction.
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return dir === 'asc' ? ta - tb : tb - ta;
  }
  const c = (time(a.created_at) || 0) - (time(b.created_at) || 0);
  return dir === 'asc' ? c : -c;
}

// Open work first, done work sinks to the bottom, then the user's sort
// chain, then id so equal rows never shuffle between redraws.
function ordered(tasks) {
  return tasks.sort((a, b) => {
    const ad = statusOf(a) === 'done' ? 1 : 0;
    const bd = statusOf(b) === 'done' ? 1 : 0;
    if (ad !== bd) return ad - bd;
    for (const level of ui.sort) {
      const c = compareBy(a, b, level);
      if (c) return c;
    }
    return b.id - a.id;
  });
}

// ---------------------------------------------------------------- render

function renderAll() {
  if (!root) return;
  const visible = ordered([...state.tasks.values()].filter(passes));
  const inboxCount = [...state.tasks.values()].filter((t) => inTab(t) && statusOf(t) === 'inbox').length;

  root.querySelector('#queued-text').textContent = `${inboxCount} QUEUED`;
  root.querySelector('#queued-banner').classList.toggle('hidden', !ui.queuedOnly);
  root.querySelector('#queued-banner-n').textContent = `${inboxCount} task${inboxCount === 1 ? '' : 's'}`;
  root.querySelector('#count').textContent = `${visible.length} shown`;

  const list = root.querySelector('#list');
  const kanban = root.querySelector('#kanban');
  list.classList.toggle('hidden', ui.view !== 'list');
  kanban.classList.toggle('hidden', ui.view !== 'kanban');

  if (ui.view === 'list') {
    list.replaceChildren();
    if (!visible.length) {
      list.innerHTML = emptyState();
      return;
    }
    const frag = document.createDocumentFragment();
    visible.forEach((t) => frag.appendChild(buildRow(t)));
    list.appendChild(frag);
  } else {
    renderKanban(visible);
  }
}

function emptyState() {
  const msg =
    ui.tab === 'unsorted'
      ? 'Nothing unsorted. Every task has a department.'
      : ui.queuedOnly
        ? 'Inbox is clear.'
        : 'No tasks match these filters.';
  return `<div class="border border-dashed border-obsidian-700 rounded-xl py-16 flex flex-col items-center gap-2 text-slate-500">
    ${icon('inbox', 28)}<span class="text-sm">${msg}</span></div>`;
}

function onTaskEvent(id, kind, prev) {
  if (!root) return;
  if (ui.view === 'kanban' || kind === 'insert') {
    renderAll();
    return;
  }
  // A change to anything the sort looks at moves the row, so re-sort.
  const now = state.tasks.get(id);
  if (kind === 'update' && prev && now) {
    const moved =
      prev.priority !== now.priority ||
      prev.due_date !== now.due_date ||
      (prev.workflow_status === 'done') !== (now.workflow_status === 'done');
    if (moved) {
      renderAll();
      return;
    }
  }
  if (kind === 'delete') {
    root.querySelector(`[data-task="${id}"]`)?.remove();
    refreshCounters();
    return;
  }
  patchTask(id);
}

// Replace just this task's row (list) or redraw the board (kanban).
function patchTask(id) {
  if (!root) return;
  if (ui.view === 'kanban') {
    renderAll();
    return;
  }
  const task = state.tasks.get(id);
  const existing = root.querySelector(`[data-task="${id}"]`);
  if (!task) {
    existing?.remove();
  } else if (!passes(task)) {
    existing?.remove();
  } else if (existing) {
    existing.replaceWith(buildRow(task));
  } else {
    renderAll();
    return;
  }
  refreshCounters();
}

function refreshCounters() {
  const inboxCount = [...state.tasks.values()].filter((t) => inTab(t) && statusOf(t) === 'inbox').length;
  root.querySelector('#queued-text').textContent = `${inboxCount} QUEUED`;
  const shown = root.querySelectorAll('#list [data-task]').length;
  root.querySelector('#count').textContent = `${shown} shown`;
  if (!shown && ui.view === 'list') root.querySelector('#list').innerHTML = emptyState();
}

// ---------------------------------------------------------------- pieces

function priorityOf(task) {
  return PRIORITY[task.priority] ? task.priority : 'medium';
}

function deptTag(task) {
  if (ui.tab !== 'all' && ui.tab !== 'mine') return '';
  const d = deptById(task.department_id);
  if (!d) return `<span class="border text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider bg-amber-950/40 text-amber-400 border-amber-700/40 flex items-center gap-1">${icon('warning', 11)}No dept</span>`;
  return `<span class="border text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider ${DEPT_TAG[d.name] || DEFAULT_DEPT_TAG}">${esc(d.name)}</span>`;
}

function duePill(task) {
  if (!task.due_date) return '';
  const overdue = isOverdue(task);
  const today = isDueToday(task) && statusOf(task) !== 'done';
  const tone = overdue
    ? 'bg-red-950/60 text-red-300 border-red-700/60'
    : today
      ? 'bg-amber-950/50 text-amber-300 border-amber-700/50'
      : 'bg-obsidian-800 text-slate-400 border-obsidian-700/60';
  const label = overdue ? `${task.due_date} · OVERDUE` : today ? 'DUE TODAY' : task.due_date;
  return `<span class="font-mono text-[11px] px-2 py-0.5 rounded border flex items-center gap-1 ${tone}">${icon('calendar_today', 12)}${label}</span>`;
}

// Age since created_at, left of the status selector. Open tasks five
// days or older turn amber; done tasks stay grey with the rest of the row.
function ageBadge(task) {
  const age = taskAge(task.created_at);
  if (!age) return '';
  const done = statusOf(task) === 'done';
  const tone = done
    ? 'bg-slate-800/40 border-slate-700/50 text-slate-500'
    : age.stale
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
      : 'bg-slate-800/60 border-slate-700/60 text-slate-400';
  const tip = `${age.full}${!done && age.stale ? ` · open ${STALE_DAYS}+ days` : ''}`;
  return `<span data-age="${task.id}" class="font-mono text-xs px-2 py-1 rounded border flex items-center gap-1 whitespace-nowrap cursor-default ${tone}" title="${esc(tip)}" aria-label="Task age ${esc(age.label)}. ${esc(tip)}">${icon(!done && age.stale ? 'history' : 'schedule', 14)}${esc(age.label)}</span>`;
}

function ageCard(task) {
  const age = taskAge(task.created_at);
  if (!age) return '';
  const stale = age.stale && statusOf(task) !== 'done';
  return `<span data-age="${task.id}" data-kind="card" class="font-mono text-[10px] flex items-center gap-0.5 ${stale ? 'text-amber-400' : 'text-slate-500'}" title="${esc(age.full)}">${icon('schedule', 11)}${esc(age.label)}</span>`;
}

function progressPill(task) {
  const rows = assigneesOf(task.id);
  if (!rows.length) {
    return `<span class="font-mono text-[11px] px-2 py-0.5 rounded border bg-amber-950/30 text-amber-400/90 border-amber-800/50">UNASSIGNED</span>`;
  }
  const done = rows.filter((r) => r.completed_at).length;
  const tone = done === rows.length ? 'text-emerald-300 border-emerald-700/50 bg-emerald-950/40' : 'text-slate-400 border-obsidian-700/60 bg-obsidian-800';
  return `<span class="font-mono text-[11px] px-2 py-0.5 rounded border ${tone}">${done}/${rows.length} COMPLETED</span>`;
}

function urlChip(url, compact = false) {
  if (!url) return '';
  const { host, rest } = splitUrl(url);
  return `
    <div class="flex items-center gap-1 bg-obsidian-950 border border-obsidian-700/60 px-2 py-0.5 rounded min-w-0 ${compact ? 'max-w-full' : 'max-w-md'}" data-stop>
      <a href="${esc(url)}" target="_blank" rel="noopener" class="flex items-center min-w-0 hover:underline decoration-cyanaccent-400/50" title="Open ${esc(url)}">
        <span class="font-mono text-xs text-slate-500 flex-shrink-0">${esc(host)}</span>
        <span class="font-mono text-xs text-cyanaccent-400 truncate">${esc(rest)}</span>
      </a>
      <button type="button" data-copy="${esc(url)}" class="text-slate-400 hover:text-white ml-1 opacity-70 hover:opacity-100 transition-opacity flex-shrink-0" title="Copy URL" aria-label="Copy URL">${icon('content_copy', 13)}</button>
    </div>`;
}

function natureTags(task, size = 'row') {
  const cls =
    size === 'row'
      ? 'bg-obsidian-700/50 text-slate-300 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider border border-obsidian-600/40'
      : 'bg-obsidian-800 text-slate-300 text-[9px] px-1.5 py-0.5 rounded border border-obsidian-700 uppercase';
  return taskTypes(task)
    .map((t) => {
      const title = t === 'other' && task.task_detail ? ` title="${esc(task.task_detail)}"` : '';
      return `<span class="${cls}"${title}>${esc(typeLabel(t))}</span>`;
    })
    .join('');
}

function avatars(task, size = 5) {
  const rows = assigneesOf(task.id);
  if (!rows.length) return '';
  const shown = rows.slice(0, 4);
  const dim = size === 5 ? 'w-5 h-5 text-[9px]' : 'w-4 h-4 text-[8px]';
  const items = shown
    .map((a) => {
      const name = personLabel(a.assigned_to);
      const tone = a.completed_at
        ? 'bg-emerald-950 border-emerald-500/60 text-emerald-200'
        : a.assigned_to === state.user.id
          ? 'bg-techblue-900 border-techblue-500/50 text-blue-200'
          : 'bg-slate-800 border-slate-600 text-slate-300';
      const tip = a.completed_at ? `${name} (done)` : name;
      return `<span class="${dim} rounded-full border ${tone} flex items-center justify-center font-bold" title="${esc(tip)}">${esc(initials(name))}</span>`;
    })
    .join('');
  const more = rows.length > shown.length ? `<span class="${dim} rounded-full bg-obsidian-800 border border-obsidian-600 text-slate-400 flex items-center justify-center font-mono">+${rows.length - shown.length}</span>` : '';
  return `<div class="flex items-center -space-x-1 ml-1">${items}${more}</div>`;
}

function actions(task, done) {
  const del = isSuperAdmin()
    ? `<button type="button" data-act="delete" class="icon-btn-danger" title="Delete task" aria-label="Delete task">${icon('delete', 15)}</button>`
    : '';
  const edit = done ? '' : `<button type="button" data-act="edit" class="icon-btn" title="Edit task" aria-label="Edit task">${icon('edit', 15)}</button>`;
  return `
    <div class="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity duration-150">
      <button type="button" data-act="view" class="icon-btn" title="View details" aria-label="View details">${icon('visibility', 15)}</button>
      ${edit}${del}
    </div>`;
}

function statusSelect(task) {
  const s = statusOf(task);
  return `
    <div class="relative flex items-center">
      <span class="absolute left-2.5 w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]} pointer-events-none"></span>
      <select data-status class="appearance-none bg-obsidian-800 border border-obsidian-700 text-slate-200 text-xs pl-6 pr-7 py-1.5 rounded focus:outline-none focus:border-techblue-500 cursor-pointer" aria-label="Status">
        ${STATUSES.map((v) => `<option value="${v}" ${v === s ? 'selected' : ''}>${statusLabel(v)}</option>`).join('')}
      </select>
      ${icon('expand_more', 14, 'absolute right-1.5 text-slate-400 pointer-events-none')}
    </div>`;
}

function buildRow(task) {
  const el = document.createElement('div');
  el.dataset.task = task.id;
  el.tabIndex = 0;
  const { title, url } = displayParts(task);
  const done = statusOf(task) === 'done';

  if (done) {
    const info = completionInfo(task);
    const by = info ? `DONE BY ${esc(info.by).toUpperCase()}${info.extra > 0 ? ` +${info.extra}` : ''}` : 'DONE';
    const when = info?.at ? `Completed on ${fmtDate(info.at)} · ${fmtTime(info.at)}` : 'Completed';
    el.className =
      'group relative bg-[#11141d] border border-obsidian-700/60 hover:border-slate-600 rounded-xl pl-5 pr-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer overflow-hidden transition-colors grayscale';
    el.innerHTML = `
      <div class="absolute left-0 top-0 bottom-0 w-[4px] bg-slate-600"></div>
      <div class="flex flex-col min-w-0 flex-1 gap-1">
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <span class="w-4 h-4 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center flex-shrink-0">${icon('check', 12, 'text-slate-400')}</span>
          <span class="text-sm text-slate-500 line-through tracking-tight truncate max-w-xl">${esc(title)}</span>
          <span class="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1">${icon('check_circle', 11, 'text-slate-400')}${by}</span>
          ${deptTag(task)}
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-[11px] text-slate-500">${when}</span>
          <span class="text-slate-600">·</span>
          <button type="button" data-act="reopen" class="font-mono text-[11px] text-slate-400 hover:text-cyanaccent-400 flex items-center gap-1 transition-colors">${icon('replay', 13)}Reopen</button>
        </div>
      </div>
      <div class="flex items-center justify-between md:justify-end gap-3 flex-shrink-0">
        ${ageBadge(task)}
        <div class="bg-slate-800 border border-slate-700 px-3 py-1 rounded flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
          <span class="font-mono text-xs uppercase text-slate-300 font-semibold tracking-wider">Done</span>
        </div>
        ${actions(task, true)}
      </div>`;
  } else {
    const p = PRIORITY[priorityOf(task)];
    el.className =
      'group relative bg-obsidian-850 border border-obsidian-700/80 hover:border-obsidian-600 hover:bg-[#121a28] rounded-xl pl-5 pr-4 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer overflow-hidden transition-colors focus:outline-none focus-visible:border-techblue-500';
    el.innerHTML = `
      <div class="absolute left-0 top-0 bottom-0 w-[4px] ${p.stripe}"></div>
      <div class="flex flex-col min-w-0 flex-1 gap-1.5">
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <span class="font-semibold text-sm text-slate-100 group-hover:text-white tracking-tight break-words min-w-0">${esc(title)}</span>
          <span class="border text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${p.pill}">${priorityOf(task)}</span>
          ${duePill(task)}
          ${progressPill(task)}
          ${deptTag(task)}
        </div>
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          ${urlChip(url)}
          <div class="flex flex-wrap items-center gap-1">${natureTags(task)}</div>
          ${avatars(task)}
        </div>
      </div>
      <div class="flex items-center justify-between md:justify-end gap-3 flex-shrink-0">
        ${ageBadge(task)}
        ${statusSelect(task)}
        ${actions(task, false)}
      </div>`;
  }

  bindRow(el, task);
  return el;
}

function bindRow(el, task) {
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop], select, button, a')) return;
    openTaskModal(task.id);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === el) openTaskModal(task.id);
  });
  el.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(b.dataset.copy).then(() => toast('URL copied to clipboard'));
    })
  );
  const select = el.querySelector('[data-status]');
  if (select) {
    select.addEventListener('click', (e) => e.stopPropagation());
    select.addEventListener('change', async (e) => {
      const prev = statusOf(task);
      try {
        await updateTask(task.id, { workflow_status: e.target.value });
      } catch (err) {
        e.target.value = prev;
        toast(err.message, 'error');
      }
    });
  }
  el.querySelector('[data-act="view"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openTaskModal(task.id);
  });
  el.querySelector('[data-act="edit"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openTaskModal(task.id, { focusTitle: true });
  });
  el.querySelector('[data-act="delete"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog('Delete this task?', 'It is removed for everyone and cannot be undone.', 'Delete');
    if (!ok) return;
    try {
      await deleteTask(task.id);
      toast('Task deleted');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  // Reopening means un-ticking whoever's part needs redoing; the DB
  // trigger then moves the task back to In Progress on its own. Legacy
  // rows with nobody assigned have nothing to untick, so flip status.
  el.querySelector('[data-act="reopen"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (assigneesOf(task.id).some((a) => a.completed_at)) {
      openTaskModal(task.id, { reopen: true });
      return;
    }
    try {
      await updateTask(task.id, { workflow_status: 'in_progress' });
      toast('Task reopened');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------- kanban

function renderKanban(visible) {
  const kanban = root.querySelector('#kanban');
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, []]));
  visible.forEach((t) => byStatus[statusOf(t)]?.push(t));

  kanban.innerHTML = `
    <div class="grid grid-cols-6 gap-4 min-w-[1280px]">
      ${STATUSES.map(
        (s) => `
        <div class="bg-obsidian-850/80 border border-obsidian-700/80 rounded-xl p-3 flex flex-col gap-3 min-h-[580px]" data-col="${s}">
          <div class="flex items-center justify-between border-b border-obsidian-700/60 pb-2.5">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full ${STATUS_DOT[s]}"></span>
              <span class="font-semibold text-xs tracking-wider uppercase text-slate-200">${statusLabel(s)}</span>
            </div>
            <span class="bg-obsidian-800 border border-obsidian-700 text-slate-400 font-mono text-[11px] px-2 py-0.5 rounded">${byStatus[s].length}</span>
          </div>
          <div class="flex flex-col gap-2.5 flex-1" data-drop="${s}"></div>
        </div>`
      ).join('')}
    </div>`;

  for (const s of STATUSES) {
    const col = kanban.querySelector(`[data-drop="${s}"]`);
    // A done column with hundreds of legacy rows would bury the board.
    const cards = s === 'done' ? byStatus[s].slice(0, 40) : byStatus[s];
    cards.forEach((t) => col.appendChild(buildCard(t)));
    if (s === 'done' && byStatus[s].length > 40) {
      col.insertAdjacentHTML('beforeend', `<p class="font-mono text-[10px] text-slate-500 text-center py-2">+${byStatus[s].length - 40} older. Use List view to see all.</p>`);
    }
    bindDrop(col, s);
  }
}

function buildCard(task) {
  const el = document.createElement('div');
  const { title, url } = displayParts(task);
  const s = statusOf(task);
  el.draggable = true;
  el.dataset.card = task.id;

  if (s === 'done') {
    const info = completionInfo(task);
    el.className = 'bg-slate-900/70 border border-slate-800 p-3 rounded-lg flex flex-col gap-2 cursor-pointer opacity-75 hover:opacity-100 transition-all';
    el.innerHTML = `
      <div class="flex items-center gap-1.5 text-xs text-slate-400 line-through min-w-0">${icon('check_circle', 14, 'text-emerald-400 flex-shrink-0')}<span class="truncate">${esc(title)}</span></div>
      ${info ? `<span class="font-mono text-[9px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded self-start">BY ${esc(info.by).toUpperCase()}</span>` : ''}`;
  } else {
    const pr = priorityOf(task);
    const p = PRIORITY[pr];
    const blocked = s === 'blocked';
    el.className = `bg-obsidian-900 hover:bg-obsidian-800 border ${blocked ? 'border-red-900/50' : 'border-obsidian-700/70'} ${p.hoverBorder} border-l-4 p-3 rounded-lg flex flex-col gap-2 cursor-pointer shadow transition-all group`;
    el.style.borderLeftColor = pr === 'high' ? '#ef4444' : pr === 'low' ? '#10b981' : '#3b82f6';
    const due = task.due_date
      ? isOverdue(task)
        ? `<span class="font-mono text-[10px] text-red-400 font-medium">Overdue</span>`
        : isDueToday(task)
          ? `<span class="font-mono text-[10px] text-amber-400 font-medium">Due today</span>`
          : `<span class="font-mono text-[10px] text-slate-400">${fmtShort(task.due_date)}</span>`
      : '';
    el.innerHTML = `
      <span class="text-xs font-semibold text-slate-200 group-hover:text-white line-clamp-2">${blocked ? icon('warning', 13, 'text-red-400 mr-1 align-[-2px]') : ''}${esc(title)}</span>
      ${url ? `<span class="font-mono text-[10px] text-cyanaccent-400 truncate">${esc(splitUrl(url).rest)}</span>` : ''}
      <div class="flex flex-wrap items-center gap-1">
        <span class="border text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${p.pill}">${pr}</span>
        ${natureTags(task, 'card')}
      </div>
      <div class="flex items-center justify-between pt-1">${avatars(task) || '<span></span>'}<span class="flex items-center gap-2">${due}${ageCard(task)}</span></div>`;
  }

  el.addEventListener('click', () => openTaskModal(task.id));
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(task.id));
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  return el;
}

function bindDrop(col, status) {
  const box = col.closest('[data-col]');
  col.addEventListener('dragover', (e) => {
    e.preventDefault();
    box.classList.add('drop-target');
  });
  col.addEventListener('dragleave', (e) => {
    if (!box.contains(e.relatedTarget)) box.classList.remove('drop-target');
  });
  col.addEventListener('drop', async (e) => {
    e.preventDefault();
    box.classList.remove('drop-target');
    const id = Number(e.dataTransfer.getData('text/plain'));
    const task = state.tasks.get(id);
    if (!task || statusOf(task) === status) return;
    try {
      await updateTask(id, { workflow_status: status });
      toast(`Moved to ${statusLabel(status)}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

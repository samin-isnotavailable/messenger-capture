import {
  state,
  on,
  canSeeAll,
  isSuperAdmin,
  deptById,
  profileById,
  personLabel,
  natureOptions,
  taskTypes,
  assigneesOf,
  createTask,
  updateTask,
  setCompletion,
  addAssignees,
  removeAssignee,
} from './store.js';
import { DEPT_TAG, DEFAULT_DEPT_TAG, STATUS_DOT } from './lib/config.js';
import {
  esc,
  icon,
  initials,
  typeLabel,
  statusLabel,
  normalizeWhitespace,
  displayParts,
  splitUrl,
  BARE_URL_RE,
  friendlyLabelFromUrl,
  resolveUrlTitle,
  fmtDateTime,
  copyText,
  taskAge,
} from './lib/util.js';
import { toast } from './lib/toast.js';

// ---------------------------------------------------------------- frame

function openFrame({ title, statusHtml = '', body, footer, width = 'max-w-xl' }) {
  const prevFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-label="${esc(title)}" class="w-full ${width} bg-obsidian-850 border border-obsidian-700 rounded-xl shadow-2xl p-5 sm:p-6 flex flex-col gap-5 relative animate-modal-in my-auto">
      <div class="flex items-center justify-between gap-3 border-b border-obsidian-700/80 pb-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full bg-cyanaccent-400 shadow-[0_0_8px_rgba(34,211,238,0.7)] flex-shrink-0"></span>
          <span class="font-bold text-base text-slate-100 tracking-tight truncate">${esc(title)}</span>
          ${statusHtml}
        </div>
        <button type="button" data-close class="text-slate-400 hover:text-white p-1 rounded hover:bg-obsidian-800 transition-colors" aria-label="Close">${icon('close', 20)}</button>
      </div>
      <div data-body class="flex flex-col gap-5">${body}</div>
      <p data-error class="hidden text-xs text-red-300 bg-red-950/40 border border-red-800/60 rounded px-3 py-2"></p>
      <div class="flex items-center justify-end gap-2.5 border-t border-obsidian-700/80 pt-4">${footer}</div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const cleanups = [];
  const close = () => {
    cleanups.forEach((fn) => fn());
    overlay.remove();
    document.body.style.overflow = '';
    prevFocus?.focus?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

  const errorEl = overlay.querySelector('[data-error]');
  // An error is about what the user just tried; once they change
  // anything, it is stale.
  const clearError = () => errorEl.classList.add('hidden');
  overlay.querySelector('[data-body]').addEventListener('input', clearError);
  overlay.querySelector('[data-body]').addEventListener('change', clearError);
  return {
    el: overlay,
    close,
    onClose: (fn) => cleanups.push(fn),
    error(msg) {
      errorEl.textContent = msg;
      errorEl.classList.toggle('hidden', !msg);
      if (msg) errorEl.scrollIntoView({ block: 'nearest' });
    },
  };
}

export function confirmDialog(title, message, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    const m = openFrame({
      title,
      width: 'max-w-md',
      body: `<p class="text-sm text-slate-300">${esc(message)}</p>`,
      footer: `
        <button type="button" data-close class="btn-ghost">Cancel</button>
        <button type="button" data-ok class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium text-xs uppercase tracking-wider rounded">${esc(confirmLabel)}</button>`,
    });
    let answered = false;
    m.onClose(() => {
      if (!answered) resolve(false);
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => {
      answered = true;
      resolve(true);
      m.close();
    });
    m.el.querySelector('[data-ok]').focus();
  });
}

// ---------------------------------------------------------------- shared fields

function deptChips(name, selectedId) {
  return state.departments
    .map(
      (d) => `
      <label>
        <input type="radio" name="${name}" value="${d.id}" class="peer sr-only" ${d.id === selectedId ? 'checked' : ''} />
        <span class="chip-toggle">${icon('check', 14)}${esc(d.name)}</span>
      </label>`
    )
    .join('');
}

function natureChips(name, deptId, checked = []) {
  if (deptId == null) {
    return `<p class="text-xs text-slate-500 italic">Pick a department to see its task types.</p>`;
  }
  return natureOptions(deptId)
    .map(
      (t) => `
      <label>
        <input type="checkbox" name="${name}" value="${t}" class="peer sr-only" ${checked.includes(t) ? 'checked' : ''} />
        <span class="chip-toggle">${icon('check', 14)}${esc(typeLabel(t))}</span>
      </label>`
    )
    .join('');
}

function prioritySelect(id, value = 'medium') {
  return `
    <div class="flex flex-col gap-1.5">
      <label for="${id}" class="label-caps">Priority</label>
      <select id="${id}" class="field !text-xs !py-2">
        <option value="high" ${value === 'high' ? 'selected' : ''}>High</option>
        <option value="medium" ${value === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="low" ${value === 'low' ? 'selected' : ''}>Low</option>
      </select>
    </div>`;
}

function dueInput(id, value = '') {
  return `
    <div class="flex flex-col gap-1.5">
      <label for="${id}" class="label-caps">Due date</label>
      <input id="${id}" type="date" value="${esc(value || '')}" class="field !text-xs !py-2" />
    </div>`;
}

function avatar(name, tone = 'bg-slate-800 border-slate-600 text-slate-300', size = 'w-6 h-6 text-[10px]') {
  return `<span class="${size} rounded-full border ${tone} flex items-center justify-center font-bold flex-shrink-0">${esc(initials(name))}</span>`;
}

function deptLabelChip(deptId) {
  const d = deptById(deptId);
  if (!d) return '';
  return `<span class="border text-[9px] font-mono px-1 py-px rounded uppercase ${DEPT_TAG[d.name] || DEFAULT_DEPT_TAG}">${esc(d.name)}</span>`;
}

// People to offer, members of the chosen department first.
function peopleFor(deptId) {
  return [...state.profiles].sort((a, b) => {
    const ad = a.department_id === deptId ? 0 : 1;
    const bd = b.department_id === deptId ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return personLabel(a).localeCompare(personLabel(b));
  });
}

function peopleChips(name, deptId, checked = []) {
  const people = peopleFor(deptId);
  if (!people.length) return '<p class="text-xs text-slate-500">No team members visible to you yet.</p>';
  return people
    .map((p) => {
      const label = personLabel(p);
      const me = p.id === state.user.id ? ' <span class="text-slate-500 font-normal">(you)</span>' : '';
      return `
      <label class="min-w-0">
        <input type="checkbox" name="${name}" value="${p.id}" class="peer sr-only" ${checked.includes(p.id) ? 'checked' : ''} />
        <span class="chip-toggle !px-2 !py-2 w-full min-h-[52px] justify-start gap-2">
          ${avatar(label, 'bg-slate-800 border-slate-600 text-slate-300', 'w-6 h-6 text-[10px]')}
          <span class="flex flex-col items-start min-w-0 gap-0.5">
            <span class="truncate max-w-full">${esc(label)}${me}</span>
            ${deptLabelChip(p.department_id) || '<span class="font-mono text-[9px] text-slate-500 uppercase">No dept</span>'}
          </span>
          <span class="ms ml-auto" style="font-size:16px">check</span>
        </span>
      </label>`;
    })
    .join('');
}

const checkedValues = (root, name) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
const radioValue = (root, name) => {
  const v = root.querySelector(`input[name="${name}"]:checked`)?.value;
  return v ? Number(v) : null;
};

// ---------------------------------------------------------------- create

export function openCreateModal(prefill, defaultDeptId, onPosted) {
  // Staff land on their own department; admins/managers on the tab they
  // were looking at. From "All" or "Unsorted" nothing is preselected,
  // so the task can never end up without a department by accident.
  let deptId = defaultDeptId ?? (canSeeAll() ? null : state.user.departmentId ?? null);
  const isUrl = BARE_URL_RE.test(prefill || '');

  const m = openFrame({
    title: 'New task',
    body: `
      <div class="flex flex-col gap-1.5">
        <label for="c-title" class="label-caps">Task title / URL reference</label>
        <input id="c-title" class="field" value="${esc(prefill || '')}" placeholder="What needs doing, or paste a product link" />
        <p id="c-url-hint" class="font-mono text-[10px] text-cyanaccent-400 ${isUrl ? '' : 'hidden'}">${icon('link', 12, 'align-[-2px]')} Link detected. The page title becomes the task name when you post.</p>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="label-caps">Department <span class="text-red-400">*</span></span>
        <div class="flex flex-wrap gap-2" id="c-dept">${deptChips('c-dept', deptId)}</div>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="label-caps">Task nature <span class="text-red-400">*</span> <span class="normal-case font-normal text-slate-500">(one or more)</span></span>
        <div class="flex flex-wrap gap-2" id="c-natures">${natureChips('c-nature', deptId)}</div>
      </div>
      <div id="c-detail-wrap" class="hidden flex-col gap-1.5">
        <label for="c-detail" class="label-caps">What is the "other" work? <span class="text-red-400">*</span></label>
        <textarea id="c-detail" rows="2" class="field !text-xs resize-none" placeholder="Describe the task so nobody has to go back to the chat"></textarea>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="label-caps">Assign to <span class="text-red-400">*</span> <span class="normal-case font-normal text-slate-500">(everyone selected must finish)</span></span>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1" id="c-people">${peopleChips('c-person', deptId)}</div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${prioritySelect('c-priority')}
        ${dueInput('c-due')}
      </div>`,
    footer: `
      <button type="button" data-close class="btn-ghost !py-2 !px-4">Cancel</button>
      <button type="button" id="c-post" class="btn-primary !py-2 !px-4">${icon('send', 16)}Post task</button>`,
  });

  const el = m.el;
  const titleInput = el.querySelector('#c-title');
  titleInput.focus();
  titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);

  titleInput.addEventListener('input', () => {
    el.querySelector('#c-url-hint').classList.toggle('hidden', !BARE_URL_RE.test(titleInput.value.trim()));
  });

  const syncDetail = () => {
    const show = checkedValues(el, 'c-nature').includes('other');
    const wrap = el.querySelector('#c-detail-wrap');
    wrap.classList.toggle('hidden', !show);
    wrap.classList.toggle('flex', show);
  };
  el.querySelector('#c-natures').addEventListener('change', syncDetail);

  el.querySelector('#c-dept').addEventListener('change', () => {
    deptId = radioValue(el, 'c-dept');
    const keepNatures = checkedValues(el, 'c-nature');
    const keepPeople = checkedValues(el, 'c-person');
    el.querySelector('#c-natures').innerHTML = natureChips('c-nature', deptId, keepNatures);
    el.querySelector('#c-people').innerHTML = peopleChips('c-person', deptId, keepPeople);
    syncDetail();
  });

  const post = el.querySelector('#c-post');
  post.addEventListener('click', async () => {
    m.error('');
    const raw = titleInput.value.trim();
    const natures = checkedValues(el, 'c-nature');
    const people = checkedValues(el, 'c-person');
    const detail = normalizeWhitespace(el.querySelector('#c-detail').value);
    deptId = radioValue(el, 'c-dept');

    if (!raw) return m.error('Add a title or paste a link.');
    if (deptId == null) return m.error('Pick a department so the task lands in the right tab.');
    if (!natures.length) return m.error('Pick at least one task nature.');
    if (natures.includes('other') && !detail) return m.error('Describe the "other" work.');
    if (!people.length) return m.error('Assign the task to at least one person.');

    post.disabled = true;
    let title = normalizeWhitespace(raw);
    let sourceUrl = null;
    if (BARE_URL_RE.test(raw)) {
      sourceUrl = raw;
      post.innerHTML = `${icon('progress_activity', 16, 'animate-spin')}Fetching title`;
      title = (await resolveUrlTitle(raw)) || friendlyLabelFromUrl(raw);
    }
    post.innerHTML = `${icon('progress_activity', 16, 'animate-spin')}Posting`;

    try {
      await createTask(
        {
          task: title,
          task_types: natures,
          task_type: natures[0],
          task_detail: natures.includes('other') ? detail : null,
          priority: el.querySelector('#c-priority').value,
          due_date: el.querySelector('#c-due').value || null,
          department_id: deptId,
          source_type: 'manual',
          source_url: sourceUrl,
          workflow_status: 'assigned',
        },
        people
      );
      toast(`Posted to ${deptById(deptId)?.name || 'board'}`);
      onPosted?.();
      m.close();
    } catch (err) {
      m.error(err.message);
      if (err.partial) {
        onPosted?.();
        post.remove();
      } else {
        post.disabled = false;
        post.innerHTML = `${icon('send', 16)}Post task`;
      }
    }
  });
}

// ---------------------------------------------------------------- detail

export function openTaskModal(taskId, opts = {}) {
  const task = state.tasks.get(taskId);
  if (!task) return;
  const { title, url } = displayParts(task);
  let deptId = task.department_id ?? null;
  const status = task.workflow_status || 'inbox';
  const creator = task.user_id ? personLabel(task.user_id) : null;
  const dept = deptById(deptId);

  const m = openFrame({
    title: 'Task Detail & Fulfillment',
    width: 'max-w-2xl',
    statusHtml: `<span data-status-badge class="hidden sm:flex items-center gap-1.5 bg-obsidian-800 border border-obsidian-700 px-2 py-0.5 rounded font-mono text-[10px] uppercase text-slate-300">${statusBadgeInner(status)}</span>`,
    body: `
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <label for="d-title" class="label-caps">Task title</label>
          <span class="font-mono text-[10px] uppercase tracking-wider ${dept ? 'text-cyanaccent-400' : 'text-amber-400'}">${dept ? `${esc(dept.name)} ops` : 'No department'}</span>
        </div>
        <input id="d-title" class="field" value="${esc(title)}" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="d-url" class="label-caps">URL reference</label>
        <div class="relative flex items-center">
          <input id="d-url" class="field !pr-16 font-mono !text-xs !text-cyanaccent-400" value="${esc(url || '')}" placeholder="https://" />
          <div class="absolute right-2 flex items-center gap-1.5">
            <a id="d-open" href="${esc(url || '#')}" target="_blank" rel="noopener" class="text-slate-400 hover:text-white ${url ? '' : 'hidden'}" title="Open link" aria-label="Open link">${icon('open_in_new', 16)}</a>
            <button type="button" id="d-copy" class="text-slate-400 hover:text-white" title="Copy" aria-label="Copy link">${icon('content_copy', 16)}</button>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="label-caps">Department ${deptId == null ? '<span class="normal-case font-normal text-amber-400">pick one to move this out of Unsorted</span>' : ''}</span>
        <div class="flex flex-wrap gap-2" id="d-dept">${deptChips('d-dept', deptId)}</div>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="label-caps">Task nature <span class="normal-case font-normal text-slate-500">(one or more)</span></span>
        <div class="flex flex-wrap gap-2" id="d-natures">${natureChips('d-nature', deptId ?? state.departments[0]?.id, taskTypes(task))}</div>
      </div>
      <div id="d-detail-wrap" class="${taskTypes(task).includes('other') ? 'flex' : 'hidden'} flex-col gap-1.5">
        <label for="d-detail" class="label-caps">What is the "other" work?</label>
        <textarea id="d-detail" rows="2" class="field !text-xs resize-none">${esc(task.task_detail || '')}</textarea>
      </div>
      <div class="flex flex-col gap-2" id="d-fulfil"></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${prioritySelect('d-priority', task.priority || 'medium')}
        ${dueInput('d-due', task.due_date)}
      </div>
      <p class="font-mono text-[11px] text-slate-500">
        Assigned ${esc(fmtDateTime(task.created_at))}${creator ? ` by ${esc(creator)}` : ''}${taskAge(task.created_at) ? ` · Age ${esc(taskAge(task.created_at).label)}` : ''} · Source: ${esc(task.source_type || 'manual')}
      </p>`,
    footer: `
      <button type="button" data-close class="btn-ghost !py-2 !px-4">Close</button>
      <button type="button" id="d-save" class="btn-primary !py-2 !px-4">${icon('save', 16)}Save changes</button>`,
  });

  const el = m.el;
  if (opts.focusTitle) el.querySelector('#d-title').focus();
  if (opts.reopen) {
    const box = el.querySelector('#d-fulfil');
    box.insertAdjacentHTML(
      'beforebegin',
      `<p class="text-xs text-amber-200 bg-amber-950/40 border border-amber-700/60 rounded px-3 py-2 flex items-center gap-2">${icon('replay', 16, 'text-amber-400')}Untick the person whose part needs redoing. The task moves back to In Progress automatically.</p>`
    );
    requestAnimationFrame(() => box.scrollIntoView({ block: 'center' }));
  }

  // Legacy rows without a department still need natures to show; we
  // render Website's list until a department is actually chosen.
  const syncDetail = () => {
    const show = checkedValues(el, 'd-nature').includes('other');
    const wrap = el.querySelector('#d-detail-wrap');
    wrap.classList.toggle('hidden', !show);
    wrap.classList.toggle('flex', show);
  };
  el.querySelector('#d-natures').addEventListener('change', syncDetail);
  el.querySelector('#d-dept').addEventListener('change', () => {
    deptId = radioValue(el, 'd-dept');
    const keep = checkedValues(el, 'd-nature');
    el.querySelector('#d-natures').innerHTML = natureChips('d-nature', deptId, keep);
    syncDetail();
  });

  const urlInput = el.querySelector('#d-url');
  urlInput.addEventListener('input', () => {
    const v = urlInput.value.trim();
    const open = el.querySelector('#d-open');
    open.classList.toggle('hidden', !BARE_URL_RE.test(v));
    open.href = v || '#';
  });
  el.querySelector('#d-copy').addEventListener('click', () => {
    const v = urlInput.value.trim() || el.querySelector('#d-title').value.trim();
    copyText(v).then(() => toast('Copied to clipboard'));
  });

  // The fulfillment grid saves instantly and redraws on its own, so
  // unsaved edits in the fields above are never lost when someone
  // ticks a box (or a teammate does, via realtime).
  const renderFulfil = () => renderFulfillment(el.querySelector('#d-fulfil'), taskId, m);
  renderFulfil();
  const off = on('assignees', (id) => {
    if (id === taskId) renderFulfil();
  });
  const offTask = on('task', (id, kind) => {
    if (id !== taskId) return;
    if (kind === 'delete') {
      toast('This task was deleted.', 'error');
      m.close();
      return;
    }
    // Ticking the last person flips the task to Done in the database;
    // keep the header badge honest.
    const s = state.tasks.get(taskId)?.workflow_status || 'inbox';
    el.querySelector('[data-status-badge]').innerHTML = statusBadgeInner(s);
  });
  m.onClose(off);
  m.onClose(offTask);

  const save = el.querySelector('#d-save');
  save.addEventListener('click', async () => {
    m.error('');
    const newTitle = normalizeWhitespace(el.querySelector('#d-title').value);
    const newUrl = urlInput.value.trim();
    const natures = checkedValues(el, 'd-nature');
    const detail = normalizeWhitespace(el.querySelector('#d-detail').value);
    deptId = radioValue(el, 'd-dept');

    if (!newTitle) return m.error('Title cannot be empty.');
    if (newUrl && !BARE_URL_RE.test(newUrl)) return m.error('The URL should start with http:// or https://');
    if (deptId == null) return m.error('Pick a department.');
    if (!natures.length) return m.error('Pick at least one task nature.');
    if (natures.includes('other') && !detail) return m.error('Describe the "other" work.');

    save.disabled = true;
    try {
      await updateTask(taskId, {
        task: newTitle,
        source_url: newUrl || null,
        department_id: deptId,
        task_types: natures,
        task_type: natures[0],
        task_detail: natures.includes('other') ? detail : null,
        priority: el.querySelector('#d-priority').value,
        due_date: el.querySelector('#d-due').value || null,
      });
      const moved = deptId !== task.department_id;
      toast(moved ? `Saved and moved to ${deptById(deptId)?.name}` : 'Task saved');
      m.close();
    } catch (err) {
      m.error(err.message);
      save.disabled = false;
    }
  });
}

function statusBadgeInner(status) {
  return `<span class="w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || STATUS_DOT.inbox}"></span>${esc(statusLabel(status))}`;
}

function renderFulfillment(box, taskId, m) {
  const rows = [...assigneesOf(taskId)].sort((a, b) => personLabel(a.assigned_to).localeCompare(personLabel(b.assigned_to)));
  const done = rows.filter((r) => r.completed_at).length;
  const canRemove = canSeeAll();
  const assignedIds = new Set(rows.map((r) => r.assigned_to));
  const addable = state.profiles.filter((p) => !assignedIds.has(p.id));

  box.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="label-caps">Multi-assignee fulfillment status</span>
      <span class="text-[11px] font-mono ${rows.length && done === rows.length ? 'text-emerald-400' : 'text-slate-400'}">${done} / ${rows.length} COMPLETED</span>
    </div>
    ${
      rows.length
        ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${rows.map((r) => fulfilCard(r, canRemove)).join('')}</div>`
        : `<p class="text-xs text-amber-300/90 bg-amber-950/30 border border-amber-800/50 rounded px-3 py-2">Nobody is assigned yet. Add someone below.</p>`
    }
    ${
      addable.length
        ? `<div class="flex items-center gap-2">
             <select id="f-add" class="field !text-xs !py-1.5 flex-1">
               <option value="">Add a person…</option>
               ${addable.map((p) => `<option value="${p.id}">${esc(personLabel(p))}${p.department_id ? ` · ${esc(deptById(p.department_id)?.name || '')}` : ''}</option>`).join('')}
             </select>
             <button type="button" id="f-add-btn" class="btn-ghost !py-1.5">${icon('person_add', 15)}Add</button>
           </div>`
        : ''
    }`;

  box.querySelectorAll('[data-complete]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      cb.disabled = true;
      try {
        await setCompletion(Number(cb.dataset.complete), cb.checked);
      } catch (err) {
        cb.checked = !cb.checked;
        cb.disabled = false;
        m.error(err.message);
      }
    })
  );
  box.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await removeAssignee(Number(b.dataset.remove), taskId);
      } catch (err) {
        m.error(err.message);
      }
    })
  );
  box.querySelector('#f-add-btn')?.addEventListener('click', async () => {
    const id = box.querySelector('#f-add').value;
    if (!id) return;
    try {
      await addAssignees(taskId, [id]);
    } catch (err) {
      m.error(err.message);
    }
  });
}

function fulfilCard(r, canRemove) {
  const name = personLabel(r.assigned_to);
  const isMe = r.assigned_to === state.user.id;
  const coveredBy = r.fulfilled_by && r.fulfilled_by !== r.assigned_to ? personLabel(r.fulfilled_by) : null;
  const when = r.completed_at ? fmtDateTime(r.completed_at) : '';
  const sub = r.completed_at
    ? coveredBy
      ? `<span class="font-mono text-[9px] text-amber-300">Done by ${esc(coveredBy)} · ${esc(when)}</span>`
      : `<span class="font-mono text-[9px] text-emerald-400">Done ${esc(when)}</span>`
    : `<span class="font-mono text-[9px] text-slate-500">Pending</span>`;
  const tone = r.completed_at ? 'bg-emerald-950 border-emerald-600/60 text-emerald-200' : isMe ? 'bg-blue-950 border-blue-600 text-blue-300' : 'bg-slate-800 border-slate-600 text-slate-300';
  const role = profileById(r.assigned_to)?.role;

  return `
    <div class="flex items-center justify-between gap-2 bg-obsidian-900 p-2.5 rounded border ${r.completed_at ? 'border-emerald-900/60' : 'border-obsidian-700/80'}">
      <div class="flex items-center gap-2 min-w-0">
        ${avatar(name, tone)}
        <div class="flex flex-col min-w-0">
          <span class="text-xs font-medium text-slate-200 truncate">${esc(name)}${isMe ? ' <span class="text-slate-500">(you)</span>' : ''}${role === 'super_admin' ? ' <span class="text-blue-400/80">(Admin)</span>' : ''}</span>
          ${sub}
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <label class="flex items-center gap-1.5 cursor-pointer select-none" title="${r.completed_at ? 'Untick to reopen this part' : isMe ? 'Mark your part done' : `Mark done on behalf of ${esc(name)}`}">
          <input type="checkbox" data-complete="${r.id}" ${r.completed_at ? 'checked' : ''} class="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
          <span class="text-xs font-medium ${r.completed_at ? 'text-emerald-400' : 'text-slate-400'}">Done</span>
        </label>
        ${canRemove ? `<button type="button" data-remove="${r.id}" class="text-slate-500 hover:text-red-400 transition-colors" title="Remove ${esc(name)}" aria-label="Remove ${esc(name)}">${icon('close', 15)}</button>` : ''}
      </div>
    </div>`;
}

// Keep for linting: splitUrl is used by board.js, re-exported here for
// any future inline previews in the modal header.
export { splitUrl };

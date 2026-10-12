import { supabase } from './supabaseClient.js';
import { signOut } from './auth.js';

// Task-nature lists are department-specific (Graphics/Pre Order sets are
// still TBD). Website keeps exactly the five that already existed.
// Anything without its own entry falls back to Website's list for now —
// this only matters for the 'all'/'unsorted' tabs, since those aren't a
// single department.
const DEPT_TASK_TYPES = {
  Website: ['upload', 'seo', 'image', 'price_change', 'other'],
};
const DEFAULT_TASK_TYPES = DEPT_TASK_TYPES.Website;

const STATUSES = ['inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked'];

// In-memory state. Same principle as before: realtime events patch this
// state and patch only the affected DOM, never a full list re-render.
const tasksById = new Map();
const assigneesByTaskId = new Map(); // task_id -> array of task_assignees rows
let departments = []; // [{id, name}]
let profiles = []; // visible people, for the assignee picker
let currentUser = null;
let activeTab = null; // department_id, 'all', or 'unsorted'

// View-level filters, applied on top of the active department tab.
let hideDone = false;
let statusFilter = 'all';
let assignedToMeOnly = false;
let sourceFilter = 'all';

let listEl = null;
let modalRootEl = null;
let tasksChannel = null;
let assigneesChannel = null;

export function initDashboard(container, user) {
  currentUser = user;

  container.innerHTML = `
    <div class="dashboard">
      <header class="dashboard-header">
        <h1>Taskapture</h1>
        <div class="header-actions">
          <span class="user-email">${escapeHtml(user.email)}</span>
          <span class="user-role role-${user.role}">${user.role}</span>
          ${user.role === 'super_admin' ? '<button id="admin-btn" class="btn-secondary">Admin</button>' : ''}
          <button id="signout-btn">Sign out</button>
        </div>
      </header>

      <div id="dept-tabs" class="dept-tabs"></div>

      <div class="task-controls">
        <input id="new-task-input" type="text" placeholder="Add a task..." />
      </div>

      <div id="filter-bar" class="filter-bar"></div>

      <div id="task-list" class="task-list"></div>
    </div>
    <div id="modal-root"></div>
  `;

  listEl = container.querySelector('#task-list');
  modalRootEl = container.querySelector('#modal-root');

  container.querySelector('#signout-btn').addEventListener('click', signOut);

  const adminBtn = container.querySelector('#admin-btn');
  if (adminBtn) adminBtn.addEventListener('click', openAdminModal);

  const newTaskInput = container.querySelector('#new-task-input');
  newTaskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && newTaskInput.value.trim()) {
      openCreateModal(newTaskInput.value.trim());
      newTaskInput.value = '';
    }
  });

  bootstrap();

  return function cleanup() {
    if (tasksChannel) supabase.removeChannel(tasksChannel);
    if (assigneesChannel) supabase.removeChannel(assigneesChannel);
    tasksChannel = null;
    assigneesChannel = null;
    tasksById.clear();
    assigneesByTaskId.clear();
  };
}

async function bootstrap() {
  const [{ data: deptData }, { data: profileData }] = await Promise.all([
    supabase.from('departments').select('*').order('id'),
    supabase.from('profiles').select('id, email, username, role, department_id'),
  ]);

  departments = deptData || [];
  profiles = profileData || [];

  const canSeeAll = currentUser.role === 'super_admin' || currentUser.role === 'manager';
  activeTab = canSeeAll ? 'all' : currentUser.departmentId;

  renderDeptTabs();
  renderFilterBar();
  await loadTasks();
  subscribeRealtime();
}

function renderDeptTabs() {
  const tabsEl = document.getElementById('dept-tabs');
  const canSeeAll = currentUser.role === 'super_admin' || currentUser.role === 'manager';

  if (!canSeeAll) {
    const dept = departments.find((d) => d.id === currentUser.departmentId);
    tabsEl.innerHTML = `<span class="dept-label">${dept ? escapeHtml(dept.name) : 'No department assigned'}</span>`;
    return;
  }

  const tabs = [{ id: 'all', name: 'All' }, ...departments, { id: 'unsorted', name: 'Unsorted' }];

  tabsEl.innerHTML = tabs
    .map(
      (t) =>
        `<button class="dept-tab ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">${escapeHtml(t.name)}</button>`
    )
    .join('');

  tabsEl.querySelectorAll('.dept-tab').forEach((btn) => {
    btn.addEventListener('click', async () => {
      activeTab = isNaN(Number(btn.dataset.tab)) ? btn.dataset.tab : Number(btn.dataset.tab);
      renderDeptTabs();
      await loadTasks();
    });
  });
}

function renderFilterBar() {
  const barEl = document.getElementById('filter-bar');
  barEl.innerHTML = `
    <label class="filter-toggle">
      <input type="checkbox" id="hide-done-toggle" ${hideDone ? 'checked' : ''} />
      Hide Done
    </label>
    <label class="filter-toggle">
      <input type="checkbox" id="assigned-to-me-toggle" ${assignedToMeOnly ? 'checked' : ''} />
      Assigned to me
    </label>
    <select id="status-filter">
      <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All statuses</option>
      ${STATUSES.map(
        (s) => `<option value="${s}" ${statusFilter === s ? 'selected' : ''}>${statusLabel(s)}</option>`
      ).join('')}
    </select>
    <select id="source-filter">
      <option value="all" ${sourceFilter === 'all' ? 'selected' : ''}>All sources</option>
      <option value="manual" ${sourceFilter === 'manual' ? 'selected' : ''}>Manual</option>
      <option value="website" ${sourceFilter === 'website' ? 'selected' : ''}>Website</option>
      <option value="messenger" ${sourceFilter === 'messenger' ? 'selected' : ''}>Messenger</option>
    </select>
  `;

  barEl.querySelector('#hide-done-toggle').addEventListener('change', (e) => {
    hideDone = e.target.checked;
    renderVisibleTasks();
  });
  barEl.querySelector('#assigned-to-me-toggle').addEventListener('change', (e) => {
    assignedToMeOnly = e.target.checked;
    renderVisibleTasks();
  });
  barEl.querySelector('#status-filter').addEventListener('change', (e) => {
    statusFilter = e.target.value;
    renderVisibleTasks();
  });
  barEl.querySelector('#source-filter').addEventListener('change', (e) => {
    sourceFilter = e.target.value;
    renderVisibleTasks();
  });
}

function currentDeptFilter() {
  if (activeTab === 'all') return null;
  if (activeTab === 'unsorted') return { department_id: null };
  return { department_id: activeTab };
}

function taskTypesForActiveDept() {
  if (typeof activeTab === 'number') {
    const dept = departments.find((d) => d.id === activeTab);
    if (dept && DEPT_TASK_TYPES[dept.name]) return DEPT_TASK_TYPES[dept.name];
  }
  return DEFAULT_TASK_TYPES;
}

async function loadTasks() {
  let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });

  const filter = currentDeptFilter();
  if (filter) {
    if (filter.department_id === null) {
      query = query.is('department_id', null);
    } else {
      query = query.eq('department_id', filter.department_id);
    }
  }

  const { data: taskData, error } = await query;

  if (error) {
    console.error('Failed to load tasks:', error.message);
    listEl.innerHTML = `<p class="error">Couldn't load tasks: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const taskIds = taskData.map((t) => t.id);
  const { data: assigneeData } = taskIds.length
    ? await supabase.from('task_assignees').select('*').in('task_id', taskIds)
    : { data: [] };

  tasksById.clear();
  assigneesByTaskId.clear();
  for (const task of taskData) tasksById.set(task.id, task);
  for (const row of assigneeData || []) {
    if (!assigneesByTaskId.has(row.task_id)) assigneesByTaskId.set(row.task_id, []);
    assigneesByTaskId.get(row.task_id).push(row);
  }

  renderVisibleTasks();
}

function renderVisibleTasks() {
  listEl.innerHTML = '';
  let shown = 0;
  const ordered = Array.from(tasksById.values()).sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  for (const task of ordered) {
    if (!passesFilters(task)) continue;
    listEl.appendChild(renderTaskRow(task));
    shown += 1;
  }
  if (shown === 0) {
    listEl.innerHTML = '<p class="empty-state">No tasks here.</p>';
  }
}

function passesFilters(task) {
  if (hideDone && task.workflow_status === 'done') return false;
  if (statusFilter !== 'all' && task.workflow_status !== statusFilter) return false;
  if (sourceFilter !== 'all' && (task.source_type || 'manual') !== sourceFilter) return false;
  if (assignedToMeOnly) {
    const assignees = assigneesByTaskId.get(task.id) || [];
    if (!assignees.some((a) => a.assigned_to === currentUser.id)) return false;
  }
  return true;
}

function subscribeRealtime() {
  tasksChannel = supabase
    .channel('tasks-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, handleTaskEvent)
    .subscribe();

  assigneesChannel = supabase
    .channel('assignees-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'task_assignees' },
      handleAssigneeEvent
    )
    .subscribe();
}

function handleTaskEvent(payload) {
  if (payload.eventType === 'DELETE') {
    removeTask(payload.old.id);
    return;
  }

  const task = payload.new;
  const matchesCurrentTab = taskMatchesActiveTab(task);
  const alreadyShown = tasksById.has(task.id);

  if (!matchesCurrentTab) {
    if (alreadyShown) removeTask(task.id);
    return;
  }

  tasksById.set(task.id, task);

  if (!passesFilters(task)) {
    if (alreadyShown) {
      const row = document.getElementById(`task-${task.id}`);
      if (row) row.remove();
      if (listEl.children.length === 0) listEl.innerHTML = '<p class="empty-state">No tasks here.</p>';
    }
    return;
  }

  const emptyState = listEl.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const newRow = renderTaskRow(task);
  const existingRow = document.getElementById(`task-${task.id}`);
  if (existingRow) {
    existingRow.replaceWith(newRow);
  } else {
    listEl.prepend(newRow);
  }
}

function taskMatchesActiveTab(task) {
  if (activeTab === 'all') return true;
  if (activeTab === 'unsorted') return task.department_id === null;
  return task.department_id === activeTab;
}

async function handleAssigneeEvent(payload) {
  const taskId = payload.new?.task_id ?? payload.old?.task_id;
  if (!taskId || !tasksById.has(taskId)) return;

  const { data } = await supabase.from('task_assignees').select('*').eq('task_id', taskId);
  assigneesByTaskId.set(taskId, data || []);

  const task = tasksById.get(taskId);
  const existingRow = document.getElementById(`task-${taskId}`);
  if (task && existingRow && passesFilters(task)) {
    existingRow.replaceWith(renderTaskRow(task));
  }

  const openModalTaskId = modalRootEl.dataset.openTaskId;
  if (openModalTaskId && Number(openModalTaskId) === taskId) {
    renderDetailModal(taskId);
  }
}

function removeTask(id) {
  tasksById.delete(id);
  assigneesByTaskId.delete(id);
  const row = document.getElementById(`task-${id}`);
  if (row) row.remove();
  if (listEl.children.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No tasks here.</p>';
  }
}

// Pasted/captured text arrives with inconsistent line breaks and runs of
// spaces. This keeps intentional single line breaks (so a multi-line
// pasted message still reads naturally) but collapses everything else.
function normalizeWhitespace(str) {
  if (!str) return str;
  return str
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderTaskRow(task) {
  const row = document.createElement('div');
  row.className = `task-row ${task.workflow_status === 'done' ? 'task-done' : ''}`;
  row.id = `task-${task.id}`;

  const statusOptions = STATUSES.map(
    (s) =>
      `<option value="${s}" ${task.workflow_status === s ? 'selected' : ''}>${statusLabel(s)}</option>`
  ).join('');

  const assignees = assigneesByTaskId.get(task.id) || [];
  const completedCount = assignees.filter((a) => a.completed_at).length;

  const canDelete = currentUser.role === 'super_admin';

  row.innerHTML = `
    <div class="task-main">
      <span class="task-title">${escapeHtml(normalizeWhitespace(task.task) || '(untitled)')}</span>
      <div class="task-badges">
        ${rowTaskTypes(task)
          .map((t) => `<span class="task-type-badge">${typeLabel(t)}</span>`)
          .join('')}
      </div>
    </div>
    <div class="task-meta">
      <select class="status-select" data-id="${task.id}">
        ${statusOptions}
      </select>
      <span class="pill pill-priority priority-${task.priority || 'medium'}">${(task.priority || 'medium').toUpperCase()}</span>
      ${task.due_date ? `<span class="pill pill-due">${escapeHtml(task.due_date)}</span>` : ''}
      ${assignees.length ? `<span class="pill pill-progress">${completedCount}/${assignees.length}</span>` : ''}
      <span class="row-icons">
        ${task.source_url ? `<a class="icon-btn source-link" href="${escapeAttr(task.source_url)}" target="_blank" rel="noopener" title="Open source" aria-label="Open source">&#128279;</a>` : ''}
        ${canDelete ? `<button class="icon-btn delete-btn" title="Delete" aria-label="Delete">&#128465;</button>` : ''}
      </span>
    </div>
  `;

  row.querySelector('.status-select').addEventListener('change', (e) => {
    e.stopPropagation();
    updateStatus(task.id, e.target.value);
  });
  row.querySelector('.status-select').addEventListener('click', (e) => e.stopPropagation());

  const deleteBtn = row.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteTask(task.id);
    });
  }

  const sourceLink = row.querySelector('.source-link');
  if (sourceLink) {
    sourceLink.addEventListener('click', (e) => e.stopPropagation());
  }

  // View and Edit are the same modal (per product decision — keep it
  // simple), opened by clicking anywhere on the row except the controls
  // above (status select, source link, delete) which stop propagation.
  row.addEventListener('click', () => openDetailModal(task.id));

  return row;
}

function personLabel(profile) {
  if (!profile) return 'Unknown';
  return profile.username || profile.email || profile.id.slice(0, 8);
}

function rowTaskTypes(task) {
  if (Array.isArray(task.task_types) && task.task_types.length) return task.task_types;
  return [task.task_type || 'other'];
}

function typeLabel(type) {
  return type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusLabel(status) {
  return status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function updateStatus(id, workflow_status) {
  const { error } = await supabase.from('tasks').update({ workflow_status }).eq('id', id);
  if (error) {
    console.error('Failed to update status:', error.message);
    const known = tasksById.get(id);
    const select = document.querySelector(`.status-select[data-id="${id}"]`);
    if (select && known) select.value = known.workflow_status || 'inbox';
    alert(`Couldn't update status: ${error.message}`);
  }
}

async function handleDeleteTask(id) {
  if (!confirm('Delete this task? This cannot be undone.')) return;
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete task:', error.message);
    alert(`Couldn't delete: ${error.message}`);
  }
}

async function toggleAssigneeComplete(assigneeRowId, isComplete) {
  let assignedTo = null;
  for (const rows of assigneesByTaskId.values()) {
    const match = rows.find((r) => r.id === assigneeRowId);
    if (match) {
      assignedTo = match.assigned_to;
      break;
    }
  }

  const patch = {
    completed_at: isComplete ? new Date().toISOString() : null,
    fulfilled_by: isComplete && assignedTo && assignedTo !== currentUser.id ? currentUser.id : null,
  };

  const { error } = await supabase.from('task_assignees').update(patch).eq('id', assigneeRowId);
  if (error) {
    console.error('Failed to update assignee completion:', error.message);
    alert(`Couldn't update: ${error.message}`);
  }
}

const BARE_URL_RE = /^https?:\/\/\S+$/i;

function stripSiteSuffix(title) {
  return title.replace(/\s*[-–—|]\s*(EZ\s*Gadgets|ggezgadgets(\.com)?)\s*$/i, '').trim();
}

function friendlyLabelFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const params = u.searchParams;
    if (params.get('post_type') === 'product' && params.get('p')) {
      return `Product #${params.get('p')}`;
    }
    const lastSegment = u.pathname.split('/').filter(Boolean).pop();
    if (lastSegment) {
      return decodeURIComponent(lastSegment).replace(/[-_]+/g, ' ').trim() || u.hostname;
    }
    return u.hostname;
  } catch {
    return rawUrl;
  }
}

async function resolveUrlTitle(rawUrl) {
  try {
    const res = await fetch(`/api/resolve-title?url=${encodeURIComponent(rawUrl)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title ? stripSiteSuffix(data.title) : null;
  } catch {
    return null;
  }
}

function openCreateModal(prefillTitle) {
  const taskTypes = taskTypesForActiveDept();
  const departmentId = activeTab === 'all' || activeTab === 'unsorted' ? null : activeTab;

  modalRootEl.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>New task</h2>
        <label class="modal-field">
          <span>Title</span>
          <input id="modal-title" type="text" value="${escapeAttr(prefillTitle)}" />
        </label>
        <div class="modal-field">
          <span>Task nature <span class="required">*</span> (select one or more)</span>
          <div class="modal-assignee-list" id="modal-type-list">
            ${taskTypes
              .map(
                (t) =>
                  `<label class="assignee-checkbox"><input type="checkbox" class="modal-task-type-checkbox" value="${t}" /> ${typeLabel(t)}</label>`
              )
              .join('')}
          </div>
        </div>
        <label class="modal-field modal-field-detail" id="modal-detail-field" hidden>
          <span>Detail</span>
          <textarea id="modal-task-detail" placeholder="Optional — add context if it helps"></textarea>
        </label>
        <div class="modal-field">
          <span>Assign to <span class="required">*</span> (select at least one)</span>
          <div class="modal-assignee-list" id="modal-assignee-list">
            ${profiles
              .map(
                (p) =>
                  `<label class="assignee-checkbox"><input type="checkbox" value="${p.id}" /> ${escapeHtml(personLabel(p))}</label>`
              )
              .join('')}
          </div>
        </div>
        <div class="modal-row">
          <label class="modal-field">
            <span>Priority</span>
            <select id="modal-priority">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label class="modal-field">
            <span>Due date</span>
            <input id="modal-due" type="date" />
          </label>
        </div>
        <p class="modal-error" id="modal-error" hidden></p>
        <div class="modal-actions">
          <button class="btn-secondary" id="modal-cancel">Cancel</button>
          <button id="modal-confirm">Post task</button>
        </div>
      </div>
    </div>
  `;

  const backdrop = modalRootEl.querySelector('.modal-backdrop');
  const closeModal = () => {
    modalRootEl.innerHTML = '';
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  modalRootEl.querySelector('#modal-cancel').addEventListener('click', closeModal);

  const detailField = modalRootEl.querySelector('#modal-detail-field');
  modalRootEl.querySelectorAll('.modal-task-type-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const anyOther = Array.from(modalRootEl.querySelectorAll('.modal-task-type-checkbox:checked')).some(
        (c) => c.value === 'other'
      );
      detailField.hidden = !anyOther;
    });
  });

  modalRootEl.querySelector('#modal-confirm').addEventListener('click', async () => {
    await submitCreateModal(departmentId, closeModal);
  });
}

async function submitCreateModal(departmentId, closeModal) {
  const errorEl = modalRootEl.querySelector('#modal-error');
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };

  const titleInput = modalRootEl.querySelector('#modal-title');
  const detailInput = modalRootEl.querySelector('#modal-task-detail');
  const prioritySelect = modalRootEl.querySelector('#modal-priority');
  const dueInput = modalRootEl.querySelector('#modal-due');
  const confirmBtn = modalRootEl.querySelector('#modal-confirm');

  const rawTitle = titleInput.value.trim();
  const selectedTypes = Array.from(
    modalRootEl.querySelectorAll('.modal-task-type-checkbox:checked')
  ).map((cb) => cb.value);
  const detail = detailInput ? detailInput.value.trim() : '';
  const selectedAssigneeIds = Array.from(
    modalRootEl.querySelectorAll('#modal-assignee-list input[type="checkbox"]:checked')
  ).map((cb) => cb.value);

  if (!rawTitle) return showError('Title is required.');
  if (selectedTypes.length === 0) return showError('Select at least one task nature.');
  if (selectedAssigneeIds.length === 0) return showError('Assign to at least one person.');

  let title = normalizeWhitespace(rawTitle);
  let sourceUrl = null;

  if (BARE_URL_RE.test(rawTitle)) {
    sourceUrl = rawTitle;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Resolving…';
    const resolved = await resolveUrlTitle(rawTitle);
    title = resolved || friendlyLabelFromUrl(rawTitle);
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Post task';
  }

  const { data: newTask, error } = await supabase
    .from('tasks')
    .insert({
      task: title,
      task_types: selectedTypes,
      task_detail: detail || null,
      priority: prioritySelect.value,
      due_date: dueInput.value || null,
      department_id: departmentId,
      source_type: 'manual',
      source_url: sourceUrl,
      workflow_status: 'inbox',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to add task:', error.message);
    return showError(`Couldn't add task: ${error.message}`);
  }

  const rows = selectedAssigneeIds.map((id) => ({ task_id: newTask.id, assigned_to: id }));
  const { error: assigneeError } = await supabase.from('task_assignees').insert(rows);
  if (assigneeError) {
    console.error('Task created, but failed to assign people:', assigneeError.message);
    showError(`Task created, but couldn't assign people: ${assigneeError.message}`);
    return;
  }

  closeModal();
}

function openDetailModal(taskId) {
  modalRootEl.dataset.openTaskId = String(taskId);
  renderDetailModal(taskId);
}

function renderDetailModal(taskId) {
  const task = tasksById.get(taskId);
  if (!task) {
    modalRootEl.innerHTML = '';
    delete modalRootEl.dataset.openTaskId;
    return;
  }

  const taskTypes = taskTypesForActiveDept();
  const assignees = assigneesByTaskId.get(taskId) || [];
  const assignedAt = task.created_at ? new Date(task.created_at).toLocaleString() : 'Unknown';

  const assigneeRowsHtml = assignees
    .map((a) => {
      const person = profiles.find((p) => p.id === a.assigned_to);
      const label = personLabel(person) !== 'Unknown' ? personLabel(person) : a.assigned_to.slice(0, 8);
      const fulfilledByPerson =
        a.fulfilled_by && a.fulfilled_by !== a.assigned_to
          ? profiles.find((p) => p.id === a.fulfilled_by)
          : null;
      const fulfilledNote = fulfilledByPerson
        ? `<span class="fulfilled-note">completed by ${escapeHtml(personLabel(fulfilledByPerson))}${
            a.completed_at ? ` on ${new Date(a.completed_at).toLocaleDateString()}` : ''
          }</span>`
        : a.completed_at
          ? `<span class="fulfilled-note">completed ${new Date(a.completed_at).toLocaleDateString()}</span>`
          : '';
      return `
        <label class="assignee-row">
          <input type="checkbox" class="assignee-complete-checkbox" data-assignee-id="${a.id}" ${a.completed_at ? 'checked' : ''} />
          <span>${escapeHtml(label)}</span>
          ${fulfilledNote}
        </label>
      `;
    })
    .join('');

  modalRootEl.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Task detail</h2>
        <label class="modal-field">
          <span>Title</span>
          <input id="detail-title" type="text" value="${escapeAttr(task.task || '')}" />
        </label>
        <div class="modal-field">
          <span>Task nature (select one or more)</span>
          <div class="modal-assignee-list" id="detail-type-list">
            ${taskTypes
              .map(
                (t) =>
                  `<label class="assignee-checkbox"><input type="checkbox" class="detail-task-type-checkbox" value="${t}" ${rowTaskTypes(task).includes(t) ? 'checked' : ''} /> ${typeLabel(t)}</label>`
              )
              .join('')}
          </div>
        </div>
        <label class="modal-field modal-field-detail" id="detail-detail-field" ${rowTaskTypes(task).includes('other') ? '' : 'hidden'}>
          <span>Detail</span>
          <textarea id="detail-task-detail">${escapeHtml(task.task_detail || '')}</textarea>
        </label>
        <div class="modal-row">
          <label class="modal-field">
            <span>Priority</span>
            <select id="detail-priority">
              <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${(!task.priority || task.priority === 'medium') ? 'selected' : ''}>Medium</option>
              <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
            </select>
          </label>
          <label class="modal-field">
            <span>Due date</span>
            <input id="detail-due" type="date" value="${task.due_date || ''}" />
          </label>
        </div>
        <p class="modal-meta-line">Assigned ${escapeHtml(assignedAt)}</p>
        <div class="modal-field">
          <span>Assignees</span>
          <div class="modal-assignee-list">${assigneeRowsHtml || '<p class="empty-state">No one assigned.</p>'}</div>
        </div>
        <p class="modal-error" id="modal-error" hidden></p>
        <div class="modal-actions">
          <button class="btn-secondary" id="modal-close">Close</button>
          <button id="modal-save">Save changes</button>
        </div>
      </div>
    </div>
  `;

  const backdrop = modalRootEl.querySelector('.modal-backdrop');
  const closeModal = () => {
    modalRootEl.innerHTML = '';
    delete modalRootEl.dataset.openTaskId;
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  modalRootEl.querySelector('#modal-close').addEventListener('click', closeModal);

  const detailField = modalRootEl.querySelector('#detail-detail-field');
  modalRootEl.querySelectorAll('.detail-task-type-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const anyOther = Array.from(modalRootEl.querySelectorAll('.detail-task-type-checkbox:checked')).some(
        (c) => c.value === 'other'
      );
      detailField.hidden = !anyOther;
    });
  });

  modalRootEl.querySelectorAll('.assignee-complete-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      toggleAssigneeComplete(Number(e.target.dataset.assigneeId), e.target.checked);
    });
  });

  modalRootEl.querySelector('#modal-save').addEventListener('click', async () => {
    await submitDetailModal(taskId, closeModal);
  });
}

async function submitDetailModal(taskId, closeModal) {
  const errorEl = modalRootEl.querySelector('#modal-error');
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };

  const titleInput = modalRootEl.querySelector('#detail-title');
  const detailInput = modalRootEl.querySelector('#detail-task-detail');
  const prioritySelect = modalRootEl.querySelector('#detail-priority');
  const dueInput = modalRootEl.querySelector('#detail-due');

  const rawTitle = titleInput.value.trim();
  const selectedTypes = Array.from(
    modalRootEl.querySelectorAll('.detail-task-type-checkbox:checked')
  ).map((cb) => cb.value);
  const detail = detailInput ? detailInput.value.trim() : '';

  if (!rawTitle) return showError('Title is required.');
  if (selectedTypes.length === 0) return showError('Select at least one task nature.');

  const { error } = await supabase
    .from('tasks')
    .update({
      task: normalizeWhitespace(rawTitle),
      task_types: selectedTypes,
      task_detail: detail || null,
      priority: prioritySelect.value,
      due_date: dueInput.value || null,
    })
    .eq('id', taskId);

  if (error) {
    console.error('Failed to save task:', error.message);
    return showError(`Couldn't save: ${error.message}`);
  }

  closeModal();
}

const ROLES = ['staff', 'manager', 'super_admin'];

function openAdminModal() {
  renderAdminModal();
}

function renderAdminModal() {
  // profiles already holds every row for a super_admin (RLS lets
  // is_super_admin() see all), so no separate fetch is needed here.
  const rowsHtml = profiles
    .map((p) => {
      const deptOptions = departments
        .map(
          (d) =>
            `<option value="${d.id}" ${p.department_id === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
        )
        .join('');
      const roleOptions = ROLES.map(
        (r) => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${r}</option>`
      ).join('');
      const isSelf = p.id === currentUser.id;

      return `
        <div class="admin-row" data-profile-id="${p.id}">
          <div class="admin-row-identity">
            <span class="admin-row-username">${escapeHtml(personLabel(p))}</span>
            <span class="admin-row-email">${escapeHtml(p.email || '')}</span>
          </div>
          <input class="admin-username-input" type="text" value="${escapeAttr(p.username || '')}" placeholder="username" />
          <select class="admin-role-select" ${isSelf ? 'disabled title="Can\'t change your own role"' : ''}>
            <option value="" disabled>No role</option>
            ${roleOptions}
          </select>
          <select class="admin-dept-select">
            <option value="">No department</option>
            ${deptOptions}
          </select>
          <button class="admin-save-btn">Save</button>
          <span class="admin-row-status"></span>
        </div>
      `;
    })
    .join('');

  modalRootEl.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal modal-wide">
        <h2>Admin — people</h2>
        <p class="modal-meta-line">Edit role, department, and username. Changes save per row.</p>
        <div class="admin-list">${rowsHtml || '<p class="empty-state">No profiles found.</p>'}</div>
        <div class="modal-actions">
          <button class="btn-secondary" id="admin-close">Close</button>
        </div>
      </div>
    </div>
  `;

  const backdrop = modalRootEl.querySelector('.modal-backdrop');
  const closeModal = () => {
    modalRootEl.innerHTML = '';
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  modalRootEl.querySelector('#admin-close').addEventListener('click', closeModal);

  modalRootEl.querySelectorAll('.admin-row').forEach((row) => {
    row.querySelector('.admin-save-btn').addEventListener('click', () => {
      saveAdminRow(row);
    });
  });
}

async function saveAdminRow(row) {
  const profileId = row.dataset.profileId;
  const username = row.querySelector('.admin-username-input').value.trim();
  const roleSelect = row.querySelector('.admin-role-select');
  const role = roleSelect.disabled ? undefined : roleSelect.value;
  const departmentId = row.querySelector('.admin-dept-select').value;
  const statusEl = row.querySelector('.admin-row-status');
  const saveBtn = row.querySelector('.admin-save-btn');

  const patch = {
    username: username || null,
    department_id: departmentId ? Number(departmentId) : null,
  };
  if (role) patch.role = role;

  saveBtn.disabled = true;
  statusEl.textContent = 'Saving…';

  const { error } = await supabase.from('profiles').update(patch).eq('id', profileId);

  saveBtn.disabled = false;

  if (error) {
    console.error('Failed to update profile:', error.message);
    statusEl.textContent = `Error: ${error.message}`;
    return;
  }

  // Patch local state so the assignee picker/badges reflect this
  // immediately without waiting on a realtime event (profiles isn't
  // one of the tables we subscribe to).
  const idx = profiles.findIndex((p) => p.id === profileId);
  if (idx !== -1) {
    profiles[idx] = {
      ...profiles[idx],
      username: patch.username,
      department_id: patch.department_id,
      ...(role ? { role } : {}),
    };
  }

  statusEl.textContent = 'Saved';
  setTimeout(() => {
    if (statusEl) statusEl.textContent = '';
  }, 1500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

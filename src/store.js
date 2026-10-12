import { supabase } from './supabaseClient.js';
import { DEPT_TASK_TYPES, FALLBACK_TASK_TYPES } from './lib/config.js';
import { registerInitials } from './lib/util.js';

// Admins and managers first, then by email, so the people most often
// on screen keep the plain two-letter initials.
const ROLE_RANK = { super_admin: 0, manager: 1, staff: 2 };
function refreshInitials() {
  const ordered = [...state.profiles].sort(
    (a, b) => (ROLE_RANK[a.role] ?? 3) - (ROLE_RANK[b.role] ?? 3) || String(a.email).localeCompare(String(b.email))
  );
  registerInitials(ordered.map((p) => personLabel(p)));
}

// One shared, in-memory copy of everything the app shows. Views read
// from here and subscribe to change events; realtime and our own writes
// both patch this state, so a view only ever re-draws what changed.

export const state = {
  user: null,
  departments: [],
  profiles: [],
  tasks: new Map(), // id -> task row
  assignees: new Map(), // task_id -> task_assignees rows
  connection: 'connecting',
  activity: [], // newest first, capped
};

const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}
function emit(event, ...args) {
  listeners.get(event)?.forEach((fn) => {
    try {
      fn(...args);
    } catch (err) {
      console.error(`listener for ${event} failed`, err);
    }
  });
}

// ---------- lookups ----------

export const deptById = (id) => state.departments.find((d) => d.id === id) || null;
export const profileById = (id) => state.profiles.find((p) => p.id === id) || null;
export const canSeeAll = () => ['super_admin', 'manager'].includes(state.user?.role);
export const isSuperAdmin = () => state.user?.role === 'super_admin';

export function personLabel(idOrProfile) {
  const p = typeof idOrProfile === 'string' ? profileById(idOrProfile) : idOrProfile;
  if (!p) return typeof idOrProfile === 'string' ? idOrProfile.slice(0, 8) : 'Unknown';
  return p.username || (p.email ? p.email.split('@')[0] : p.id.slice(0, 8));
}

export function natureOptions(departmentId) {
  const dept = deptById(departmentId);
  if (!dept) return DEPT_TASK_TYPES.Website; // no department picked yet
  return DEPT_TASK_TYPES[dept.name] || FALLBACK_TASK_TYPES;
}

export function taskTypes(task) {
  if (Array.isArray(task.task_types) && task.task_types.length) return task.task_types;
  return [task.task_type || 'other'];
}

export const assigneesOf = (taskId) => state.assignees.get(taskId) || [];

// Who finished the task, for the "DONE BY" badge: whoever ticked the
// last completion (fulfilled_by when covering for someone), else the
// legacy done_by fields from the original messenger-capture rows.
export function completionInfo(task) {
  const rows = assigneesOf(task.id).filter((a) => a.completed_at);
  if (rows.length) {
    rows.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    const latest = rows[0];
    const people = [...new Set(rows.map((r) => r.fulfilled_by || r.assigned_to))];
    return { by: personLabel(latest.fulfilled_by || latest.assigned_to), extra: people.length - 1, at: latest.completed_at };
  }
  if (task.done_by) return { by: personLabel(task.done_by), extra: 0, at: null };
  if (task.done_by_email) return { by: task.done_by_email.split('@')[0], extra: 0, at: null };
  return null;
}

// ---------- loading ----------

// PostgREST caps responses (1000 rows by default), and the task table is
// already past 550 rows, so read in pages rather than trusting one call.
async function fetchAll(table, columns = '*', order = 'id') {
  const pageSize = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(order, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

export async function loadAll(user) {
  state.user = user;
  const [departments, profiles, tasks, assignees] = await Promise.all([
    fetchAll('departments'),
    fetchAll('profiles', 'id, email, username, role, department_id', 'email'),
    fetchAll('tasks'),
    fetchAll('task_assignees'),
  ]);
  state.departments = departments;
  state.profiles = profiles;
  refreshInitials();
  state.tasks = new Map(tasks.map((t) => [t.id, t]));
  state.assignees = new Map();
  for (const row of assignees) {
    if (!state.assignees.has(row.task_id)) state.assignees.set(row.task_id, []);
    state.assignees.get(row.task_id).push(row);
  }
  seedActivity();
  emit('reset');
}

// The activity stream starts with recent history derived from the data
// (creations and completions), then grows with live events.
function seedActivity() {
  const events = [];
  for (const t of state.tasks.values()) {
    if (t.created_at) events.push({ at: t.created_at, kind: 'TASK_CREATE', taskId: t.id, actor: t.user_id });
  }
  for (const rows of state.assignees.values()) {
    for (const a of rows) {
      if (a.completed_at) {
        events.push({
          at: a.completed_at,
          kind: 'TASK_FULFILL',
          taskId: a.task_id,
          actor: a.fulfilled_by || a.assigned_to,
          for: a.fulfilled_by && a.fulfilled_by !== a.assigned_to ? a.assigned_to : null,
        });
      }
    }
  }
  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  state.activity = events.slice(0, 60);
}

function pushActivity(evt) {
  state.activity.unshift({ ...evt, live: true });
  state.activity = state.activity.slice(0, 80);
  emit('activity', evt);
}

// ---------- local patching ----------

function upsertTask(row) {
  const prev = state.tasks.get(row.id);
  state.tasks.set(row.id, { ...(prev || {}), ...row });
  emit('task', row.id, prev ? 'update' : 'insert', prev);
}
function dropTask(id) {
  if (!state.tasks.has(id)) return;
  state.tasks.delete(id);
  state.assignees.delete(id);
  emit('task', id, 'delete');
}
function upsertAssignee(row) {
  const rows = state.assignees.get(row.task_id) || [];
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx === -1) rows.push(row);
  else rows[idx] = { ...rows[idx], ...row };
  state.assignees.set(row.task_id, rows);
  emit('assignees', row.task_id);
}
function dropAssignee(id, taskId) {
  for (const [tid, rows] of state.assignees) {
    if (taskId && tid !== taskId) continue;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx !== -1) {
      rows.splice(idx, 1);
      emit('assignees', tid);
      return;
    }
  }
}

// ---------- realtime ----------

let channel = null;

export function subscribe() {
  if (channel) return;
  channel = supabase
    .channel('taskapture-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id;
        if (id && state.tasks.has(id)) {
          pushActivity({ at: new Date().toISOString(), kind: 'TASK_DELETE', taskId: id, title: state.tasks.get(id)?.task });
        }
        dropTask(id);
        return;
      }
      const prev = state.tasks.get(payload.new.id);
      if (!prev) {
        pushActivity({ at: payload.new.created_at || new Date().toISOString(), kind: 'TASK_CREATE', taskId: payload.new.id, actor: payload.new.user_id });
      } else if (prev.workflow_status !== payload.new.workflow_status) {
        pushActivity({ at: new Date().toISOString(), kind: 'STATUS_CHANGE', taskId: payload.new.id, from: prev.workflow_status, to: payload.new.workflow_status });
      } else if (prev.department_id !== payload.new.department_id) {
        pushActivity({ at: new Date().toISOString(), kind: 'DEPT_MOVE', taskId: payload.new.id, to: payload.new.department_id });
      }
      upsertTask(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        dropAssignee(payload.old?.id, payload.old?.task_id);
        return;
      }
      const row = payload.new;
      const prev = assigneesOf(row.task_id).find((r) => r.id === row.id);
      if (!prev?.completed_at && row.completed_at) {
        pushActivity({
          at: row.completed_at,
          kind: 'TASK_FULFILL',
          taskId: row.task_id,
          actor: row.fulfilled_by || row.assigned_to,
          for: row.fulfilled_by && row.fulfilled_by !== row.assigned_to ? row.assigned_to : null,
        });
      } else if (prev?.completed_at && !row.completed_at) {
        pushActivity({ at: new Date().toISOString(), kind: 'REOPEN', taskId: row.task_id, actor: row.assigned_to });
      }
      upsertAssignee(row);
    })
    .subscribe((status) => {
      state.connection = status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting';
      emit('connection', state.connection);
    });
}

export function unsubscribe() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  listeners.clear();
}

// ---------- writes ----------
// Each write applies the returned row locally right away, so the UI
// does not wait on realtime (and still works if realtime drops).
// Realtime then delivers the same row, which is a harmless re-apply.

export async function createTask(fields, assigneeIds) {
  const { data, error } = await supabase.from('tasks').insert(fields).select().single();
  if (error) throw error;
  upsertTask(data);
  if (assigneeIds.length) {
    const rows = assigneeIds.map((id) => ({ task_id: data.id, assigned_to: id }));
    const { data: inserted, error: aErr } = await supabase.from('task_assignees').insert(rows).select();
    if (aErr) {
      const e = new Error(`Task created, but assigning people failed: ${aErr.message}`);
      e.partial = true;
      throw e;
    }
    inserted.forEach(upsertAssignee);
  }
  return data;
}

export async function updateTask(id, patch) {
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select();
  if (error) throw error;
  // RLS hides rows you can't update: no error, just zero rows back.
  if (!data || !data.length) throw new Error("You don't have permission to edit this task.");
  upsertTask(data[0]);
  return data[0];
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
  dropTask(id);
}

export async function setCompletion(rowId, isComplete) {
  let row = null;
  for (const rows of state.assignees.values()) {
    row = rows.find((r) => r.id === rowId);
    if (row) break;
  }
  if (!row) throw new Error('Assignee row not found.');
  const patch = {
    completed_at: isComplete ? new Date().toISOString() : null,
    fulfilled_by: isComplete && row.assigned_to !== state.user.id ? state.user.id : null,
  };
  const { data, error } = await supabase.from('task_assignees').update(patch).eq('id', rowId).select();
  if (error) throw error;
  if (!data || !data.length) throw new Error("You don't have permission to change this person's completion.");
  upsertAssignee(data[0]);
  // The DB trigger may have flipped the task to done/in_progress. Pull
  // the task row so the board reflects it even without realtime.
  const { data: task } = await supabase.from('tasks').select('*').eq('id', row.task_id).single();
  if (task) upsertTask(task);
}

export async function addAssignees(taskId, ids) {
  const rows = ids.map((id) => ({ task_id: taskId, assigned_to: id }));
  const { data, error } = await supabase.from('task_assignees').insert(rows).select();
  if (error) throw error;
  data.forEach(upsertAssignee);
}

export async function removeAssignee(rowId, taskId) {
  const { data, error } = await supabase.from('task_assignees').delete().eq('id', rowId).select();
  if (error) throw error;
  if (!data || !data.length) throw new Error('Only managers and super admins can remove an assignee.');
  dropAssignee(rowId, taskId);
}

export async function updateProfile(id, patch) {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select();
  if (error) throw error;
  if (!data || !data.length) throw new Error('Only a super admin can change profiles.');
  const idx = state.profiles.findIndex((p) => p.id === id);
  if (idx !== -1) state.profiles[idx] = { ...state.profiles[idx], ...data[0] };
  refreshInitials();
  emit('profiles', id);
  pushActivity({ at: new Date().toISOString(), kind: 'PROFILE_UPDATE', actor: state.user.id, target: id, patch });
}

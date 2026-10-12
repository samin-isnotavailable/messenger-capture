-- Fixes two permission gaps that only show up for non-admin accounts.
--
-- 1. tasks.user_id had no default and the app never set it, so every
--    task created in-app had user_id = null. The update policy only
--    allowed user_id / legacy assigned_to / super_admin, which meant
--    only a super_admin could edit, move or change the status of any
--    new task. Default it to the creating user from now on.
alter table public.tasks alter column user_id set default auth.uid();

-- 2. Editing a task (title, natures, priority, due date, status, and
--    moving it to another department) is now allowed for:
--      - super_admin and manager (all departments)
--      - the person who created it
--      - anyone assigned to it through task_assignees
--      - staff in the task's own department
--    The legacy single-column assigned_to check is kept so old rows
--    behave exactly as before. Delete stays super_admin only (0003).
drop policy if exists "tasks_update_owner_assignee_or_admin" on public.tasks;
drop policy if exists "tasks_update_scoped" on public.tasks;
create policy "tasks_update_scoped" on public.tasks
  for update using (
    public.is_super_admin()
    or public.is_manager()
    or auth.uid() = user_id
    or auth.uid() = assigned_to
    or department_id = public.my_department_id()
    or exists (
      select 1 from public.task_assignees ta
      where ta.task_id = tasks.id and ta.assigned_to = auth.uid()
    )
  );

-- 3. Completion toggles (0006) were department-scoped only, so someone
--    assigned to an Unsorted task, or to a task in another department,
--    could not tick their own row. Assignees can now always complete
--    their own row; covering for others stays department-scoped.
drop policy if exists "task_assignees_update_same_department_or_admin" on public.task_assignees;
drop policy if exists "task_assignees_update_scoped" on public.task_assignees;
create policy "task_assignees_update_scoped" on public.task_assignees
  for update using (
    public.is_super_admin()
    or public.is_manager()
    or assigned_to = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id
        and t.department_id = public.my_department_id()
    )
  )
  with check (
    public.is_super_admin()
    or public.is_manager()
    or assigned_to = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id
        and t.department_id = public.my_department_id()
    )
  );

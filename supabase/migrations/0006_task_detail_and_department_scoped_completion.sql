-- 1. Free-text detail field, required at the app level only when
--    task_type = 'other'. Nullable here since every other task_type
--    doesn't need it, and enforcing "required when other" in a check
--    constraint would need a trigger anyway — simpler to validate in
--    the client before insert, same as the existing required-fields
--    behavior on the add-task bar.
alter table public.tasks add column if not exists task_detail text;

-- 2. Tighten task_assignees completion updates (marking done, or
--    rerolling someone's completion) to same-department-or-admin/manager,
--    replacing the fully-open "any authenticated user" policy from 0004.
--    A Graphics staffer should not be able to toggle completion on a
--    Website task just because the button happens to be reachable.
drop policy if exists "task_assignees_update_authenticated" on public.task_assignees;
create policy "task_assignees_update_same_department_or_admin" on public.task_assignees
  for update using (
    public.is_super_admin()
    or public.is_manager()
    or exists (
      select 1 from public.tasks
      where tasks.id = task_assignees.task_id
        and tasks.department_id = public.my_department_id()
    )
  )
  with check (
    public.is_super_admin()
    or public.is_manager()
    or exists (
      select 1 from public.tasks
      where tasks.id = task_assignees.task_id
        and tasks.department_id = public.my_department_id()
    )
  );

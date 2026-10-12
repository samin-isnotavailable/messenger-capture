-- Fixes: "infinite recursion detected in policy for relation 'profiles'"
--
-- The 0002 policies checked admin status by running
-- `exists (select ... from public.profiles ...)` directly inside a
-- policy ON public.profiles (and inside tasks' update/delete
-- policies, which also queried profiles). That re-triggers the
-- profiles SELECT policy on every check, looping forever.
--
-- Fix: move the admin check into a `security definer` function.
-- Security definer functions run with the privileges of the function
-- owner (not the calling user), which bypasses RLS on the table it
-- queries internally — so calling it from a policy doesn't re-trigger
-- that same policy.

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- Replace the recursive profiles policy.
drop policy "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (
    auth.uid() = id or public.is_super_admin()
  );

-- Replace the recursive tasks policies.
drop policy "tasks_update_owner_assignee_or_admin" on public.tasks;
create policy "tasks_update_owner_assignee_or_admin" on public.tasks
  for update using (
    auth.uid() = user_id
    or auth.uid() = assigned_to
    or public.is_super_admin()
  );

drop policy "tasks_delete_admin_only" on public.tasks;
create policy "tasks_delete_admin_only" on public.tasks
  for delete using (public.is_super_admin());

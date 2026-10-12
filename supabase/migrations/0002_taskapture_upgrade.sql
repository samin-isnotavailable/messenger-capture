-- Adds role-based access (profiles table), the Taskapture task fields
-- (source_type, workflow_status, assigned_to), and replaces the old
-- tangled RLS policies with clean role-aware ones.
--
-- This has already been run once against the live "Messenger Ops
-- Tracker" project. Kept here as the versioned record of that change —
-- re-running it on the same database will error on the `create table
-- profiles` / `add column` statements, since they're not idempotent.
-- If you ever need to run this against a fresh project, that's fine —
-- it's written to apply cleanly to a database that only has 0001's
-- schema.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'staff' check (role in ('super_admin', 'staff')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- Seed the original admin.
insert into public.profiles (id, role)
values ('7540a37a-dd17-4a9a-9688-1a29922beacd', 'super_admin')
on conflict (id) do update set role = 'super_admin';

-- New Taskapture fields.
alter table public.tasks add column source_type text default 'manual'
  check (source_type in ('messenger', 'website', 'manual', 'customer', 'internal'));
alter table public.tasks add column workflow_status text default 'inbox'
  check (workflow_status in ('inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked'));
alter table public.tasks add column assigned_to uuid references auth.users(id);

-- Backfill existing rows into the new workflow.
update public.tasks set workflow_status = 'done' where status = 'done';
update public.tasks set workflow_status = 'inbox' where status is null or status <> 'done';

-- Drop the tangled/redundant old policies.
drop policy "allow_select_own" on public.tasks;
drop policy "allow_select" on public.tasks;
drop policy "allow_all_authenticated_select" on public.tasks;
drop policy "allow_all_authenticated_insert" on public.tasks;
drop policy "allow_update_authenticated" on public.tasks;
drop policy "allow_delete_admin_only" on public.tasks;
drop policy "Enable delete for users based on user_id" on public.tasks;

-- Clean, role-based replacements.
create policy "tasks_select_all_authenticated" on public.tasks
  for select using (auth.role() = 'authenticated');

create policy "tasks_insert_authenticated" on public.tasks
  for insert with check (auth.role() = 'authenticated');

create policy "tasks_update_owner_assignee_or_admin" on public.tasks
  for update using (
    auth.uid() = user_id
    or auth.uid() = assigned_to
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

create policy "tasks_delete_admin_only" on public.tasks
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

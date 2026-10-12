-- 1. Fixes "Assign to" showing a blank checkbox: the super_admin seed
--    row in 0002 only set id + role, leaving profiles.email null, so
--    the assignee checkbox rendered with no label text.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- 2. Auto-create (and keep updated) a profiles row whenever someone
--    signs up, so this never has to be fixed by hand again.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'staff')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 3. Multiple task natures per task. task_type (singular) stays as
--    historical data; the app now reads/writes task_types (plural).
alter table public.tasks add column if not exists task_types text[] not null default '{}';
update public.tasks
set task_types = array[task_type]
where task_type is not null and task_types = '{}';

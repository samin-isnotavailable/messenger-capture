-- Display-only usernames. Login stays email-based — this just gives
-- the assignee picker and task rows something readable to show instead
-- of raw emails like "sajid@taskapture.local".
alter table public.profiles add column if not exists username text unique;

-- Backfill: default everyone's username to the part of their email
-- before the @, so nothing's blank immediately. Edit these by hand in
-- the Supabase table editor for anything nicer.
update public.profiles
set username = split_part(email, '@', 1)
where username is null and email is not null;

-- New signups get the same default going forward.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, username)
  values (new.id, new.email, 'staff', split_part(new.email, '@', 1))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

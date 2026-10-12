-- No UPDATE policy on profiles has existed until now — editing role/
-- department in the Supabase table editor has worked because that
-- bypasses RLS as the postgres superuser. The app itself has no such
-- bypass, so the in-app admin panel needs its own policy.
create policy "profiles_update_admin_only" on public.profiles
  for update using (public.is_super_admin()) with check (public.is_super_admin());

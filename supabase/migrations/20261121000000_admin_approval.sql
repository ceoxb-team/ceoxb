-- Admin approval: admins can review applications; approving and declining
-- happen only through the approve-application Edge Function.
-- Safe to run more than once.

begin;

-- Who decided, when, and which account was created
alter table public.applications
  add column if not exists reviewed_by uuid references auth.users on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists user_id uuid references auth.users on delete set null;

-- Admins (only) can read applications. Members, applicants and visitors
-- still can't, so pending and declined applicants stay hidden.
grant select on public.applications to authenticated;

drop policy if exists "admins read applications" on public.applications;
create policy "admins read applications" on public.applications
  for select to authenticated using ((select public.is_admin()));

-- No insert/update/delete grants: changes go through Edge Functions only.

commit;

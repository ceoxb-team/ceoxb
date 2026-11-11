-- Security hardening: approved-member roles, locked-down applications,
-- private avatars. Safe to run more than once.
-- Run with the Supabase CLI or paste into SQL Editor -> New query -> Run.

begin;

-- ---------------------------------------------------------------
-- Roles: who is an approved member. Only admins (SQL editor or the
-- service role) can grant roles, so members can't promote themselves.
-- ---------------------------------------------------------------
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null default 'member'
    check (role in ('member', 'admin', 'facilitator', 'expert')),
  granted_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

drop policy if exists "members read own role" on public.user_roles;
create policy "members read own role" on public.user_roles
  for select to authenticated using ((select auth.uid()) = user_id);

-- True when the signed-in user is an approved member. Guest experts
-- are deliberately excluded: they must never see private member data.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid())
      and role in ('member', 'admin', 'facilitator')
  );
$$;

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- True when the given user is an approved member. Used so members only
-- see other members' profiles (not the empty profile every new login gets).
create or replace function public.is_member_user(target uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = target
      and role in ('member', 'admin', 'facilitator')
  );
$$;

revoke execute on function public.is_member_user(uuid) from public, anon;
grant execute on function public.is_member_user(uuid) to authenticated;

-- Everyone who already has an account is an approved member.
-- Only on the first run (empty table), so re-running this file never
-- approves accounts created later.
insert into public.user_roles (user_id, role)
select id, 'member' from auth.users
where not exists (select 1 from public.user_roles)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------
-- Profiles: only approved members can see or edit them
-- ---------------------------------------------------------------
revoke all on public.profiles from anon;
revoke delete, truncate on public.profiles from authenticated;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated
  using ((select public.is_member()) and public.is_member_user(id));

drop policy if exists "members insert own profile" on public.profiles;
create policy "members insert own profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id and (select public.is_member()));

drop policy if exists "members update own profile" on public.profiles;
create policy "members update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id and (select public.is_member()))
  with check ((select auth.uid()) = id and (select public.is_member()));

-- ---------------------------------------------------------------
-- Applications: submitted only through the submit-application
-- Edge Function (captcha + validation), never directly from the site
-- ---------------------------------------------------------------

-- Match the column names the onboarding form sends
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'applications'
               and column_name = 'full_time_employees') then
    alter table public.applications
      rename column full_time_employees to number_of_employees;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'applications'
               and column_name = 'funding_raised') then
    alter table public.applications rename column funding_raised to funding;
  end if;
end;
$$;

alter table public.applications add column if not exists linkedin_url text;

drop policy if exists "anyone can apply" on public.applications;
revoke all on public.applications from anon, authenticated;
revoke all on sequence public.applications_id_seq from anon, authenticated;

alter table public.applications
  drop constraint if exists applications_status_check,
  drop constraint if exists applications_email_format,
  drop constraint if exists applications_field_lengths;

alter table public.applications
  add constraint applications_status_check
    check (status in ('pending', 'approved', 'declined')),
  add constraint applications_email_format
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add constraint applications_field_lengths check (
    char_length(first_name) between 1 and 100
    and char_length(last_name) between 1 and 100
    and char_length(email) <= 254
    and coalesce(char_length(title), 0) <= 100
    and coalesce(char_length(phone), 0) <= 40
    and coalesce(char_length(city), 0) <= 100
    and coalesce(char_length(country), 0) <= 100
    and coalesce(char_length(invitation_code), 0) <= 100
    and coalesce(char_length(company_name), 0) <= 200
    and coalesce(char_length(company_website), 0) <= 300
    and coalesce(char_length(linkedin_url), 0) <= 300
    and coalesce(char_length(company_country), 0) <= 100
    and coalesce(char_length(industry), 0) <= 100
    and coalesce(char_length(number_of_employees), 0) <= 100
    and coalesce(char_length(funding), 0) <= 100
    and coalesce(char_length(funding_stage), 0) <= 100
  );

-- Rate limit: one application per email per day, 30 per hour overall
create or replace function public.applications_rate_limit()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(lower(new.email)));

  if exists (
    select 1 from public.applications
    where lower(email) = lower(new.email)
      and created_at > now() - interval '24 hours'
  ) then
    -- Same wording as RL002 so it doesn't reveal who has applied
    raise exception 'Too many applications right now. Please try again later.'
      using errcode = 'RL001';
  end if;

  if (select count(*) from public.applications
      where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many applications right now. Please try again later.'
      using errcode = 'RL002';
  end if;

  new.status := 'pending';
  return new;
end;
$$;

revoke execute on function public.applications_rate_limit() from public, anon, authenticated;

drop trigger if exists applications_rate_limit on public.applications;
create trigger applications_rate_limit
  before insert on public.applications
  for each row execute procedure public.applications_rate_limit();

-- ---------------------------------------------------------------
-- Profile pictures: private bucket, approved members only.
-- The site shows them through short-lived signed URLs.
-- ---------------------------------------------------------------
update storage.buckets
set public = false,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

drop policy if exists "members read avatars" on storage.objects;
create policy "members read avatars" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (select public.is_member()));

drop policy if exists "members upload own avatar" on storage.objects;
create policy "members upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_member())
  );

drop policy if exists "members update own avatar" on storage.objects;
create policy "members update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_member())
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_member())
  );

drop policy if exists "members delete own avatar" on storage.objects;
create policy "members delete own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_member())
  );

commit;

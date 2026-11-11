-- CEO XB database setup.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- ---------------------------------------------------------------
-- Profiles: one row per member, linked to their Supabase login
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  role text,
  company text,
  location text,
  about text,
  interests text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Signed-in members can see everyone's profile (member directory)
create policy "members read profiles" on public.profiles
  for select to authenticated using (true);

-- ...but can only create and edit their own
create policy "members insert own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy "members update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id);

-- Create a profile automatically when someone signs up,
-- using the name they entered on signup.html
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------
-- Applications submitted from request-access.html
-- ---------------------------------------------------------------
create table public.applications (
  id bigint generated always as identity primary key,
  first_name text not null,
  last_name text not null,
  title text,
  email text not null,
  phone text,
  city text,
  country text,
  invitation_code text,
  company_name text,
  company_website text,
  company_country text,
  industry text,
  number_of_employees text,
  funding_stage text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.applications enable row level security;

-- Anyone can submit an application. There is no select policy, so
-- nobody can read applications from the website; review them in
-- the dashboard's Table Editor.
create policy "anyone can apply" on public.applications
  for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------
-- Profile pictures (Storage bucket "avatars")
-- Each member uploads to a folder named after their user id.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

create policy "members read avatars" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy "members upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

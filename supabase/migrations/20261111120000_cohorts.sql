-- Accountability cohorts: groups of CEOs, their required meetings,
-- attendance, facilitator notes and a group chat (FR-6, FR-7).
-- Used by cohort.js and calendar.js.
--
-- Who can do what:
--   admin        create/archive cohorts, assign CEOs, schedule meetings,
--                grant the facilitator role, see every cohort
--   facilitator  for cohorts they belong to: save meeting notes and
--                record attendance
--   member       see their own cohorts, meetings, notes and chat; post
--                in the chat of an active cohort
--   expert       no access (not an approved member, see is_member())

begin;

-- ---------------------------------------------------------------
-- Role helpers. security definer so policies can call them without
-- tripping over the RLS of the tables they read.
-- ---------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.is_facilitator()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('facilitator', 'admin')
  );
$$;

-- Admins can see every role (needed to grant the facilitator role
-- from the cohort admin panel); everyone else still sees only their own.
drop policy if exists "admins read roles" on public.user_roles;
create policy "admins read roles" on public.user_roles
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "admins grant roles" on public.user_roles;
create policy "admins grant roles" on public.user_roles
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "admins change roles" on public.user_roles;
create policy "admins change roles" on public.user_roles
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant insert, update on public.user_roles to authenticated;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------
create table if not exists public.ceoxb_cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ceoxb_cohort_members (
  cohort_id uuid not null references public.ceoxb_cohorts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  added_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);

create index if not exists ceoxb_cohort_members_user_idx
  on public.ceoxb_cohort_members (user_id);

create table if not exists public.ceoxb_cohort_meetings (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.ceoxb_cohorts on delete cascade,
  title text not null default 'Monthly Meeting'
    check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  required boolean not null default true,
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists ceoxb_cohort_meetings_cohort_idx
  on public.ceoxb_cohort_meetings (cohort_id, starts_at);

create table if not exists public.ceoxb_cohort_attendance (
  meeting_id uuid not null references public.ceoxb_cohort_meetings on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  marked_by uuid default auth.uid() references auth.users on delete set null,
  marked_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

create index if not exists ceoxb_cohort_attendance_user_idx
  on public.ceoxb_cohort_attendance (user_id);

create table if not exists public.ceoxb_cohort_messages (
  id bigint generated always as identity primary key,
  cohort_id uuid not null references public.ceoxb_cohorts on delete cascade,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists ceoxb_cohort_messages_cohort_idx
  on public.ceoxb_cohort_messages (cohort_id, created_at);

alter table public.ceoxb_cohorts enable row level security;
alter table public.ceoxb_cohort_members enable row level security;
alter table public.ceoxb_cohort_meetings enable row level security;
alter table public.ceoxb_cohort_attendance enable row level security;
alter table public.ceoxb_cohort_messages enable row level security;

-- Nothing for signed-out visitors; signed-in users get only what the
-- policies below allow.
revoke all on public.ceoxb_cohorts, public.ceoxb_cohort_members,
  public.ceoxb_cohort_meetings, public.ceoxb_cohort_attendance,
  public.ceoxb_cohort_messages from anon, authenticated;
revoke all on sequence public.ceoxb_cohort_messages_id_seq from anon, authenticated;

grant select, insert, update, delete on public.ceoxb_cohorts,
  public.ceoxb_cohort_members, public.ceoxb_cohort_meetings
  to authenticated;
grant select, insert, update on public.ceoxb_cohort_attendance to authenticated;
grant select, insert on public.ceoxb_cohort_messages to authenticated;

-- ---------------------------------------------------------------
-- Cohort helpers (after the tables they read)
-- ---------------------------------------------------------------

-- True when the signed-in approved member belongs to the cohort.
create or replace function public.in_cohort(cid uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public.is_member() and exists (
    select 1 from public.ceoxb_cohort_members
    where cohort_id = cid and user_id = (select auth.uid())
  );
$$;

-- True when the signed-in user can run the cohort: an admin, or a
-- facilitator assigned to it.
create or replace function public.leads_cohort(cid uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public.is_admin()
    or (public.is_facilitator() and public.in_cohort(cid));
$$;

revoke execute on function public.is_admin(), public.is_facilitator(),
  public.in_cohort(uuid), public.leads_cohort(uuid) from public, anon;
grant execute on function public.is_admin(), public.is_facilitator(),
  public.in_cohort(uuid), public.leads_cohort(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------

-- Cohorts
drop policy if exists "members read own cohorts" on public.ceoxb_cohorts;
create policy "members read own cohorts" on public.ceoxb_cohorts
  for select to authenticated
  using ((select public.is_admin()) or public.in_cohort(id));

drop policy if exists "admins manage cohorts" on public.ceoxb_cohorts;
create policy "admins manage cohorts" on public.ceoxb_cohorts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Cohort members: you can see who is in your own cohorts
drop policy if exists "members read cohort roster" on public.ceoxb_cohort_members;
create policy "members read cohort roster" on public.ceoxb_cohort_members
  for select to authenticated
  using ((select public.is_admin()) or public.in_cohort(cohort_id));

drop policy if exists "admins manage cohort members" on public.ceoxb_cohort_members;
create policy "admins manage cohort members" on public.ceoxb_cohort_members
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and public.is_member_user(user_id));

-- Meetings (notes are changed through ceoxb_save_facilitator_notes)
drop policy if exists "members read cohort meetings" on public.ceoxb_cohort_meetings;
create policy "members read cohort meetings" on public.ceoxb_cohort_meetings
  for select to authenticated
  using ((select public.is_admin()) or public.in_cohort(cohort_id));

drop policy if exists "admins manage cohort meetings" on public.ceoxb_cohort_meetings;
create policy "admins manage cohort meetings" on public.ceoxb_cohort_meetings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Attendance: members see their own; facilitators/admins see and
-- record it for cohorts they run, only for that cohort's members.
drop policy if exists "read attendance" on public.ceoxb_cohort_attendance;
create policy "read attendance" on public.ceoxb_cohort_attendance
  for select to authenticated
  using (
    ((select auth.uid()) = user_id and (select public.is_member()))
    or exists (
      select 1 from public.ceoxb_cohort_meetings m
      where m.id = ceoxb_cohort_attendance.meeting_id
        and public.leads_cohort(m.cohort_id)
    )
  );

drop policy if exists "leads record attendance" on public.ceoxb_cohort_attendance;
create policy "leads record attendance" on public.ceoxb_cohort_attendance
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ceoxb_cohort_meetings m
      join public.ceoxb_cohort_members cm
        on cm.cohort_id = m.cohort_id
       and cm.user_id = ceoxb_cohort_attendance.user_id
      where m.id = ceoxb_cohort_attendance.meeting_id and public.leads_cohort(m.cohort_id)
    )
  );

drop policy if exists "leads update attendance" on public.ceoxb_cohort_attendance;
create policy "leads update attendance" on public.ceoxb_cohort_attendance
  for update to authenticated
  using (
    exists (
      select 1 from public.ceoxb_cohort_meetings m
      where m.id = ceoxb_cohort_attendance.meeting_id
        and public.leads_cohort(m.cohort_id)
    )
  )
  with check (
    exists (
      select 1 from public.ceoxb_cohort_meetings m
      join public.ceoxb_cohort_members cm
        on cm.cohort_id = m.cohort_id
       and cm.user_id = ceoxb_cohort_attendance.user_id
      where m.id = ceoxb_cohort_attendance.meeting_id and public.leads_cohort(m.cohort_id)
    )
  );

-- Group chat: cohort members (and admins) read; members post as
-- themselves, only while the cohort is active.
drop policy if exists "members read cohort chat" on public.ceoxb_cohort_messages;
create policy "members read cohort chat" on public.ceoxb_cohort_messages
  for select to authenticated
  using ((select public.is_admin()) or public.in_cohort(cohort_id));

drop policy if exists "members post in cohort chat" on public.ceoxb_cohort_messages;
create policy "members post in cohort chat" on public.ceoxb_cohort_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and ((select public.is_admin()) or public.in_cohort(cohort_id))
    and exists (
      select 1 from public.ceoxb_cohorts c
      where c.id = ceoxb_cohort_messages.cohort_id and not c.archived
    )
  );

-- ---------------------------------------------------------------
-- Functions called from cohort.js
-- ---------------------------------------------------------------

-- Facilitators save notes without being able to change anything
-- else about a meeting.
create or replace function public.ceoxb_save_facilitator_notes(mid uuid, note text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  cid uuid;
begin
  select cohort_id into cid from public.ceoxb_cohort_meetings where id = mid;

  if cid is null or not public.leads_cohort(cid) then
    raise exception 'You can only add notes to meetings for cohorts you facilitate.'
      using errcode = '42501';
  end if;

  update public.ceoxb_cohort_meetings
  set notes = nullif(btrim(note), '')
  where id = mid;
end;
$$;

-- Approved members with their profile names, for the admin panel menus.
create or replace function public.ceoxb_admin_member_directory()
returns table (id uuid, display_name text, role text)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list members.' using errcode = '42501';
  end if;

  return query
    select r.user_id, nullif(p.name, ''), r.role
    from public.user_roles r
    left join public.profiles p on p.id = r.user_id
    where r.role in ('member', 'admin', 'facilitator')
    order by p.name nulls last;
end;
$$;

revoke execute on function public.ceoxb_save_facilitator_notes(uuid, text),
  public.ceoxb_admin_member_directory() from public, anon;
grant execute on function public.ceoxb_save_facilitator_notes(uuid, text),
  public.ceoxb_admin_member_directory() to authenticated;

commit;

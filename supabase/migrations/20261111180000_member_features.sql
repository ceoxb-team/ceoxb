-- Move the remaining member features from browser storage into the
-- database: discussions, coffee chats, personal calendar events,
-- monthly updates, saved learning topics, and profile extras
-- (LinkedIn, time zone, featured achievements, tutorial badge).
--
-- Everything here is for approved members only (is_member()); guest
-- experts and pending applicants get nothing.

begin;

-- ---------------------------------------------------------------
-- Profile extras
-- ---------------------------------------------------------------
alter table public.profiles
  add column if not exists linkedin_url text,
  add column if not exists timezone text,
  add column if not exists show_achievements boolean not null default false,
  add column if not exists featured_achievements text[] not null default '{}',
  add column if not exists tutorial_completed boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_linkedin_url_check,
  drop constraint if exists profiles_timezone_check,
  drop constraint if exists profiles_featured_achievements_check;

alter table public.profiles
  add constraint profiles_linkedin_url_check check (
    linkedin_url is null
    or (char_length(linkedin_url) <= 300
        and linkedin_url ~* '^https://(www\.)?linkedin\.com/in/.+')
  ),
  add constraint profiles_timezone_check
    check (timezone is null or char_length(timezone) <= 64),
  add constraint profiles_featured_achievements_check
    check (cardinality(featured_achievements) <= 50);

-- ---------------------------------------------------------------
-- Discussions (FR-6 community side): every member can read and post
-- ---------------------------------------------------------------
create table if not exists public.ceoxb_discussions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid()
    references public.profiles on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  topic text not null check (char_length(topic) between 1 and 50),
  message text not null check (char_length(message) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists ceoxb_discussions_created_idx
  on public.ceoxb_discussions (created_at desc);

create table if not exists public.ceoxb_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.ceoxb_discussions on delete cascade,
  author_id uuid not null default auth.uid()
    references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists ceoxb_discussion_replies_discussion_idx
  on public.ceoxb_discussion_replies (discussion_id, created_at);

create table if not exists public.ceoxb_discussion_likes (
  discussion_id uuid not null references public.ceoxb_discussions on delete cascade,
  user_id uuid not null default auth.uid()
    references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (discussion_id, user_id)
);

-- ---------------------------------------------------------------
-- Coffee chats (FR-9): requester proposes, recipient accepts/declines
-- ---------------------------------------------------------------
create table if not exists public.ceoxb_coffee_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid()
    references public.profiles on delete cascade,
  recipient_id uuid not null references public.profiles on delete cascade,
  starts_at timestamptz not null,
  sender_timezone text check (char_length(sender_timezone) <= 64),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'sent'
    check (status in ('sent', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

create index if not exists ceoxb_coffee_requests_requester_idx
  on public.ceoxb_coffee_requests (requester_id, starts_at);
create index if not exists ceoxb_coffee_requests_recipient_idx
  on public.ceoxb_coffee_requests (recipient_id, starts_at);

-- ---------------------------------------------------------------
-- Personal calendar events: private to their owner
-- ---------------------------------------------------------------
create table if not exists public.ceoxb_personal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  description text not null default '' check (char_length(description) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists ceoxb_personal_events_user_idx
  on public.ceoxb_personal_events (user_id, starts_at);

-- ---------------------------------------------------------------
-- Monthly updates (FR-8): one per member per month. Facilitators and
-- admins can read them for members of cohorts they run.
-- ---------------------------------------------------------------
create table if not exists public.ceoxb_monthly_updates (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  win text not null check (char_length(win) between 1 and 500),
  focus text not null check (char_length(focus) between 1 and 500),
  ask text not null check (char_length(ask) between 1 and 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

-- ---------------------------------------------------------------
-- Saved learning topics: private to their owner
-- ---------------------------------------------------------------
create table if not exists public.ceoxb_saved_topics (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  topic text not null check (char_length(topic) between 1 and 200),
  saved_at timestamptz not null default now(),
  primary key (user_id, topic)
);

-- ---------------------------------------------------------------
-- Privileges: nothing for signed-out visitors
-- ---------------------------------------------------------------
alter table public.ceoxb_discussions enable row level security;
alter table public.ceoxb_discussion_replies enable row level security;
alter table public.ceoxb_discussion_likes enable row level security;
alter table public.ceoxb_coffee_requests enable row level security;
alter table public.ceoxb_personal_events enable row level security;
alter table public.ceoxb_monthly_updates enable row level security;
alter table public.ceoxb_saved_topics enable row level security;

revoke all on public.ceoxb_discussions, public.ceoxb_discussion_replies,
  public.ceoxb_discussion_likes, public.ceoxb_coffee_requests,
  public.ceoxb_personal_events, public.ceoxb_monthly_updates,
  public.ceoxb_saved_topics from anon, authenticated;

grant select, insert, delete on public.ceoxb_discussions,
  public.ceoxb_discussion_replies, public.ceoxb_discussion_likes
  to authenticated;
grant select, insert, update on public.ceoxb_coffee_requests to authenticated;
grant select, insert, delete on public.ceoxb_personal_events,
  public.ceoxb_saved_topics to authenticated;
grant select, insert, update on public.ceoxb_monthly_updates to authenticated;

-- ---------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------

-- Discussions, replies, likes
drop policy if exists "members read discussions" on public.ceoxb_discussions;
create policy "members read discussions" on public.ceoxb_discussions
  for select to authenticated using ((select public.is_member()));

drop policy if exists "members post discussions" on public.ceoxb_discussions;
create policy "members post discussions" on public.ceoxb_discussions
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_member()));

drop policy if exists "authors delete discussions" on public.ceoxb_discussions;
create policy "authors delete discussions" on public.ceoxb_discussions
  for delete to authenticated
  using ((author_id = (select auth.uid()) and (select public.is_member()))
         or (select public.is_admin()));

drop policy if exists "members read replies" on public.ceoxb_discussion_replies;
create policy "members read replies" on public.ceoxb_discussion_replies
  for select to authenticated using ((select public.is_member()));

drop policy if exists "members post replies" on public.ceoxb_discussion_replies;
create policy "members post replies" on public.ceoxb_discussion_replies
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_member()));

drop policy if exists "authors delete replies" on public.ceoxb_discussion_replies;
create policy "authors delete replies" on public.ceoxb_discussion_replies
  for delete to authenticated
  using ((author_id = (select auth.uid()) and (select public.is_member()))
         or (select public.is_admin()));

drop policy if exists "members read likes" on public.ceoxb_discussion_likes;
create policy "members read likes" on public.ceoxb_discussion_likes
  for select to authenticated using ((select public.is_member()));

drop policy if exists "members like" on public.ceoxb_discussion_likes;
create policy "members like" on public.ceoxb_discussion_likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_member()));

drop policy if exists "members unlike" on public.ceoxb_discussion_likes;
create policy "members unlike" on public.ceoxb_discussion_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Coffee chats: only the two people involved can see a request
drop policy if exists "participants read coffee chats" on public.ceoxb_coffee_requests;
create policy "participants read coffee chats" on public.ceoxb_coffee_requests
  for select to authenticated
  using ((select auth.uid()) in (requester_id, recipient_id)
         and (select public.is_member()));

drop policy if exists "members request coffee chats" on public.ceoxb_coffee_requests;
create policy "members request coffee chats" on public.ceoxb_coffee_requests
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and (select public.is_member())
    and public.is_member_user(recipient_id)
    and status = 'sent'
    and starts_at > now()
  );

drop policy if exists "participants update coffee chats" on public.ceoxb_coffee_requests;
create policy "participants update coffee chats" on public.ceoxb_coffee_requests
  for update to authenticated
  using ((select auth.uid()) in (requester_id, recipient_id)
         and (select public.is_member()))
  with check ((select auth.uid()) in (requester_id, recipient_id));

-- Who may change what on a coffee chat:
--   requester: edit time/message/recipient while it is still 'sent'
--              (must stay in the future), or cancel it
--   recipient: accept or decline a 'sent' request, or cancel an
--              accepted one; nothing else
create or replace function public.ceoxb_coffee_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  -- Dashboard / service role edits are not restricted
  if me is null then
    new.updated_at := now();
    return new;
  end if;

  if new.requester_id is distinct from old.requester_id
     or new.created_at is distinct from old.created_at then
    raise exception 'That change is not allowed.' using errcode = '42501';
  end if;

  if me = old.requester_id then
    if new.status = 'cancelled' and old.status in ('sent', 'accepted') then
      null;
    elsif new.status = 'sent' and old.status = 'sent' then
      if new.starts_at <= now() then
        raise exception 'Choose a date and time in the future.' using errcode = '22023';
      end if;
      if new.recipient_id is distinct from old.recipient_id
         and not public.is_member_user(new.recipient_id) then
        raise exception 'That member is not available.' using errcode = '42501';
      end if;
    else
      raise exception 'You can only edit or cancel your own pending requests.'
        using errcode = '42501';
    end if;
  elsif me = old.recipient_id then
    if new.recipient_id is distinct from old.recipient_id
       or new.starts_at is distinct from old.starts_at
       or new.message is distinct from old.message
       or new.sender_timezone is distinct from old.sender_timezone
       or not (
         (old.status = 'sent' and new.status in ('accepted', 'declined'))
         or (old.status = 'accepted' and new.status = 'cancelled')
       ) then
      raise exception 'You can only accept, decline, or cancel this request.'
        using errcode = '42501';
    end if;
  else
    raise exception 'That change is not allowed.' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.ceoxb_coffee_guard() from public, anon, authenticated;

drop trigger if exists ceoxb_coffee_guard on public.ceoxb_coffee_requests;
create trigger ceoxb_coffee_guard
  before update on public.ceoxb_coffee_requests
  for each row execute function public.ceoxb_coffee_guard();

-- Personal events and saved topics: owner only
drop policy if exists "owners manage personal events" on public.ceoxb_personal_events;
create policy "owners manage personal events" on public.ceoxb_personal_events
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_member()))
  with check (user_id = (select auth.uid()) and (select public.is_member()));

drop policy if exists "owners manage saved topics" on public.ceoxb_saved_topics;
create policy "owners manage saved topics" on public.ceoxb_saved_topics
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_member()))
  with check (user_id = (select auth.uid()) and (select public.is_member()));

-- Monthly updates: owner writes; owner, their cohort facilitator and
-- admins read
drop policy if exists "read monthly updates" on public.ceoxb_monthly_updates;
create policy "read monthly updates" on public.ceoxb_monthly_updates
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select public.is_member()))
    or (select public.is_admin())
    or exists (
      select 1 from public.ceoxb_cohort_members cm
      where cm.user_id = ceoxb_monthly_updates.user_id
        and public.leads_cohort(cm.cohort_id)
    )
  );

drop policy if exists "owners write monthly updates" on public.ceoxb_monthly_updates;
create policy "owners write monthly updates" on public.ceoxb_monthly_updates
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_member()));

drop policy if exists "owners edit monthly updates" on public.ceoxb_monthly_updates;
create policy "owners edit monthly updates" on public.ceoxb_monthly_updates
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_member()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- Achievement counts, computed from real activity
-- ---------------------------------------------------------------
create or replace function public.ceoxb_my_activity_counts()
returns table (coffee bigint, discussion bigint, connection bigint, learning bigint)
language sql
stable
security definer set search_path = ''
as $$
  with me as (select auth.uid() as id where public.is_member()),
  chats as (
    select case when c.requester_id = me.id then c.recipient_id
                else c.requester_id end as other
    from public.ceoxb_coffee_requests c, me
    where c.status = 'accepted'
      and me.id in (c.requester_id, c.recipient_id)
  )
  select
    (select count(*) from chats),
    (select count(*) from public.ceoxb_discussions d, me where d.author_id = me.id)
      + (select count(*) from public.ceoxb_discussion_replies r, me where r.author_id = me.id),
    (select count(distinct other) from chats),
    (select count(*) from public.ceoxb_saved_topics s, me where s.user_id = me.id)
  from me;
$$;

revoke execute on function public.ceoxb_my_activity_counts() from public, anon;
grant execute on function public.ceoxb_my_activity_counts() to authenticated;

commit;

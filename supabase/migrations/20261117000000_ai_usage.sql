-- Only counters are stored; AI prompts and drafts are not persisted here.
begin;

create table public.ceoxb_ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  usage_day date not null,
  request_count integer not null check (request_count between 1 and 10),
  last_request_at timestamptz not null,
  primary key (user_id, usage_day)
);
alter table public.ceoxb_ai_usage enable row level security;
revoke all on public.ceoxb_ai_usage from public, anon, authenticated;

create function public.consume_ai_request()
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  member_id uuid := auth.uid();
  requested_at timestamptz := clock_timestamp();
  affected integer;
begin
  if member_id is null or not public.is_member() then
    return false;
  end if;

  insert into public.ceoxb_ai_usage as usage
    (user_id, usage_day, request_count, last_request_at)
  values (member_id, (requested_at at time zone 'UTC')::date, 1, requested_at)
  on conflict (user_id, usage_day) do update
    set request_count = usage.request_count + 1,
        last_request_at = requested_at
    where usage.request_count < 10
      and usage.last_request_at <= requested_at - interval '15 seconds';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function public.consume_ai_request() from public, anon;
grant execute on function public.consume_ai_request() to authenticated;

commit;

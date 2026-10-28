-- Additive only: no existing app tables or local data are modified.
create schema if not exists lingolog_private;
revoke all on schema lingolog_private from public, anon, authenticated;

create table lingolog_private.correction_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  request_count integer not null default 0 check (request_count between 0 and 5),
  primary key (user_id, usage_day)
);
create table lingolog_private.correction_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('processing', 'completed', 'failed')),
  lease_id uuid not null,
  lease_until timestamptz not null,
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, request_hash),
  check (status <> 'completed' or response is not null)
);
create unique index correction_one_active_request on lingolog_private.correction_requests (user_id) where status = 'processing';
alter table lingolog_private.correction_daily_usage enable row level security;
alter table lingolog_private.correction_requests enable row level security;
revoke all on all tables in schema lingolog_private from public, anon, authenticated;

create function public.claim_diary_correction(p_user_id uuid, p_request_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (clock_timestamp() at time zone 'UTC')::date;
  v_request lingolog_private.correction_requests%rowtype;
  v_count integer;
  v_lease uuid := gen_random_uuid();
begin
  if p_user_id is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid correction reservation';
  end if;
  -- Cross-instance serialization per verified user; quota and reservation commit together.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  update lingolog_private.correction_requests set status = 'failed', updated_at = clock_timestamp()
    where user_id = p_user_id and status = 'processing' and lease_until <= clock_timestamp();
  select * into v_request from lingolog_private.correction_requests where user_id = p_user_id and request_hash = p_request_hash;
  if found and v_request.status = 'completed' then
    return jsonb_build_object('status', 'cached', 'response', v_request.response);
  end if;
  if exists (select 1 from lingolog_private.correction_requests where user_id = p_user_id and status = 'processing') then
    return jsonb_build_object('status', case when v_request.status = 'processing' then 'in_progress' else 'busy' end);
  end if;
  -- Existing failed/expired request retries reuse the original quota reservation.
  if v_request.user_id is null then
    insert into lingolog_private.correction_daily_usage (user_id, usage_day) values (p_user_id, v_day) on conflict do nothing;
    select request_count into v_count from lingolog_private.correction_daily_usage where user_id = p_user_id and usage_day = v_day for update;
    if v_count >= 5 then return jsonb_build_object('status', 'daily_limit'); end if;
    update lingolog_private.correction_daily_usage set request_count = request_count + 1 where user_id = p_user_id and usage_day = v_day;
    insert into lingolog_private.correction_requests (user_id, request_hash, status, lease_id, lease_until)
      values (p_user_id, p_request_hash, 'processing', v_lease, clock_timestamp() + interval '90 seconds');
  else
    update lingolog_private.correction_requests set status = 'processing', lease_id = v_lease,
      lease_until = clock_timestamp() + interval '90 seconds', updated_at = clock_timestamp()
      where user_id = p_user_id and request_hash = p_request_hash;
  end if;
  return jsonb_build_object('status', 'claimed', 'leaseId', v_lease);
end;
$$;

create function public.finish_diary_correction(p_user_id uuid, p_request_hash text, p_lease_id uuid, p_response jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_changed integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if p_response is not null and (jsonb_typeof(p_response) <> 'object' or octet_length(p_response::text) > 100000) then
    raise exception 'invalid correction response';
  end if;
  -- Lease fencing prevents an old timed-out worker from overwriting a newer retry.
  update lingolog_private.correction_requests
    set status = case when p_response is null then 'failed' else 'completed' end,
      response = p_response, updated_at = clock_timestamp()
    where user_id = p_user_id and request_hash = p_request_hash and lease_id = p_lease_id
      and status = 'processing' and lease_until > clock_timestamp();
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

revoke all on function public.claim_diary_correction(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_diary_correction(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_diary_correction(uuid, text) to service_role;
grant execute on function public.finish_diary_correction(uuid, text, uuid, jsonb) to service_role;

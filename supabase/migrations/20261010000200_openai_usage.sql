-- Additive migration: no diary, learning or review data is modified.
-- One row per actual call attempt, including unsuccessful attempts. NULL means unknown, never zero.
create table lingolog_private.correction_model_attempts (
  lease_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  model text not null check (length(model) between 1 and 120),
  status text not null default 'started' check (status in ('started', 'reported', 'unknown')),
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  total_tokens bigint check (total_tokens >= 0),
  response_id text,
  created_at timestamptz not null default clock_timestamp(),
  reported_at timestamptz,
  check ((status = 'reported' and input_tokens is not null and output_tokens is not null and total_tokens is not null)
    or (status <> 'reported' and input_tokens is null and output_tokens is null and total_tokens is null))
);
create index correction_model_user_day on lingolog_private.correction_model_attempts(user_id, created_at);
alter table lingolog_private.correction_model_attempts enable row level security;
revoke all on lingolog_private.correction_model_attempts from public, anon, authenticated;

create function public.start_diary_model_attempt(p_user_id uuid, p_request_hash text, p_lease_id uuid, p_model text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if p_model is null or length(p_model) not between 1 and 120 or not exists (
    select 1 from lingolog_private.correction_requests where user_id = p_user_id and request_hash = p_request_hash
      and lease_id = p_lease_id and status = 'processing' and lease_until > clock_timestamp()
  ) then return 'invalid'; end if;
  -- A repeated start on the same lease must never issue a second paid call.
  if exists (select 1 from lingolog_private.correction_model_attempts where lease_id = p_lease_id) then return 'invalid'; end if;
  -- Lost transport/usage/completion must be reconciled manually rather than paid for again unknowingly.
  if exists (select 1 from lingolog_private.correction_model_attempts where user_id = p_user_id and request_hash = p_request_hash
    and status in ('started', 'unknown')) then return 'uncertain'; end if;
  -- In addition to the existing 5 unique requests/day, cap actual calls (including explicit retries) at 5/day UTC.
  if (select count(*) from lingolog_private.correction_model_attempts where user_id = p_user_id
    and created_at >= date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC') >= 5 then return 'daily_limit'; end if;
  insert into lingolog_private.correction_model_attempts(lease_id, user_id, request_hash, model)
    values (p_lease_id, p_user_id, p_request_hash, p_model);
  return 'started';
end;
$$;

create function public.record_diary_model_usage(p_user_id uuid, p_lease_id uuid, p_usage jsonb, p_response_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_response_id is not null and p_response_id !~ '^resp_[a-zA-Z0-9_-]{1,200}$' then raise exception 'invalid response id'; end if;
  if p_usage is not null and (jsonb_typeof(p_usage) <> 'object' or
    not (p_usage ?& array['inputTokens', 'outputTokens', 'totalTokens']) or
    (p_usage->>'inputTokens') !~ '^[0-9]+$' or (p_usage->>'outputTokens') !~ '^[0-9]+$' or (p_usage->>'totalTokens') !~ '^[0-9]+$')
    then raise exception 'invalid usage'; end if;
  -- No current-lease check: a late worker must still report actual usage of its own fenced attempt.
  update lingolog_private.correction_model_attempts set status = case when p_usage is null then 'unknown' else 'reported' end,
    input_tokens = (p_usage->>'inputTokens')::bigint, output_tokens = (p_usage->>'outputTokens')::bigint,
    total_tokens = (p_usage->>'totalTokens')::bigint, response_id = p_response_id, reported_at = clock_timestamp()
    where user_id = p_user_id and lease_id = p_lease_id and status = 'started';
  get diagnostics v_count = row_count;
  if v_count = 1 then return true; end if;
  -- Exact repeat is idempotent; conflicting reports cannot overwrite the ledger.
  return exists (select 1 from lingolog_private.correction_model_attempts where user_id = p_user_id and lease_id = p_lease_id
    and input_tokens is not distinct from (p_usage->>'inputTokens')::bigint
    and output_tokens is not distinct from (p_usage->>'outputTokens')::bigint
    and total_tokens is not distinct from (p_usage->>'totalTokens')::bigint
    and response_id is not distinct from p_response_id and status <> 'started');
end;
$$;
revoke all on function public.start_diary_model_attempt(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.record_diary_model_usage(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.start_diary_model_attempt(uuid, text, uuid, text) to service_role;
grant execute on function public.record_diary_model_usage(uuid, uuid, jsonb, text) to service_role;

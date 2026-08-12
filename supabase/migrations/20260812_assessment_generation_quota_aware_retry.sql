begin;

alter table public.assessment_generation_items
  add column if not exists retry_after_at timestamptz,
  add column if not exists author_checkpoint jsonb;

alter table public.assessment_generation_items
  drop constraint if exists assessment_generation_items_author_checkpoint_check;

alter table public.assessment_generation_items
  add constraint assessment_generation_items_author_checkpoint_check
  check (author_checkpoint is null or jsonb_typeof(author_checkpoint) = 'object');

alter table public.assessment_generation_items
  drop constraint if exists assessment_generation_items_transport_retry_count_check;

alter table public.assessment_generation_items
  add constraint assessment_generation_items_transport_retry_count_check
  check (transport_retry_count between 0 and 100);

create or replace function public.claim_assessment_generation_item(
  p_item_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 90
)
returns setof public.assessment_generation_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.assessment_generation_items%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if nullif(btrim(p_worker_id), '') is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception using errcode = '22023', message = 'INVALID_WORKER_LEASE';
  end if;

  select item.* into v_row
  from public.assessment_generation_items item
  join public.assessment_generation_runs run on run.id = item.run_id
  where item.id = p_item_id
    and item.status in ('queued', 'retry_pending')
    and (item.retry_after_at is null or item.retry_after_at <= now())
    and item.attempt_count < item.max_attempts
    and run.status not in ('completed', 'cancelled', 'superseded')
  for update of item skip locked;

  if not found then return; end if;

  update public.assessment_generation_items
  set status = 'grounding',
      attempt_count = attempt_count + 1,
      worker_id = p_worker_id,
      lease_token = v_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(),
      started_at = coalesce(started_at, now()),
      completed_at = null,
      error_code = null,
      error_message = null,
      retry_after_at = null
  where id = p_item_id
  returning * into v_row;

  return next v_row;
end;
$$;

create or replace function public.complete_assessment_generation_item(
  p_item_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_generation_epoch integer,
  p_contract_hash text,
  p_result jsonb,
  p_evidence_anchor jsonb,
  p_stage_timings jsonb,
  p_token_usage jsonb,
  p_request_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_result is null or p_evidence_anchor is null or p_stage_timings is null or p_token_usage is null
    or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(p_evidence_anchor) <> 'object'
    or jsonb_typeof(p_stage_timings) <> 'object' or jsonb_typeof(p_token_usage) <> 'object'
    or lower(p_contract_hash) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_ITEM_RESULT';
  end if;

  update public.assessment_generation_items item
  set status = 'ready',
      result = p_result,
      evidence_anchor = p_evidence_anchor,
      stage_timings = p_stage_timings,
      token_usage = p_token_usage,
      request_id = nullif(btrim(p_request_id), ''),
      error_code = null,
      error_message = null,
      retry_after_at = null,
      author_checkpoint = null,
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = now(),
      completed_at = now()
  from public.assessment_generation_runs run
  where item.id = p_item_id
    and run.id = item.run_id
    and item.status = 'validating'
    and item.worker_id = p_worker_id
    and item.lease_token = p_lease_token
    and item.lease_expires_at > now()
    and item.generation_epoch = p_generation_epoch
    and item.contract_hash = lower(p_contract_hash)
    and run.generation_epoch = p_generation_epoch
    and run.plan_hash = item.plan_hash
    and run.status not in ('completed', 'cancelled', 'superseded');

  if not found then return false; end if;
  return true;
end;
$$;

create or replace function public.fail_assessment_generation_item(
  p_item_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retry_class text default 'none',
  p_retry_after_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.assessment_generation_items%rowtype;
  v_status text;
  v_retry_after integer;
begin
  if p_retry_class not in ('none', 'transport_once', 'transport_backoff', 'content_once') then
    raise exception using errcode = '22023', message = 'INVALID_RETRY_CLASS';
  end if;

  select * into v_row
  from public.assessment_generation_items
  where id = p_item_id
    and worker_id = p_worker_id
    and lease_token = p_lease_token
    and lease_expires_at > now()
    and status in ('grounding', 'generating', 'normalizing', 'validating')
  for update;
  if not found then return 'stale'; end if;

  if p_retry_class in ('transport_once', 'transport_backoff') then
    v_status := 'retry_pending';
    v_retry_after := greatest(5, least(coalesce(p_retry_after_seconds, 60), 86400));
  elsif p_retry_class = 'content_once' and v_row.attempt_count < v_row.max_attempts and v_row.content_retry_count < 1 then
    v_status := 'retry_pending';
    v_retry_after := null;
  else
    v_status := 'failed';
    v_retry_after := null;
  end if;

  update public.assessment_generation_items
  set status = v_status,
      attempt_count = case
        when p_retry_class in ('transport_once', 'transport_backoff') then greatest(attempt_count - 1, 0)
        else attempt_count
      end,
      transport_retry_count = least(100, transport_retry_count + case when p_retry_class in ('transport_once', 'transport_backoff') then 1 else 0 end),
      content_retry_count = content_retry_count + case when v_status = 'retry_pending' and p_retry_class = 'content_once' then 1 else 0 end,
      retry_after_at = case when v_status = 'retry_pending' and p_retry_class in ('transport_once', 'transport_backoff') then now() + make_interval(secs => v_retry_after) else null end,
      author_checkpoint = case when p_retry_class = 'content_once' or v_status = 'failed' then null else author_checkpoint end,
      error_code = left(coalesce(p_error_code, 'INTERNAL_ERROR'), 120),
      error_message = left(coalesce(p_error_message, 'تعذر توليد المفردة.'), 800),
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = now(),
      completed_at = case when v_status = 'failed' then now() else null end
  where id = p_item_id;

  return v_status;
end;
$$;

create or replace function public.checkpoint_assessment_generation_author(
  p_item_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_checkpoint jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_checkpoint is null or jsonb_typeof(p_checkpoint) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_AUTHOR_CHECKPOINT';
  end if;
  update public.assessment_generation_items
  set author_checkpoint = p_checkpoint,
      heartbeat_at = now()
  where id = p_item_id
    and worker_id = p_worker_id
    and lease_token = p_lease_token
    and lease_expires_at > now()
    and status in ('generating', 'normalizing', 'validating');
  return found;
end;
$$;

create or replace function public.retry_assessment_generation_item(
  p_owner_id uuid,
  p_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
begin
  update public.assessment_generation_items
  set status = 'retry_pending',
      attempt_count = 0,
      transport_retry_count = 0,
      content_retry_count = 0,
      retry_after_at = null,
      author_checkpoint = null,
      error_code = null,
      error_message = null,
      stage_timings = '{"groundingMs":0,"modelMs":0,"normalizationMs":0,"validationMs":0,"totalMs":0}'::jsonb,
      token_usage = '{}'::jsonb,
      request_id = null,
      completed_at = null,
      started_at = null,
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = null
  where id = p_item_id
    and owner_id = p_owner_id
    and status = 'failed'
  returning run_id into v_run_id;

  if v_run_id is null then
    raise exception using errcode = '22023', message = 'ITEM_NOT_RETRYABLE';
  end if;
  return v_run_id;
end;
$$;

create or replace function public.resume_assessment_generation_run(
  p_owner_id uuid,
  p_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft_id text;
begin
  select draft_id into v_draft_id
  from public.assessment_generation_runs
  where id = p_run_id and owner_id = p_owner_id and status not in ('completed', 'cancelled', 'superseded')
  for update;
  if not found then return false; end if;

  perform public.recover_stale_assessment_generation_items(p_owner_id, v_draft_id);

  update public.assessment_generation_items
  set status = 'retry_pending',
      attempt_count = 0,
      transport_retry_count = 0,
      content_retry_count = 0,
      retry_after_at = null,
      author_checkpoint = null,
      error_code = null,
      error_message = null,
      stage_timings = '{"groundingMs":0,"modelMs":0,"normalizationMs":0,"validationMs":0,"totalMs":0}'::jsonb,
      token_usage = '{}'::jsonb,
      request_id = null,
      completed_at = null,
      started_at = null,
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = null
  where run_id = p_run_id
    and status = 'failed';

  perform public.refresh_assessment_generation_run(p_run_id);
  return true;
end;
$$;

alter table public.assessment_generation_runs enable row level security;
alter table public.assessment_generation_runs force row level security;
alter table public.assessment_generation_items enable row level security;
alter table public.assessment_generation_items force row level security;

revoke all on table public.assessment_generation_runs from public, anon, authenticated;
revoke all on table public.assessment_generation_items from public, anon, authenticated;
grant all on table public.assessment_generation_runs to service_role;
grant all on table public.assessment_generation_items to service_role;

revoke all on function public.fail_assessment_generation_item(uuid, text, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.checkpoint_assessment_generation_author(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fail_assessment_generation_item(uuid, text, uuid, text, text, text, integer) to service_role;
grant execute on function public.checkpoint_assessment_generation_author(uuid, text, uuid, jsonb) to service_role;

commit;

select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='assessment_generation_items'
  and column_name in ('retry_after_at','author_checkpoint')
order by column_name;

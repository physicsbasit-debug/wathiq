begin;

alter table public.assessment_generation_items
  drop constraint if exists assessment_generation_items_transport_retry_count_check;

alter table public.assessment_generation_items
  add constraint assessment_generation_items_transport_retry_count_check
  check (transport_retry_count between 0 and 2);

create or replace function public.fail_assessment_generation_item(
  p_item_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retry_class text default 'none'
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.assessment_generation_items%rowtype;
  v_status text;
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

  v_status := case
    when v_row.attempt_count >= v_row.max_attempts then 'failed'
    when p_retry_class in ('transport_once', 'transport_backoff') and v_row.transport_retry_count < 2 then 'retry_pending'
    when p_retry_class = 'content_once' and v_row.content_retry_count < 1 then 'retry_pending'
    else 'failed'
  end;

  update public.assessment_generation_items
  set status = v_status,
      transport_retry_count = transport_retry_count + case when v_status = 'retry_pending' and p_retry_class in ('transport_once', 'transport_backoff') then 1 else 0 end,
      content_retry_count = content_retry_count + case when v_status = 'retry_pending' and p_retry_class = 'content_once' then 1 else 0 end,
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

commit;

select
  pg_get_constraintdef(c.oid) as transport_retry_constraint
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'assessment_generation_items'
  and c.conname = 'assessment_generation_items_transport_retry_count_check';

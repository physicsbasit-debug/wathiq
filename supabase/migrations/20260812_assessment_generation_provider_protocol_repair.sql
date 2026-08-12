begin;

-- v0.3.11: eliminate PostgREST overload ambiguity left by v0.3.9/v0.3.10.
drop function if exists public.fail_assessment_generation_item(uuid, text, uuid, text, text, text);
drop function if exists public.fail_assessment_generation_item(uuid, text, uuid, text, text, text, integer);

create function public.fail_assessment_generation_item(
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
  if p_retry_class not in ('none', 'transport_backoff', 'content_once') then
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

  if p_retry_class = 'transport_backoff' then
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
      attempt_count = case when p_retry_class = 'transport_backoff' then greatest(attempt_count - 1, 0) else attempt_count end,
      transport_retry_count = least(100, transport_retry_count + case when p_retry_class = 'transport_backoff' then 1 else 0 end),
      content_retry_count = content_retry_count + case when v_status = 'retry_pending' and p_retry_class = 'content_once' then 1 else 0 end,
      retry_after_at = case when v_status = 'retry_pending' and p_retry_class = 'transport_backoff' then now() + make_interval(secs => v_retry_after) else null end,
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

revoke all on function public.fail_assessment_generation_item(uuid, text, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.fail_assessment_generation_item(uuid, text, uuid, text, text, text, integer) to service_role;

-- Repair only active/nonterminal runs where old overload incorrectly finalized a transient provider error.
update public.assessment_generation_items item
set status = 'retry_pending',
    attempt_count = 0,
    transport_retry_count = 0,
    retry_after_at = now() + interval '15 seconds',
    error_message = 'أُعيدت المهمة إلى الطابور بعد إصلاح عقد استرداد ضغط Gemini في v0.3.11.',
    completed_at = null,
    worker_id = null,
    lease_token = null,
    lease_expires_at = null,
    heartbeat_at = null
from public.assessment_generation_runs run
where run.id = item.run_id
  and run.status not in ('completed', 'cancelled', 'superseded')
  and item.status = 'failed'
  and item.error_code in ('MODEL_RATE_LIMITED','MODEL_QUOTA_EXHAUSTED','MODEL_UNAVAILABLE','MODEL_TIMEOUT');

-- Force PostgREST to forget the removed overload before the Edge Function calls rpc().
notify pgrst, 'reload schema';

commit;

-- Verification: exactly one canonical fail RPC must remain.
select
  count(*) as canonical_fail_rpc_count,
  string_agg(pg_get_function_identity_arguments(p.oid), ' | ' order by pg_get_function_identity_arguments(p.oid)) as signatures
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fail_assessment_generation_item';

select status, error_code, count(*) as item_count
from public.assessment_generation_items
where error_code is not null
group by status, error_code
order by status, error_code;

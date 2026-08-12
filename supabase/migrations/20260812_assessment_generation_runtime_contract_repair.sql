begin;

-- v0.3.12 — Runtime Contract Repair
-- فصل ضغط المزود عن فشل المحتوى نهائيًا، وتثبيت استرداد المهام المتوقفة بعقد واحد يمكن فحصه قبل التوليد.

-- أزل RPC العامة القديمة التي كانت تجمع مسارين متباينين في دالة واحدة.
drop function if exists public.fail_assessment_generation_item(uuid, text, uuid, text, text, text);
drop function if exists public.fail_assessment_generation_item(uuid, text, uuid, text, text, text, integer);

create or replace function public.defer_assessment_generation_item_v1(
  p_item_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retry_after_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_retry_after integer;
begin
  if p_error_code not in ('MODEL_RATE_LIMITED','MODEL_QUOTA_EXHAUSTED','MODEL_UNAVAILABLE','MODEL_TIMEOUT') then
    raise exception using errcode = '22023', message = 'INVALID_TRANSPORT_ERROR_CODE';
  end if;

  v_retry_after := greatest(5, least(coalesce(p_retry_after_seconds, 60), 86400));

  update public.assessment_generation_items
  set status = 'retry_pending',
      attempt_count = greatest(attempt_count - 1, 0),
      transport_retry_count = least(100, transport_retry_count + 1),
      retry_after_at = now() + make_interval(secs => v_retry_after),
      error_code = left(p_error_code, 120),
      error_message = left(coalesce(p_error_message, 'ضغط مؤقت في مزود التوليد.'), 800),
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = now(),
      completed_at = null
  where id = p_item_id
    and worker_id = p_worker_id
    and lease_token = p_lease_token
    and lease_expires_at > now()
    and status in ('grounding','generating','normalizing','validating');

  if not found then return 'stale'; end if;
  return 'retry_pending';
end;
$$;

create or replace function public.fail_assessment_generation_content_v1(
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
  if p_retry_class not in ('none','content_once') then
    raise exception using errcode = '22023', message = 'INVALID_CONTENT_RETRY_CLASS';
  end if;

  select * into v_row
  from public.assessment_generation_items
  where id = p_item_id
    and worker_id = p_worker_id
    and lease_token = p_lease_token
    and lease_expires_at > now()
    and status in ('grounding','generating','normalizing','validating')
  for update;
  if not found then return 'stale'; end if;

  if p_retry_class = 'content_once'
     and v_row.attempt_count < v_row.max_attempts
     and v_row.content_retry_count < 1 then
    v_status := 'retry_pending';
  else
    v_status := 'failed';
  end if;

  update public.assessment_generation_items
  set status = v_status,
      content_retry_count = content_retry_count + case when v_status = 'retry_pending' and p_retry_class = 'content_once' then 1 else 0 end,
      retry_after_at = null,
      author_checkpoint = null,
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

create or replace function public.recover_stale_assessment_generation_items_v1(
  p_owner_id uuid,
  p_draft_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with recovered as (
    update public.assessment_generation_items item
    set status = case when item.transport_retry_count < 10 then 'retry_pending' else 'failed' end,
        attempt_count = case when item.transport_retry_count < 10 then greatest(item.attempt_count - 1, 0) else item.attempt_count end,
        transport_retry_count = least(100, item.transport_retry_count + 1),
        retry_after_at = case when item.transport_retry_count < 10 then now() + interval '60 seconds' else null end,
        error_code = case when item.transport_retry_count < 10 then 'WORKER_STALE_RECOVERED' else 'WORKER_STABILITY_FAILURE' end,
        error_message = case
          when item.transport_retry_count < 10 then 'انقطع عامل التوليد أو انتهت مهلة تشغيله؛ أعاد واثق المهمة إلى الطابور دون استهلاك محاولة محتوى.'
          else 'تكرر انقطاع عامل التوليد عشر مرات؛ أوقف واثق المهمة لحماية الدورة من حلقة استرداد لا نهائية.'
        end,
        worker_id = null,
        lease_token = null,
        lease_expires_at = null,
        heartbeat_at = now(),
        completed_at = case when item.transport_retry_count < 10 then null else now() end
    from public.assessment_generation_runs run
    where item.run_id = run.id
      and item.owner_id = p_owner_id
      and (p_draft_id is null or item.draft_id = p_draft_id)
      and item.status in ('grounding','generating','normalizing','validating')
      and item.lease_expires_at <= now()
      and run.status not in ('completed','cancelled','superseded')
    returning item.id
  )
  select count(*) into v_count from recovered;
  return v_count;
end;
$$;

-- غلاف آمن للتوافق مع أي Job قديم ما زال منشورًا أثناء الترقية.
create or replace function public.recover_stale_assessment_generation_items(
  p_owner_id uuid,
  p_draft_id text default null
)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.recover_stale_assessment_generation_items_v1(p_owner_id, p_draft_id);
$$;

create or replace function public.assessment_generation_runtime_contract_v1()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'version', 1,
    'transportDefer', to_regprocedure('public.defer_assessment_generation_item_v1(uuid,text,uuid,text,text,integer)') is not null,
    'contentFail', to_regprocedure('public.fail_assessment_generation_content_v1(uuid,text,uuid,text,text,text)') is not null,
    'staleRecovery', to_regprocedure('public.recover_stale_assessment_generation_items_v1(uuid,text)') is not null,
    'legacyFailRpcCount', (
      select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='fail_assessment_generation_item'
    )
  );
$$;

-- أصلح أي مفردات علقت كـ failed بسبب عقد الاسترداد القديم، مع إبقاء المفردات المكتملة دون مساس.
update public.assessment_generation_items item
set status = 'retry_pending',
    attempt_count = 0,
    transport_retry_count = 0,
    retry_after_at = now() + interval '15 seconds',
    error_message = 'أُعيدت المهمة إلى الطابور بعد إصلاح عقد ضغط Gemini في v0.3.12.',
    completed_at = null,
    worker_id = null,
    lease_token = null,
    lease_expires_at = null,
    heartbeat_at = null
from public.assessment_generation_runs run
where run.id = item.run_id
  and run.status not in ('completed','cancelled','superseded')
  and item.status = 'failed'
  and item.error_code in ('MODEL_RATE_LIMITED','MODEL_QUOTA_EXHAUSTED','MODEL_UNAVAILABLE','MODEL_TIMEOUT');

revoke all on function public.defer_assessment_generation_item_v1(uuid,text,uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.fail_assessment_generation_content_v1(uuid,text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.recover_stale_assessment_generation_items_v1(uuid,text) from public, anon, authenticated;
revoke all on function public.recover_stale_assessment_generation_items(uuid,text) from public, anon, authenticated;
revoke all on function public.assessment_generation_runtime_contract_v1() from public, anon, authenticated;

grant execute on function public.defer_assessment_generation_item_v1(uuid,text,uuid,text,text,integer) to service_role;
grant execute on function public.fail_assessment_generation_content_v1(uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.recover_stale_assessment_generation_items_v1(uuid,text) to service_role;
grant execute on function public.recover_stale_assessment_generation_items(uuid,text) to service_role;
grant execute on function public.assessment_generation_runtime_contract_v1() to service_role;

notify pgrst, 'reload schema';
commit;

-- نتيجة قبول واحدة واضحة بعد التشغيل.
select public.assessment_generation_runtime_contract_v1() as runtime_contract;

select status, error_code, count(*) as item_count
from public.assessment_generation_items
where error_code is not null
group by status, error_code
order by status, error_code;

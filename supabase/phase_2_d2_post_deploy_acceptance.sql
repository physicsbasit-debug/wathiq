-- واثق | Phase 2-D2 | اختبار قبول بعد النشر
-- شغّله بعد تنفيذ phase_2_d2_assessment_generation_jobs.sql.
-- الاختبار يستخدم أول مستخدم موجود في auth.users داخل معاملة ثم ينفذ ROLLBACK؛ لا يترك بيانات اختبارية.

begin;

create temporary table phase_2_d2_acceptance_state (
  owner_id uuid not null,
  draft_id text not null,
  run_id uuid,
  first_item_id uuid,
  second_item_id uuid,
  first_lease_token uuid,
  second_lease_token uuid
) on commit drop;

do $$
declare
  v_owner_id uuid;
  v_draft_id text := 'phase-2-d2-acceptance-' || replace(gen_random_uuid()::text, '-', '');
  v_plan_hash text := repeat('a', 64);
  v_source_hash text := repeat('b', 64);
  v_blueprint jsonb;
  v_contracts jsonb;
  v_run_id uuid;
  v_created boolean;
  v_repeat_run_id uuid;
  v_repeat_created boolean;
  v_count integer;
  v_first public.assessment_generation_items%rowtype;
  v_second public.assessment_generation_items%rowtype;
  v_ok boolean;
  v_failure_status text;
  v_run_status text;
begin
  select id into v_owner_id from auth.users order by created_at limit 1;
  if v_owner_id is null then
    raise exception 'PHASE_2_D2_ACCEPTANCE_REQUIRES_ONE_AUTH_USER';
  end if;

  if to_regclass('public.assessment_generation_runs') is null
    or to_regclass('public.assessment_generation_items') is null then
    raise exception 'PHASE_2_D2_TABLES_MISSING';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'assessment_generation_runs'
      and c.relrowsecurity and c.relforcerowsecurity
  ) or not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'assessment_generation_items'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'PHASE_2_D2_RLS_NOT_FORCED';
  end if;

  if has_table_privilege('authenticated', 'public.assessment_generation_runs', 'SELECT')
    or has_table_privilege('authenticated', 'public.assessment_generation_items', 'SELECT')
    or has_table_privilege('anon', 'public.assessment_generation_runs', 'SELECT')
    or has_table_privilege('anon', 'public.assessment_generation_items', 'SELECT') then
    raise exception 'PHASE_2_D2_BROWSER_TABLE_ACCESS_NOT_REVOKED';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.enqueue_assessment_generation_run(uuid,jsonb,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.enqueue_assessment_generation_run(uuid,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'PHASE_2_D2_RPC_PRIVILEGES_INVALID';
  end if;

  v_blueprint := jsonb_build_object(
    'engineSchemaVersion', 1,
    'blueprintVersion', 1,
    'draftId', v_draft_id,
    'generationEpoch', 1,
    'planHash', v_plan_hash,
    'sourceSnapshotHash', v_source_hash,
    'itemCount', 2
  );

  v_contracts := jsonb_build_array(
    jsonb_build_object(
      'draftId', v_draft_id,
      'generationEpoch', 1,
      'planHash', v_plan_hash,
      'planItemId', 'plan-1',
      'order', 1,
      'contractHash', repeat('c', 64),
      'source', jsonb_build_object(
        'sourceId', 'source-acceptance',
        'chunkIndex', 10,
        'contentHash', repeat('d', 64)
      )
    ),
    jsonb_build_object(
      'draftId', v_draft_id,
      'generationEpoch', 1,
      'planHash', v_plan_hash,
      'planItemId', 'plan-2',
      'order', 2,
      'contractHash', repeat('e', 64),
      'source', jsonb_build_object(
        'sourceId', 'source-acceptance',
        'chunkIndex', 11,
        'contentHash', repeat('f', 64)
      )
    )
  );

  select enqueued.run_id, enqueued.created
    into v_run_id, v_created
  from public.enqueue_assessment_generation_run(v_owner_id, v_blueprint, v_contracts) enqueued;

  if v_run_id is null or not v_created then
    raise exception 'PHASE_2_D2_FIRST_ENQUEUE_FAILED';
  end if;

  select enqueued.run_id, enqueued.created
    into v_repeat_run_id, v_repeat_created
  from public.enqueue_assessment_generation_run(v_owner_id, v_blueprint, v_contracts) enqueued;

  if v_repeat_run_id <> v_run_id or v_repeat_created then
    raise exception 'PHASE_2_D2_IDEMPOTENCY_FAILED';
  end if;

  select count(*) into v_count
  from public.assessment_generation_items
  where run_id = v_run_id;
  if v_count <> 2 then
    raise exception 'PHASE_2_D2_ITEM_COUNT_INVALID';
  end if;

  select item.* into v_first
  from public.assessment_generation_items item
  where item.run_id = v_run_id and item.plan_item_id = 'plan-1';

  select claimed.* into v_first
  from public.claim_assessment_generation_item(v_first.id, 'phase-d2-acceptance-worker', 90) claimed;
  if v_first.lease_token is null or v_first.status <> 'grounding' or v_first.attempt_count <> 1 then
    raise exception 'PHASE_2_D2_ATOMIC_CLAIM_FAILED';
  end if;

  if not public.heartbeat_assessment_generation_item(v_first.id, 'phase-d2-acceptance-worker', v_first.lease_token, 'generating', 90)
    or not public.heartbeat_assessment_generation_item(v_first.id, 'phase-d2-acceptance-worker', v_first.lease_token, 'normalizing', 90)
    or not public.heartbeat_assessment_generation_item(v_first.id, 'phase-d2-acceptance-worker', v_first.lease_token, 'validating', 90) then
    raise exception 'PHASE_2_D2_HEARTBEAT_TRANSITION_FAILED';
  end if;

  v_ok := public.complete_assessment_generation_item(
    v_first.id,
    'phase-d2-acceptance-worker',
    gen_random_uuid(),
    1,
    repeat('c', 64),
    jsonb_build_object('question', 'stale result'),
    jsonb_build_object('evidenceIndex', 0),
    jsonb_build_object('totalMs', 10),
    '{}'::jsonb,
    'stale-request'
  );
  if v_ok then
    raise exception 'PHASE_2_D2_STALE_LEASE_WAS_ACCEPTED';
  end if;

  v_ok := public.complete_assessment_generation_item(
    v_first.id,
    'phase-d2-acceptance-worker',
    v_first.lease_token,
    1,
    repeat('c', 64),
    jsonb_build_object('question', 'accepted result'),
    jsonb_build_object('evidenceIndex', 0),
    jsonb_build_object('groundingMs', 1, 'modelMs', 2, 'normalizationMs', 3, 'validationMs', 4, 'totalMs', 10),
    jsonb_build_object('inputTokens', 1, 'outputTokens', 1),
    'accepted-request'
  );
  if not v_ok then
    raise exception 'PHASE_2_D2_VALID_RESULT_REJECTED';
  end if;

  v_ok := public.complete_assessment_generation_item(
    v_first.id,
    'phase-d2-acceptance-worker',
    v_first.lease_token,
    1,
    repeat('c', 64),
    jsonb_build_object('question', 'late duplicate'),
    jsonb_build_object('evidenceIndex', 0),
    jsonb_build_object('totalMs', 10),
    '{}'::jsonb,
    'late-request'
  );
  if v_ok then
    raise exception 'PHASE_2_D2_DUPLICATE_RESULT_WAS_ACCEPTED';
  end if;

  select item.* into v_second
  from public.assessment_generation_items item
  where item.run_id = v_run_id and item.plan_item_id = 'plan-2';

  select claimed.* into v_second
  from public.claim_assessment_generation_item(v_second.id, 'phase-d2-recovery-worker', 90) claimed;
  update public.assessment_generation_items
  set lease_expires_at = now() - interval '1 second'
  where id = v_second.id;

  v_count := public.recover_stale_assessment_generation_items(v_owner_id, v_draft_id);
  if v_count <> 1 then
    raise exception 'PHASE_2_D2_STALE_RECOVERY_COUNT_INVALID';
  end if;

  select status into v_failure_status
  from public.assessment_generation_items
  where id = v_second.id;
  if v_failure_status <> 'retry_pending' then
    raise exception 'PHASE_2_D2_STALE_ITEM_NOT_REQUEUED';
  end if;

  select claimed.* into v_second
  from public.claim_assessment_generation_item(v_second.id, 'phase-d2-retry-worker', 90) claimed;
  v_failure_status := public.fail_assessment_generation_item(
    v_second.id,
    'phase-d2-retry-worker',
    v_second.lease_token,
    'MODEL_UNAVAILABLE',
    'اختبار فئة النقل.',
    'transport_once'
  );
  if v_failure_status <> 'retry_pending' then
    raise exception 'PHASE_2_D2_TRANSPORT_RETRY_NOT_GRANTED';
  end if;

  select claimed.* into v_second
  from public.claim_assessment_generation_item(v_second.id, 'phase-d2-final-worker', 90) claimed;
  v_failure_status := public.fail_assessment_generation_item(
    v_second.id,
    'phase-d2-final-worker',
    v_second.lease_token,
    'MODEL_UNAVAILABLE',
    'لا يسمح بمحاولة نقل ثانية.',
    'transport_once'
  );
  if v_failure_status <> 'failed' then
    raise exception 'PHASE_2_D2_RETRY_LIMIT_NOT_ENFORCED';
  end if;

  select status into v_run_status
  from public.assessment_generation_runs
  where id = v_run_id;
  if v_run_status <> 'partial' then
    raise exception 'PHASE_2_D2_RUN_AGGREGATION_INVALID';
  end if;

  if not public.cancel_assessment_generation_run(v_owner_id, v_run_id) then
    raise exception 'PHASE_2_D2_CANCEL_FAILED';
  end if;

  insert into phase_2_d2_acceptance_state(owner_id, draft_id, run_id, first_item_id, second_item_id)
  values (v_owner_id, v_draft_id, v_run_id, v_first.id, v_second.id);
end;
$$;

select
  'PASS: Phase 2-D2 durable generation schema, security, idempotency, leases, recovery, stale-write rejection, retry limits, and aggregation.'
  as phase_2_d2_acceptance_result;

rollback;

-- واثق | Phase 2-D2 | تصحيح عقد SQL بعد اختبار القبول
-- يعالج تعارض اسم عمود run_id مع عمود الإرجاع الذي يحمل الاسم نفسه داخل PL/pgSQL.
-- آمن للتنفيذ بعد ملف المرحلة الأساسي؛ لا يحذف الجداول ولا البيانات.

begin;

create or replace function public.enqueue_assessment_generation_run(
  p_owner_id uuid,
  p_blueprint jsonb,
  p_contracts jsonb
)
returns table(run_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft_id text;
  v_epoch integer;
  v_plan_hash text;
  v_source_hash text;
  v_total integer;
  v_existing public.assessment_generation_runs%rowtype;
  v_latest_epoch integer;
  v_run_id uuid;
  v_contract jsonb;
  v_seen_count integer;
begin
  if p_owner_id is null or p_blueprint is null or p_contracts is null
    or jsonb_typeof(p_blueprint) <> 'object' or jsonb_typeof(p_contracts) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_GENERATION_PAYLOAD';
  end if;

  v_draft_id := nullif(btrim(p_blueprint ->> 'draftId'), '');
  v_epoch := nullif(p_blueprint ->> 'generationEpoch', '')::integer;
  v_plan_hash := lower(p_blueprint ->> 'planHash');
  v_source_hash := lower(p_blueprint ->> 'sourceSnapshotHash');
  v_total := jsonb_array_length(p_contracts);

  if v_draft_id is null or char_length(v_draft_id) > 120
    or v_epoch < 1
    or v_plan_hash !~ '^[0-9a-f]{64}$'
    or v_source_hash !~ '^[0-9a-f]{64}$'
    or v_total < 1 or v_total > 40
    or p_blueprint ->> 'itemCount' <> v_total::text then
    raise exception using errcode = '22023', message = 'INVALID_GENERATION_BLUEPRINT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text || ':' || v_draft_id, 0));

  select * into v_existing
  from public.assessment_generation_runs
  where owner_id = p_owner_id and draft_id = v_draft_id and generation_epoch = v_epoch;

  if found then
    if v_existing.plan_hash <> v_plan_hash or v_existing.source_snapshot_hash <> v_source_hash then
      raise exception using errcode = '23505', message = 'GENERATION_EPOCH_CONFLICT';
    end if;
    return query select v_existing.id, false;
    return;
  end if;

  select max(generation_epoch) into v_latest_epoch
  from public.assessment_generation_runs
  where owner_id = p_owner_id and draft_id = v_draft_id;

  if v_latest_epoch is not null and v_epoch < v_latest_epoch then
    raise exception using errcode = '40001', message = 'STALE_GENERATION_EPOCH';
  end if;

  update public.assessment_generation_runs
  set status = 'superseded',
      error_code = 'SUPERSEDED_BY_NEW_RUN',
      error_message = 'أنشئت دورة توليد أحدث للمسودة نفسها.',
      completed_at = now()
  where owner_id = p_owner_id
    and draft_id = v_draft_id
    and generation_epoch < v_epoch
    and status not in ('completed', 'cancelled', 'superseded');

  update public.assessment_generation_items
  set status = 'superseded',
      error_code = 'SUPERSEDED_BY_NEW_RUN',
      error_message = 'أُبطلت المهمة بسبب دورة توليد أحدث.',
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      completed_at = now()
  where owner_id = p_owner_id
    and draft_id = v_draft_id
    and generation_epoch < v_epoch
    and status <> 'superseded'
    and exists (
      select 1
      from public.assessment_generation_runs superseded_run
      where superseded_run.id = public.assessment_generation_items.run_id
        and superseded_run.status = 'superseded'
    );

  insert into public.assessment_generation_runs (
    owner_id, draft_id, generation_epoch, engine_schema_version, blueprint_version,
    plan_hash, source_snapshot_hash, status, blueprint, total_items
  ) values (
    p_owner_id,
    v_draft_id,
    v_epoch,
    coalesce((p_blueprint ->> 'engineSchemaVersion')::integer, 1),
    coalesce((p_blueprint ->> 'blueprintVersion')::integer, 1),
    v_plan_hash,
    v_source_hash,
    'queued',
    p_blueprint,
    v_total
  ) returning id into v_run_id;

  for v_contract in select value from jsonb_array_elements(p_contracts)
  loop
    if jsonb_typeof(v_contract) <> 'object'
      or v_contract ->> 'draftId' <> v_draft_id
      or v_contract ->> 'generationEpoch' <> v_epoch::text
      or lower(v_contract ->> 'planHash') <> v_plan_hash
      or lower(v_contract ->> 'contractHash') !~ '^[0-9a-f]{64}$'
      or nullif(btrim(v_contract ->> 'planItemId'), '') is null
      or nullif(btrim(v_contract #>> '{source,sourceId}'), '') is null
      or (v_contract #>> '{source,chunkIndex}')::integer < 0
      or lower(v_contract #>> '{source,contentHash}') !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'INVALID_ITEM_CONTRACT';
    end if;

    insert into public.assessment_generation_items (
      run_id, owner_id, draft_id, generation_epoch, plan_hash,
      plan_item_id, item_order, contract_hash,
      source_id, chunk_index, source_content_hash,
      item_contract, status, max_attempts
    ) values (
      v_run_id,
      p_owner_id,
      v_draft_id,
      v_epoch,
      v_plan_hash,
      v_contract ->> 'planItemId',
      (v_contract ->> 'order')::integer,
      lower(v_contract ->> 'contractHash'),
      v_contract #>> '{source,sourceId}',
      (v_contract #>> '{source,chunkIndex}')::integer,
      lower(v_contract #>> '{source,contentHash}'),
      v_contract,
      'queued',
      3
    );
  end loop;

  select count(distinct item.plan_item_id) into v_seen_count
  from public.assessment_generation_items as item
  where item.run_id = v_run_id;
  if v_seen_count <> v_total then
    raise exception using errcode = '22023', message = 'DUPLICATE_OR_MISSING_PLAN_ITEMS';
  end if;

  perform public.refresh_assessment_generation_run(v_run_id);
  return query select v_run_id, true;
end;
$$;

commit;

-- بعد نجاح التنفيذ شغّل phase_2_d2_post_deploy_acceptance.sql من جديد.

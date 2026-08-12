-- واثق 0.3.0 | مخطط كامبريدج الحالي
-- إعداد واحد لبيئة Supabase جديدة: التوليد الدائم + المرئيات العلمية فقط.
-- لا توجد مكتبة مصادر أو OCR أو تكاملات رفع محتوى في النواة الحالية.

-- مهام الأصول العلمية 2D الدائمة

create extension if not exists pgcrypto;

create table if not exists public.question_visual_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_id text not null check (char_length(draft_id) between 1 and 120),
  plan_item_id text not null check (char_length(plan_item_id) between 1 and 120),
  visual_hash text not null check (char_length(visual_hash) = 64),
  required_mode text not null check (required_mode = 'replace'),
  status text not null default 'queued'
    check (status in ('queued', 'generating', 'validating', 'ready', 'retry_pending', 'failed', 'cancelled')),
  request_payload jsonb not null,
  asset jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  error_code text,
  error_message text,
  worker_id text,
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, draft_id, plan_item_id)
);

create index if not exists question_visual_jobs_owner_draft_idx
  on public.question_visual_jobs(owner_id, draft_id, updated_at desc);
create index if not exists question_visual_jobs_status_idx
  on public.question_visual_jobs(status, updated_at);
create index if not exists question_visual_jobs_stale_idx
  on public.question_visual_jobs(updated_at)
  where status in ('generating', 'validating');

create or replace function public.touch_question_visual_job_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists question_visual_jobs_touch_updated_at on public.question_visual_jobs;
create trigger question_visual_jobs_touch_updated_at
before update on public.question_visual_jobs
for each row execute function public.touch_question_visual_job_updated_at();

alter table public.question_visual_jobs enable row level security;
revoke all on table public.question_visual_jobs from anon, authenticated;
grant all on table public.question_visual_jobs to service_role;

comment on table public.question_visual_jobs is
  'مهام توليد المرئيات التعليمية الدائمة. تُدار حصريًا عبر Edge Function question-visual-jobs.';
comment on column public.question_visual_jobs.request_payload is
  'نسخة الطلب العلمي اللازمة لإعادة تشغيل المهمة بعد انقطاع المتصفح أو انتهاء عامل Edge.';
comment on column public.question_visual_jobs.asset is
  'أصل الصورة المعتمد علميًا الذي تعيده خدمة science-visual-generation.';
comment on column public.question_visual_jobs.visual_hash is
  'بصمة مواصفة الرسم والسؤال؛ أي تغيير ينشئ دورة توليد جديدة للمفردة نفسها.';


-- دورات توليد المفردات الدائمة
-- منظومة دورات توليد الاختبارات ومهام المفردات الدائمة.
-- ينفذ مرة واحدة من Supabase Dashboard > SQL Editor قبل نشر Edge Function assessment-generation-jobs.
-- هذه المرحلة لا تستدعي Gemini ولا تربط واجهة الإنتاج؛ تبني التخزين الدائم والحجز والاستعادة فقط.

create extension if not exists pgcrypto;

create table if not exists public.assessment_generation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_id text not null check (char_length(draft_id) between 1 and 120),
  generation_epoch integer not null check (generation_epoch >= 1),
  engine_schema_version integer not null default 1 check (engine_schema_version = 1),
  blueprint_version integer not null default 4 check (blueprint_version in (1, 4)),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  source_snapshot_hash text not null check (source_snapshot_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'reviewing', 'completed', 'partial', 'failed', 'cancelled', 'superseded')),
  blueprint jsonb not null check (jsonb_typeof(blueprint) = 'object'),
  total_items integer not null check (total_items between 1 and 40),
  completed_items integer not null default 0 check (completed_items between 0 and 40),
  failed_items integer not null default 0 check (failed_items between 0 and 40),
  review_result jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, draft_id, generation_epoch),
  unique (id, owner_id, draft_id, generation_epoch, plan_hash),
  check (completed_items + failed_items <= total_items),
  check (blueprint ->> 'draftId' = draft_id),
  check (blueprint ->> 'generationEpoch' = generation_epoch::text),
  check (blueprint ->> 'planHash' = plan_hash),
  check (blueprint ->> 'sourceSnapshotHash' = source_snapshot_hash),
  check (blueprint ->> 'itemCount' = total_items::text)
);

create table if not exists public.assessment_generation_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_id text not null check (char_length(draft_id) between 1 and 120),
  generation_epoch integer not null check (generation_epoch >= 1),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  plan_item_id text not null check (char_length(plan_item_id) between 1 and 120),
  item_order integer not null check (item_order between 1 and 40),
  contract_hash text not null check (contract_hash ~ '^[0-9a-f]{64}$'),
  source_id text not null check (char_length(source_id) between 1 and 180),
  chunk_index integer not null check (chunk_index >= 0),
  source_content_hash text not null check (source_content_hash ~ '^[0-9a-f]{64}$'),
  item_contract jsonb not null check (jsonb_typeof(item_contract) = 'object'),
  status text not null default 'queued'
    check (status in ('queued', 'grounding', 'generating', 'normalizing', 'validating', 'ready', 'retry_pending', 'failed', 'cancelled', 'superseded')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  transport_retry_count integer not null default 0 check (transport_retry_count between 0 and 100),
  content_retry_count integer not null default 0 check (content_retry_count between 0 and 1),
  retry_after_at timestamptz,
  author_checkpoint jsonb check (author_checkpoint is null or jsonb_typeof(author_checkpoint) = 'object'),
  worker_id text,
  lease_token uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  request_id text,
  result jsonb,
  evidence_anchor jsonb,
  stage_timings jsonb not null default '{"groundingMs":0,"modelMs":0,"normalizationMs":0,"validationMs":0,"totalMs":0}'::jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, plan_item_id),
  unique (run_id, item_order),
  foreign key (run_id, owner_id, draft_id, generation_epoch, plan_hash)
    references public.assessment_generation_runs(id, owner_id, draft_id, generation_epoch, plan_hash)
    on delete cascade,
  unique (owner_id, draft_id, generation_epoch, plan_item_id),
  check (item_contract ->> 'draftId' = draft_id),
  check (item_contract ->> 'generationEpoch' = generation_epoch::text),
  check (item_contract ->> 'planHash' = plan_hash),
  check (item_contract ->> 'planItemId' = plan_item_id),
  check (item_contract ->> 'order' = item_order::text),
  check (item_contract ->> 'contractHash' = contract_hash),
  check (item_contract #>> '{source,sourceId}' = source_id),
  check (item_contract #>> '{source,chunkIndex}' = chunk_index::text),
  check (item_contract #>> '{source,contentHash}' = source_content_hash),
  check (
    (status in ('grounding', 'generating', 'normalizing', 'validating')
      and worker_id is not null and lease_token is not null and lease_expires_at is not null)
    or
    (status not in ('grounding', 'generating', 'normalizing', 'validating')
      and worker_id is null and lease_token is null and lease_expires_at is null)
  ),
  check ((status = 'ready' and result is not null and completed_at is not null) or status <> 'ready')
);

create index if not exists assessment_generation_runs_owner_draft_idx
  on public.assessment_generation_runs(owner_id, draft_id, generation_epoch desc);
create index if not exists assessment_generation_runs_status_idx
  on public.assessment_generation_runs(status, updated_at);
create index if not exists assessment_generation_items_run_order_idx
  on public.assessment_generation_items(run_id, item_order);
create index if not exists assessment_generation_items_owner_draft_idx
  on public.assessment_generation_items(owner_id, draft_id, generation_epoch desc, item_order);
create index if not exists assessment_generation_items_queue_idx
  on public.assessment_generation_items(status, updated_at)
  where status in ('queued', 'retry_pending');
create index if not exists assessment_generation_items_stale_lease_idx
  on public.assessment_generation_items(lease_expires_at)
  where status in ('grounding', 'generating', 'normalizing', 'validating');

create or replace function public.touch_assessment_generation_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists assessment_generation_runs_touch_updated_at on public.assessment_generation_runs;
create trigger assessment_generation_runs_touch_updated_at
before update on public.assessment_generation_runs
for each row execute function public.touch_assessment_generation_updated_at();

drop trigger if exists assessment_generation_items_touch_updated_at on public.assessment_generation_items;
create trigger assessment_generation_items_touch_updated_at
before update on public.assessment_generation_items
for each row execute function public.touch_assessment_generation_updated_at();

create or replace function public.refresh_assessment_generation_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_status text;
  v_total integer;
  v_ready integer;
  v_failed integer;
  v_active integer;
  v_next_status text;
begin
  select status, total_items
    into v_run_status, v_total
  from public.assessment_generation_runs
  where id = p_run_id
  for update;

  if not found then return; end if;
  if v_run_status in ('completed', 'cancelled', 'superseded') then return; end if;

  select
    count(*) filter (where status = 'ready'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status in ('queued', 'grounding', 'generating', 'normalizing', 'validating', 'retry_pending'))
  into v_ready, v_failed, v_active
  from public.assessment_generation_items
  where run_id = p_run_id;

  v_next_status := case
    when v_total > 0 and v_ready = v_total then 'reviewing'
    when v_active > 0 and (v_ready > 0 or exists (
      select 1 from public.assessment_generation_items
      where run_id = p_run_id and status in ('grounding', 'generating', 'normalizing', 'validating')
    )) then 'running'
    when v_active > 0 then 'queued'
    when v_ready > 0 and v_failed > 0 then 'partial'
    when v_failed = v_total then 'failed'
    else v_run_status
  end;

  update public.assessment_generation_runs
  set completed_items = v_ready,
      failed_items = v_failed,
      status = v_next_status,
      started_at = case when v_next_status in ('running', 'reviewing', 'partial', 'failed') then coalesce(started_at, now()) else started_at end,
      completed_at = case when v_next_status in ('partial', 'failed') then now() else null end
  where id = p_run_id;
end;
$$;

create or replace function public.on_assessment_generation_item_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_assessment_generation_run(old.run_id);
    return old;
  end if;

  -- لا نعيد تجميع الدورة عند انتقال العامل بين مراحل المعالجة الداخلية؛
  -- العدادات العامة لا تتغير إلا عند الدخول إلى المعالجة أو الخروج منها.
  if old.status in ('grounding', 'generating', 'normalizing', 'validating')
    and new.status in ('grounding', 'generating', 'normalizing', 'validating') then
    return new;
  end if;

  perform public.refresh_assessment_generation_run(new.run_id);
  return new;
end;
$$;

drop trigger if exists assessment_generation_items_refresh_run on public.assessment_generation_items;
create trigger assessment_generation_items_refresh_run
after update of status or delete on public.assessment_generation_items
for each row execute function public.on_assessment_generation_item_changed();

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
    coalesce((p_blueprint ->> 'blueprintVersion')::integer, 4),
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

create or replace function public.heartbeat_assessment_generation_item(
  p_item_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_stage text,
  p_lease_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current text;
  v_allowed boolean;
begin
  if p_stage not in ('grounding', 'generating', 'normalizing', 'validating')
    or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception using errcode = '22023', message = 'INVALID_HEARTBEAT';
  end if;

  select status into v_current
  from public.assessment_generation_items
  where id = p_item_id
    and worker_id = p_worker_id
    and lease_token = p_lease_token
    and lease_expires_at > now()
  for update;

  if not found then return false; end if;

  v_allowed := v_current = p_stage or
    (v_current = 'grounding' and p_stage = 'generating') or
    (v_current = 'generating' and p_stage = 'normalizing') or
    (v_current = 'normalizing' and p_stage = 'validating');
  if not v_allowed then
    raise exception using errcode = '22023', message = 'ILLEGAL_ITEM_STAGE_TRANSITION';
  end if;

  update public.assessment_generation_items
  set status = p_stage,
      heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  where id = p_item_id
    and worker_id = p_worker_id
    and lease_token = p_lease_token;
  return found;
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
      attempt_count = case
        when p_retry_class = 'transport_backoff' then greatest(attempt_count - 1, 0)
        else attempt_count
      end,
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

create or replace function public.cancel_assessment_generation_run(
  p_owner_id uuid,
  p_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.assessment_generation_runs
  set status = 'cancelled',
      error_code = 'CANCELLED_BY_USER',
      error_message = 'ألغى المستخدم دورة التوليد.',
      completed_at = now()
  where id = p_run_id
    and owner_id = p_owner_id
    and status not in ('completed', 'cancelled', 'superseded');
  if not found then return false; end if;

  update public.assessment_generation_items
  set status = 'cancelled',
      error_code = 'CANCELLED_BY_USER',
      error_message = 'ألغى المستخدم دورة التوليد.',
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      completed_at = now()
  where run_id = p_run_id
    and status in ('queued', 'grounding', 'generating', 'normalizing', 'validating', 'retry_pending', 'failed');
  return true;
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

revoke all on function public.touch_assessment_generation_updated_at() from public, anon, authenticated;
revoke all on function public.on_assessment_generation_item_changed() from public, anon, authenticated;
revoke all on function public.refresh_assessment_generation_run(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_assessment_generation_run(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.claim_assessment_generation_item(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_assessment_generation_item(uuid, text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.complete_assessment_generation_item(uuid, text, uuid, integer, text, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.fail_assessment_generation_item(uuid, text, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.checkpoint_assessment_generation_author(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.recover_stale_assessment_generation_items(uuid, text) from public, anon, authenticated;
revoke all on function public.retry_assessment_generation_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_assessment_generation_run(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resume_assessment_generation_run(uuid, uuid) from public, anon, authenticated;

grant execute on function public.refresh_assessment_generation_run(uuid) to service_role;
grant execute on function public.enqueue_assessment_generation_run(uuid, jsonb, jsonb) to service_role;
grant execute on function public.claim_assessment_generation_item(uuid, text, integer) to service_role;
grant execute on function public.heartbeat_assessment_generation_item(uuid, text, uuid, text, integer) to service_role;
grant execute on function public.complete_assessment_generation_item(uuid, text, uuid, integer, text, jsonb, jsonb, jsonb, jsonb, text) to service_role;
grant execute on function public.fail_assessment_generation_item(uuid, text, uuid, text, text, text, integer) to service_role;
grant execute on function public.checkpoint_assessment_generation_author(uuid, text, uuid, jsonb) to service_role;
grant execute on function public.recover_stale_assessment_generation_items(uuid, text) to service_role;
grant execute on function public.retry_assessment_generation_item(uuid, uuid) to service_role;
grant execute on function public.cancel_assessment_generation_run(uuid, uuid) to service_role;
grant execute on function public.resume_assessment_generation_run(uuid, uuid) to service_role;

comment on table public.assessment_generation_runs is
  'دورات توليد الاختبارات الدائمة. كل دورة مرتبطة بمسودة وإزاحة وبصمات خطة ومصادر ثابتة.';
comment on table public.assessment_generation_items is
  'مهمة مستقلة لكل مفردة. لا تخزن نص الكتاب؛ تخزن عقد المفردة وهوية مقطع المصدر وبصمته فقط.';
comment on column public.assessment_generation_items.lease_token is
  'رمز حجز ذري يمنع عاملًا قديمًا أو نتيجة متأخرة من الكتابة بعد استعادة المهمة.';
comment on column public.assessment_generation_items.source_content_hash is
  'بصمة محتوى المقطع عند بناء العقد؛ يقارنها عامل توليد المفردة بالمقطع الحقيقي قبل التوليد.';
comment on function public.complete_assessment_generation_item is
  'يقبل النتيجة فقط إذا طابقت الإزاحة والعقد والعامل والحجز النشط؛ وإلا يعيد false دون كتابة.';


-- النسخة الحالية من دالة إدراج دورة التوليد

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
    coalesce((p_blueprint ->> 'blueprintVersion')::integer, 4),
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

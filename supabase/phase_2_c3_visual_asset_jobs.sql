-- واثق | Phase 2-C3
-- منظومة مهام أصول بصرية دائمة مرتبطة بالمسودة والمفردة.
-- يُنفّذ مرة واحدة من Supabase Dashboard > SQL Editor قبل نشر Edge Function الجديدة.

create extension if not exists pgcrypto;

create table if not exists public.question_visual_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_id text not null check (char_length(draft_id) between 1 and 120),
  plan_item_id text not null check (char_length(plan_item_id) between 1 and 120),
  visual_hash text not null check (char_length(visual_hash) = 64),
  required_mode text not null check (required_mode in ('replace', 'overlay')),
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
  'أصل الصورة المعتمد علميًا الذي تعيده خدمة generate-source-questions.';
comment on column public.question_visual_jobs.visual_hash is
  'بصمة مواصفة الرسم والسؤال؛ أي تغيير ينشئ دورة توليد جديدة للمفردة نفسها.';

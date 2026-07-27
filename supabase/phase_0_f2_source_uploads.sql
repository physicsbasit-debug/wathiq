-- واثق | Phase 0-F2
-- رفع ملفات PDF إلى Google Drive وتسجيل بياناتها في سجل المصادر.
-- يُنفّذ مرة واحدة من Supabase Dashboard > SQL Editor.

alter table public.source_registry
  add column if not exists content_fingerprint text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists drive_file_id text,
  add column if not exists drive_parent_folder_id text,
  add column if not exists drive_original_parent_folder_id text,
  add column if not exists drive_web_view_link text,
  add column if not exists drive_md5_checksum text,
  add column if not exists upload_state text,
  add column if not exists uploaded_at timestamptz;

create unique index if not exists source_registry_owner_content_fingerprint_uidx
  on public.source_registry(owner_id, content_fingerprint)
  where content_fingerprint is not null;

create table if not exists public.source_upload_sessions (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null,
  catalog_code text not null,
  content_fingerprint text not null,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  total_bytes bigint not null check (total_bytes > 0),
  bytes_uploaded bigint not null default 0 check (bytes_uploaded >= 0),
  session_uri text not null,
  target_folder_id text not null,
  drive_path text not null,
  source_payload jsonb not null,
  status text not null default 'uploading'
    check (status in ('uploading', 'completed', 'failed', 'expired')),
  drive_file_id text,
  error_message text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, content_fingerprint)
);

create index if not exists source_upload_sessions_owner_status_idx
  on public.source_upload_sessions(owner_id, status);
create index if not exists source_upload_sessions_expires_at_idx
  on public.source_upload_sessions(expires_at);

alter table public.source_upload_sessions enable row level security;
revoke all on table public.source_upload_sessions from anon, authenticated;
grant all on table public.source_upload_sessions to service_role;

comment on table public.source_upload_sessions is
  'جلسات رفع PDF القابلة للاستكمال إلى Google Drive. لا يصل إليها المتصفح مباشرة.';
comment on column public.source_upload_sessions.session_uri is
  'رابط جلسة Google resumable upload؛ يبقى داخل Edge Function فقط.';
comment on column public.source_registry.content_fingerprint is
  'بصمة محتوى سريعة للملف تستخدم لمنع التكرار قبل الرفع.';

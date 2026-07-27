-- واثق | Phase 0-F1
-- سجل اتصال Google Drive الخاص بمالك المنصة.
-- الجداول خاصة بالخادم فقط: لا توجد سياسات وصول للمتصفح.

create table if not exists public.google_drive_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  granted_scope text not null default '',
  token_type text not null default 'Bearer',
  folder_map jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_oauth_states (
  state text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists google_oauth_states_expires_at_idx
  on public.google_oauth_states(expires_at);

alter table public.google_drive_connections enable row level security;
alter table public.google_oauth_states enable row level security;

-- لا نمنح المستخدم أو المتصفح وصولًا مباشرًا إلى الرموز.
revoke all on table public.google_drive_connections from anon, authenticated;
revoke all on table public.google_oauth_states from anon, authenticated;

grant all on table public.google_drive_connections to service_role;
grant all on table public.google_oauth_states to service_role;

comment on table public.google_drive_connections is
  'اتصال Google Drive الخاص بمالك واثق. يُستخدم فقط عبر Edge Function بصلاحية الخادم.';
comment on column public.google_drive_connections.refresh_token is
  'رمز تجديد Google OAuth. لا يظهر للمتصفح ولا لسجل المصادر.';

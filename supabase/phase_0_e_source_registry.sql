-- واثق Phase 0-E: سجل المصادر المركزي
-- ينفذ مرة واحدة من Supabase Dashboard > SQL Editor.

create table if not exists public.source_registry (
  owner_id uuid not null default auth.uid(),
  id text not null,
  catalog_code text not null,
  fingerprint text not null,
  authority text not null check (authority in ('منهج عُماني', 'كامبريدج', 'مصدر عالمي')),
  title text not null,
  kind text not null check (kind in ('كتاب الطالب', 'دليل المعلم', 'نواتج التعلم', 'جدول المواصفات', 'اختبار كامبريدج', 'مصدر عالمي')),
  mode text not null check (mode in ('file', 'url')),
  grade integer not null check (grade between 1 and 12),
  subject_id text not null,
  version text not null,
  file_name text,
  url text,
  rights_confirmed boolean not null default false,
  status text not null check (status in ('جاهز للفهرسة', 'مفهرس', 'يحتاج مراجعة', 'مؤرشف')),
  drive_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  unique (owner_id, fingerprint),
  unique (owner_id, catalog_code),
  check (
    (mode = 'file' and file_name is not null and url is null)
    or
    (mode = 'url' and url is not null and file_name is null)
  )
);

alter table public.source_registry enable row level security;

revoke all on public.source_registry from anon;
grant select, insert, update, delete on public.source_registry to authenticated;

drop policy if exists "owner reads own source registry" on public.source_registry;
create policy "owner reads own source registry"
on public.source_registry
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "owner inserts own source registry" on public.source_registry;
create policy "owner inserts own source registry"
on public.source_registry
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "owner updates own source registry" on public.source_registry;
create policy "owner updates own source registry"
on public.source_registry
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owner deletes own source registry" on public.source_registry;
create policy "owner deletes own source registry"
on public.source_registry
for delete
to authenticated
using (owner_id = auth.uid());

comment on table public.source_registry is 'سجل المصادر المركزي لمنصة واثق. لا يخزن ملفات PDF نفسها في Phase 0-E.';

-- واثق | Phase 0-G
-- استخراج النص القابل للتحديد من ملفات PDF وحفظ مقاطع الفهرسة.
-- لا ينفذ OCR في هذه المرحلة.

alter table public.source_registry
  add column if not exists extraction_status text not null default 'لم يبدأ',
  add column if not exists extraction_message text,
  add column if not exists extracted_page_count integer,
  add column if not exists extracted_character_count integer,
  add column if not exists extracted_language text,
  add column if not exists extraction_preview text,
  add column if not exists detected_headings jsonb not null default '[]'::jsonb,
  add column if not exists extracted_at timestamptz,
  add column if not exists extraction_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'source_registry_extraction_status_check'
      and conrelid = 'public.source_registry'::regclass
  ) then
    alter table public.source_registry
      add constraint source_registry_extraction_status_check
      check (extraction_status in ('لم يبدأ', 'جارٍ الاستخراج', 'مكتمل', 'يحتاج OCR', 'فشل'));
  end if;
end $$;

create table if not exists public.source_chunks (
  owner_id uuid not null default auth.uid(),
  source_id text not null,
  chunk_index integer not null check (chunk_index >= 0),
  page_from integer not null check (page_from > 0),
  page_to integer not null check (page_to >= page_from),
  content text not null check (length(content) > 0),
  character_count integer not null check (character_count > 0),
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  primary key (owner_id, source_id, chunk_index),
  foreign key (owner_id, source_id)
    references public.source_registry(owner_id, id)
    on delete cascade
);

create index if not exists source_chunks_owner_source_idx
  on public.source_chunks(owner_id, source_id, chunk_index);

create index if not exists source_chunks_search_vector_idx
  on public.source_chunks using gin(search_vector);

alter table public.source_chunks enable row level security;
revoke all on public.source_chunks from anon;
grant select, insert, update, delete on public.source_chunks to authenticated;

drop policy if exists "owner reads own source chunks" on public.source_chunks;
create policy "owner reads own source chunks"
on public.source_chunks
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "owner inserts own source chunks" on public.source_chunks;
create policy "owner inserts own source chunks"
on public.source_chunks
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "owner updates own source chunks" on public.source_chunks;
create policy "owner updates own source chunks"
on public.source_chunks
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owner deletes own source chunks" on public.source_chunks;
create policy "owner deletes own source chunks"
on public.source_chunks
for delete
to authenticated
using (owner_id = auth.uid());

comment on table public.source_chunks is
  'مقاطع النص المستخرج من PDF، مرتبة بحسب المصدر والصفحة، وتستخدم لاحقًا للبحث وبناء الأسئلة.';
comment on column public.source_registry.extraction_status is
  'حالة استخراج النص: لا يعني مكتمل أن الملف راجع تربويًا؛ يعني فقط أن النص القابل للتحديد استُخرج وحُفظ.';
comment on column public.source_registry.detected_headings is
  'عناوين مرشحة اكتُشفت بقواعد نصية بسيطة، وليست وحدات أو دروسًا معتمدة قبل المراجعة.';

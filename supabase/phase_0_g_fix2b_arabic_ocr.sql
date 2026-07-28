-- واثق | Phase 0-G Fix 2B
-- تخزين نتائج OCR العربية لكل صفحة مع دعم الاستكمال بعد الانقطاع.

create table if not exists public.source_ocr_pages (
  owner_id uuid not null default auth.uid(),
  source_id text not null,
  page_number integer not null check (page_number > 0),
  content text not null default '',
  character_count integer not null default 0 check (character_count >= 0),
  confidence real,
  provider text not null default 'google-cloud-vision',
  processed_at timestamptz not null default now(),
  primary key (owner_id, source_id, page_number),
  foreign key (owner_id, source_id)
    references public.source_registry(owner_id, id)
    on delete cascade
);

create index if not exists source_ocr_pages_owner_source_idx
  on public.source_ocr_pages(owner_id, source_id, page_number);

alter table public.source_ocr_pages enable row level security;
revoke all on public.source_ocr_pages from anon;
grant select, insert, update, delete on public.source_ocr_pages to authenticated;

drop policy if exists "owner reads own OCR pages" on public.source_ocr_pages;
create policy "owner reads own OCR pages"
on public.source_ocr_pages
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "owner inserts own OCR pages" on public.source_ocr_pages;
create policy "owner inserts own OCR pages"
on public.source_ocr_pages
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "owner updates own OCR pages" on public.source_ocr_pages;
create policy "owner updates own OCR pages"
on public.source_ocr_pages
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owner deletes own OCR pages" on public.source_ocr_pages;
create policy "owner deletes own OCR pages"
on public.source_ocr_pages
for delete
to authenticated
using (owner_id = auth.uid());

comment on table public.source_ocr_pages is
  'نتائج OCR لكل صفحة من المصدر، تحفظ للاستكمال بعد الانقطاع ثم تجمع في مقاطع الفهرسة.';

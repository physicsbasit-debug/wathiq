-- واثق | Phase 0-G Fix 3
-- إضافة الفصل الدراسي للمصادر وإبقاء المصادر القديمة متوافقة.

alter table public.source_registry
  add column if not exists semester text;

update public.source_registry
set semester = 'غير محدد'
where semester is null or btrim(semester) = '';

alter table public.source_registry
  alter column semester set default 'غير محدد';

alter table public.source_registry
  alter column semester set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'source_registry_semester_check'
      and conrelid = 'public.source_registry'::regclass
  ) then
    alter table public.source_registry
      add constraint source_registry_semester_check
      check (semester in ('الفصل الأول', 'الفصل الثاني', 'العام الكامل', 'غير محدد'));
  end if;
end $$;

comment on column public.source_registry.semester is
  'الفصل الدراسي المرتبط بالمصدر. غير محدد للمصادر القديمة فقط.';

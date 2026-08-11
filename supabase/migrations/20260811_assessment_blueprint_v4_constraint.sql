-- Wathiq v0.3.3 — align durable assessment-generation storage with Blueprint v4.
-- Safe for existing historical Blueprint v1 rows: they remain v1.
-- New rows default to v4, while only v1/v4 are accepted during this compatibility window.

begin;

alter table public.assessment_generation_runs
  drop constraint if exists assessment_generation_runs_blueprint_version_check;

alter table public.assessment_generation_runs
  alter column blueprint_version set default 4;

alter table public.assessment_generation_runs
  add constraint assessment_generation_runs_blueprint_version_check
  check (blueprint_version in (1, 4));

commit;

-- Verification: expected CHECK is blueprint_version IN (1, 4), default is 4.
select
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'assessment_generation_runs'
  and c.conname = 'assessment_generation_runs_blueprint_version_check';

select column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'assessment_generation_runs'
  and column_name = 'blueprint_version';

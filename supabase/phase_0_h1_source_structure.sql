-- واثق Phase 0-H1: تخزين هيكل الوحدات والدروس المستخرج من فهرس المصدر.

create table if not exists public.source_structure_nodes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null,
  id text not null,
  parent_id text,
  node_type text not null check (node_type in ('وحدة', 'درس', 'موضوع', 'نشاط', 'مراجعة', 'أسئلة')),
  title text not null check (char_length(trim(title)) > 0),
  page_start integer not null check (page_start > 0),
  page_end integer not null check (page_end >= page_start),
  order_index integer not null check (order_index >= 0),
  confidence double precision not null default 0 check (confidence >= 0 and confidence <= 1),
  review_status text not null default 'مرشح' check (review_status in ('مرشح', 'معتمد')),
  extraction_method text not null default 'toc-heuristic-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, source_id, id),
  foreign key (owner_id, source_id) references public.source_registry(owner_id, id) on delete cascade
);

create index if not exists source_structure_nodes_source_order_idx
  on public.source_structure_nodes(owner_id, source_id, order_index);

create index if not exists source_structure_nodes_parent_idx
  on public.source_structure_nodes(owner_id, source_id, parent_id);

alter table public.source_structure_nodes enable row level security;

revoke all on public.source_structure_nodes from anon;
grant select, insert, update, delete on public.source_structure_nodes to authenticated;

drop policy if exists "source_structure_nodes_select_own" on public.source_structure_nodes;
create policy "source_structure_nodes_select_own"
  on public.source_structure_nodes for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "source_structure_nodes_insert_own" on public.source_structure_nodes;
create policy "source_structure_nodes_insert_own"
  on public.source_structure_nodes for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "source_structure_nodes_update_own" on public.source_structure_nodes;
create policy "source_structure_nodes_update_own"
  on public.source_structure_nodes for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "source_structure_nodes_delete_own" on public.source_structure_nodes;
create policy "source_structure_nodes_delete_own"
  on public.source_structure_nodes for delete
  to authenticated
  using (auth.uid() = owner_id);

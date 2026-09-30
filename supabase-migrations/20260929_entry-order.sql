alter table public.entries
add column if not exists sort_order integer;

with ordered_entries as (
  select id, row_number() over (partition by tab_id order by created_at, id) - 1 as sort_order
  from public.entries
)
update public.entries as entry
set sort_order = ordered_entries.sort_order
from ordered_entries
where entry.id = ordered_entries.id
  and entry.sort_order is null;

alter table public.entries
alter column sort_order set default 0,
alter column sort_order set not null;

create index if not exists entries_tab_order_idx
on public.entries (tab_id, sort_order, created_at);

create or replace function public.reorder_entries(p_tab_id text, p_entry_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  expected_count integer;
  submitted_length integer;
  supplied_count integer;
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to reorder entries.';
  end if;

  select count(*) into expected_count
  from public.entries
  where tab_id = p_tab_id;

  submitted_length := cardinality(coalesce(p_entry_ids, '{}'::uuid[]));

  select count(distinct submitted.entry_id) into supplied_count
  from unnest(coalesce(p_entry_ids, '{}'::uuid[])) as submitted(entry_id);

  if submitted_length <> expected_count or supplied_count <> expected_count then
    raise exception 'The submitted order must contain every entry in the week exactly once.';
  end if;

  update public.entries as entry
  set sort_order = (submitted.position - 1)::integer
  from unnest(coalesce(p_entry_ids, '{}'::uuid[])) with ordinality as submitted(entry_id, position)
  where entry.id = submitted.entry_id
    and entry.tab_id = p_tab_id;

  get diagnostics updated_count = row_count;
  if updated_count <> expected_count then
    raise exception 'The week entries changed while saving the new order.';
  end if;
end;
$$;

revoke all on function public.reorder_entries(text, uuid[]) from public;
grant execute on function public.reorder_entries(text, uuid[]) to authenticated;

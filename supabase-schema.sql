create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  tab_id text not null,
  title text not null,
  blocks jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tabs (
  id text primary key,
  title text not null,
  is_deletable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tabs enable row level security;

drop policy if exists "Public can read tabs" on public.tabs;
drop policy if exists "Authenticated users can create tabs" on public.tabs;
drop policy if exists "Authenticated users can update tabs" on public.tabs;
drop policy if exists "Authenticated users can delete tabs" on public.tabs;

create policy "Public can read tabs"
on public.tabs for select
to anon, authenticated
using (true);

create policy "Authenticated users can create tabs"
on public.tabs for insert
to authenticated
with check (id <> 'portada');

create policy "Authenticated users can update tabs"
on public.tabs for update
to authenticated
using (id <> 'portada')
with check (id <> 'portada');

create policy "Authenticated users can delete tabs"
on public.tabs for delete
to authenticated
using (is_deletable = true and id <> 'portada');

insert into public.tabs (id, title, is_deletable, sort_order)
values
  ('portada', 'Portada General', false, 0),
  ('semana-1', 'Semana 01', true, 1)
on conflict (id) do nothing;

alter table public.entries enable row level security;

drop policy if exists "Public can read entries" on public.entries;
drop policy if exists "Authenticated users can create entries" on public.entries;
drop policy if exists "Authenticated users can update entries" on public.entries;
drop policy if exists "Authenticated users can delete entries" on public.entries;

create policy "Public can read entries"
on public.entries for select
to anon, authenticated
using (true);

create policy "Authenticated users can create entries"
on public.entries for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Authenticated users can update entries"
on public.entries for update
to authenticated
using (true)
with check (true);

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

create policy "Authenticated users can delete entries"
on public.entries for delete
to authenticated
using (true);

create index if not exists entries_tab_order_idx
on public.entries (tab_id, sort_order, created_at);

create table if not exists public.site_pages (
  slug text primary key check (slug in ('about', 'final-project')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.site_pages enable row level security;

drop policy if exists "Public can read site pages" on public.site_pages;
drop policy if exists "Authenticated users can create site pages" on public.site_pages;
drop policy if exists "Authenticated users can update site pages" on public.site_pages;

create policy "Public can read site pages"
on public.site_pages for select
to anon, authenticated
using (true);

create policy "Authenticated users can create site pages"
on public.site_pages for insert
to authenticated
with check (auth.uid() = updated_by);

create policy "Authenticated users can update site pages"
on public.site_pages for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() = updated_by);

grant select on public.site_pages to anon, authenticated;
grant insert, update on public.site_pages to authenticated;

insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload project media" on storage.objects;
drop policy if exists "Anyone can view project media" on storage.objects;
drop policy if exists "Authenticated users can update project media" on storage.objects;
drop policy if exists "Authenticated users can delete project media" on storage.objects;

create policy "Authenticated users can upload project media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'project-media');

create policy "Anyone can view project media"
on storage.objects for select
to public
using (bucket_id = 'project-media');

create policy "Authenticated users can update project media"
on storage.objects for update
to authenticated
using (bucket_id = 'project-media')
with check (bucket_id = 'project-media');

create policy "Authenticated users can delete project media"
on storage.objects for delete
to authenticated
using (bucket_id = 'project-media');

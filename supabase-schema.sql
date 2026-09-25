create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  tab_id text not null,
  title text not null,
  blocks jsonb not null default '[]'::jsonb,
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
with check (true);

create policy "Authenticated users can update tabs"
on public.tabs for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete tabs"
on public.tabs for delete
to authenticated
using (is_deletable = true);

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

create policy "Authenticated users can delete entries"
on public.entries for delete
to authenticated
using (true);

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

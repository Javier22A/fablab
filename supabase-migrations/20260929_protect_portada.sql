drop policy if exists "Authenticated users can create tabs" on public.tabs;
drop policy if exists "Authenticated users can update tabs" on public.tabs;
drop policy if exists "Authenticated users can delete tabs" on public.tabs;

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

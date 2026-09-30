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

insert into public.site_pages (slug, content)
values
(
  'about',
  '{
    "eyebrow": "Información general / FabLab I+D",
    "title": "Sobre nosotros.",
    "lead": "Aquí irá una descripción general del equipo, sus objetivos y el contexto de la materia.",
    "image": {
      "url": "images/logofablab.jpg",
      "alt": "Logo FabLab, imagen provisional del equipo"
    },
    "caption": "Aquí irá la fotografía del equipo.",
    "photoNote": "Este espacio queda reservado para la imagen vertical de los integrantes.",
    "sections": [
      {
        "eyebrow": "01",
        "title": "Quiénes somos",
        "description": "Aquí irá una presentación breve de los integrantes y sus responsabilidades."
      },
      {
        "eyebrow": "02",
        "title": "Qué hacemos",
        "description": "Aquí irá una explicación general del trabajo de investigación y desarrollo."
      },
      {
        "eyebrow": "03",
        "title": "Cómo trabajamos",
        "description": "Aquí irá una descripción del proceso, las herramientas y la forma de documentar los avances."
      }
    ],
    "teamNames": [
      "Javier Abad",
      "Steven Giron",
      "Francisco Siguenza",
      "Juan Pablo Quinteros"
    ]
  }'::jsonb
),
(
  'final-project',
  '{
    "eyebrow": "Proyecto final / I+D",
    "title": "Aquí irá la información del proyecto final.",
    "lead": "Aquí irá una descripción general del producto, la propuesta desarrollada y los resultados principales.",
    "linkLabel": "Ver la bitácora semanal",
    "linkUrl": "/fablab/index.html",
    "sections": [
      {
        "eyebrow": "01 / El problema",
        "title": "Aquí irá el problema identificado.",
        "description": "En este espacio se explicará la necesidad o situación que dio origen al proyecto.",
        "wide": true
      },
      {
        "eyebrow": "02 / El proceso",
        "title": "Aquí irá la metodología.",
        "description": "En este espacio se resumirán las etapas de investigación, ideación y validación."
      },
      {
        "eyebrow": "03 / El resultado",
        "title": "Aquí irá la propuesta final.",
        "description": "En este espacio se presentarán las características y conclusiones principales."
      }
    ]
  }'::jsonb
)
on conflict (slug) do nothing;

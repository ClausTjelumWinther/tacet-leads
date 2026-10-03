-- Anvendt 03/10/2026.
-- Personer: relationsnoter om mennesker, uanset om de er kunder, netværk eller private.
-- Opgaver: små løfter og huskepunkter, der dukker op indtil de er klaret.

create table if not exists public.personer (
  id              uuid primary key default gen_random_uuid(),
  navn            text not null,
  kategori        text not null default 'privat',  -- privat, netvaerk, kunde
  virksomhed_id   uuid references public.virksomheder(id) on delete set null,
  email           text,
  mobilnummer     text,
  noter           text,                            -- nyeste øverst: 'DD/MM/YYYY: tekst'
  sidste_kontakt  date,
  oprettet        timestamptz not null default now()
);

create table if not exists public.opgaver (
  id           uuid primary key default gen_random_uuid(),
  tekst        text not null,
  person_id    uuid references public.personer(id) on delete set null,
  projekt_id   uuid references public.projekter(id) on delete set null,
  forfald      date,
  faerdig      boolean not null default false,
  faerdig_dato date,
  oprettet     timestamptz not null default now()
);

alter table public.personer enable row level security;
alter table public.opgaver  enable row level security;

create policy "Admins full access" on public.personer for all
  using (private.has_role(auth.uid(), 'admin'::app_role))
  with check (private.has_role(auth.uid(), 'admin'::app_role));

create policy "Admins full access" on public.opgaver for all
  using (private.has_role(auth.uid(), 'admin'::app_role))
  with check (private.has_role(auth.uid(), 'admin'::app_role));

grant select, insert, update, delete on public.personer, public.opgaver to authenticated;
grant all on public.personer, public.opgaver to service_role;

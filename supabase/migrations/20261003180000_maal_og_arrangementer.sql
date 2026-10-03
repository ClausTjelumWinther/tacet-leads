-- Mål og målopfølgning (fanen "Mål" i Puls).
-- Q4 2026: fyld kalenderen i 2027. Målene sættes pr. periode, så fokus kan skifte i januar uden ombygning.

-- Er virksomheden "spændende" (over 20 funktionærer)? null = ved ikke endnu.
alter table public.virksomheder add column if not exists over20 boolean;

-- Målene for en periode. 'maal' er tilfredsstillende, 'perfekt' er 100 %.
create table if not exists public.maal (
  id        uuid primary key default gen_random_uuid(),
  periode   text not null,              -- fx 'Q4 2026'
  start     date not null,
  slut      date not null,
  fokus     text,                       -- én linje om periodens fokus
  noegle    text not null,              -- 'dage_q1_2027', 'spaendende_moeder' …
  titel     text not null,
  maal      numeric,
  perfekt   numeric,
  enhed     text,
  sortering int not null default 0,
  unique (periode, noegle)
);

-- Målinger, som morgen-gennemgangen skriver (fx dage booket i Q1 2027 ud fra kalenderen).
create table if not exists public.maalinger (
  id        uuid primary key default gen_random_uuid(),
  dato      date not null,
  noegle    text not null,
  vaerdi    numeric not null,
  detaljer  jsonb not null default '[]',
  unique (dato, noegle)
);

-- Netværksarrangementer og hvem der var med. Opfølgningsmøder findes i haendelser (type 'moede').
create table if not exists public.arrangementer (
  id        uuid primary key default gen_random_uuid(),
  navn      text not null,
  dato      date not null,
  sted      text,
  oprettet  timestamptz not null default now()
);

create table if not exists public.deltagere (
  id              uuid primary key default gen_random_uuid(),
  arrangement_id  uuid not null references public.arrangementer(id) on delete restrict,
  navn            text not null,
  email           text,
  person_id       uuid references public.personer(id) on delete set null,
  projekt_id      uuid references public.projekter(id) on delete set null,
  status          text not null default 'inviteret' check (status in ('inviteret', 'tilmeldt', 'afbud', 'moedt')),
  kilde           text unique,
  oprettet        timestamptz not null default now()
);
create index if not exists deltagere_arr_idx on public.deltagere (arrangement_id);

alter table public.maal          enable row level security;
alter table public.maalinger     enable row level security;
alter table public.arrangementer enable row level security;
alter table public.deltagere     enable row level security;

create policy "Admins full access" on public.maal for all
  using (private.has_role(auth.uid(), 'admin'::app_role)) with check (private.has_role(auth.uid(), 'admin'::app_role));
create policy "Admins full access" on public.maalinger for all
  using (private.has_role(auth.uid(), 'admin'::app_role)) with check (private.has_role(auth.uid(), 'admin'::app_role));
create policy "Admins full access" on public.arrangementer for all
  using (private.has_role(auth.uid(), 'admin'::app_role)) with check (private.has_role(auth.uid(), 'admin'::app_role));
create policy "Admins full access" on public.deltagere for all
  using (private.has_role(auth.uid(), 'admin'::app_role)) with check (private.has_role(auth.uid(), 'admin'::app_role));

grant select, insert, update on public.maal, public.maalinger, public.arrangementer, public.deltagere to authenticated;
grant all on public.maal, public.maalinger, public.arrangementer, public.deltagere to service_role;

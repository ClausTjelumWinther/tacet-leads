-- Morgen-gennemgangen af mail og kalender.
-- haendelser: fakta fra Gmail og kalenderen (mail ind/ud, møder, invitationer). Kun dato, retning og emne.
--             Skrives automatisk. Claus' egne noter bliver i noter-felterne og blandes ikke med dette.
-- forslag:    ting, der kræver Claus' ja: nye kontakter, nyt næste skridt, nye løfter.
--             Appen viser dem under "Forslag fra Claude", og først et ja ændrer noget.

create table if not exists public.haendelser (
  id          uuid primary key default gen_random_uuid(),
  dato        date not null,
  type        text not null check (type in ('mail_ind', 'mail_ud', 'moede', 'invitation')),
  titel       text not null,                -- fx "Svar på tilbud" eller "AI-middag på Vår"
  email       text,                         -- modpartens adresse, så en ny person kan kobles på bagefter
  person_id   uuid references public.personer(id) on delete set null,
  projekt_id  uuid references public.projekter(id) on delete set null,
  kilde       text unique,                  -- fx 'gmail:<id>' eller 'kal:<event-id>:<email>', så intet skrives to gange
  oprettet    timestamptz not null default now()
);
create index if not exists haendelser_person_idx  on public.haendelser (person_id, dato desc);
create index if not exists haendelser_projekt_idx on public.haendelser (projekt_id, dato desc);
create index if not exists haendelser_email_idx   on public.haendelser (lower(email));

create table if not exists public.forslag (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('ny_person', 'naeste_skridt', 'opgave')),
  tekst       text not null,                -- det Claus læser, fx "Opret Otto Spliid – inviteret til AI-middagen 22/10"
  data        jsonb not null default '{}',  -- ny_person: {navn,email,kategori,virksomhed_id}; naeste_skridt: {tekst,dato}; opgave: {tekst,forfald}
  person_id   uuid references public.personer(id) on delete set null,
  projekt_id  uuid references public.projekter(id) on delete set null,
  status      text not null default 'aaben' check (status in ('aaben', 'godkendt', 'afvist')),
  kilde       text unique,                  -- samme idé som ovenfor: samme forslag stilles kun én gang
  oprettet    timestamptz not null default now(),
  behandlet   timestamptz
);

alter table public.haendelser enable row level security;
alter table public.forslag    enable row level security;

create policy "Admins full access" on public.haendelser for all
  using (private.has_role(auth.uid(), 'admin'::app_role))
  with check (private.has_role(auth.uid(), 'admin'::app_role));

create policy "Admins full access" on public.forslag for all
  using (private.has_role(auth.uid(), 'admin'::app_role))
  with check (private.has_role(auth.uid(), 'admin'::app_role));

grant select, insert, update on public.haendelser, public.forslag to authenticated;
grant all on public.haendelser, public.forslag to service_role;

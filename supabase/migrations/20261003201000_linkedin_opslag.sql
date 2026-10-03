-- LinkedIn-opslag, som Claus laver. Måles i fanen Mål: ét om ugen er perfekt.
create table if not exists public.opslag (
  id        uuid primary key default gen_random_uuid(),
  dato      date not null,
  tekst     text,                 -- kort beskrivelse eller første linje
  url       text,                 -- link til opslaget, hvis det kendes
  kilde     text unique,          -- fx 'gmail:<id>' når morgen-gennemgangen fandt det
  oprettet  timestamptz not null default now()
);
alter table public.opslag enable row level security;
create policy "Admins full access" on public.opslag for all
  using (private.has_role(auth.uid(), 'admin'::app_role)) with check (private.has_role(auth.uid(), 'admin'::app_role));
grant select, insert, update on public.opslag to authenticated;
grant all on public.opslag to service_role;

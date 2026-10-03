-- Øjebliksbillede af leadsystemets skema i Supabase-projektet tacet-app
-- (vdebqppfkvcqjytbuhny), hentet 03/10/2026.
--
-- KUN DOKUMENTATION. Skal ikke køres: tabellerne findes allerede.
-- De tidligere migrationer blev lavet i Lovable og ligger ikke i git.
-- Alle ændringer fra nu af ligger i supabase/migrations/.

-- Roller ------------------------------------------------------------------

-- enum app_role: 'admin', 'user'

create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        app_role not null,
  created_at  timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function private.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Bemærk: der findes også en identisk public.has_role(). Policies bruger private.has_role().

-- Virksomheder ------------------------------------------------------------

create table public.virksomheder (
  id             uuid primary key default gen_random_uuid(),
  firmanavn      text not null,
  cvr            text,
  kontaktperson  text,
  email          text,
  mobilnummer    text,
  adresse        text,
  postnummer     text,
  "by"           text,
  oprettet       timestamptz default now()
);

-- Projekter (pipeline) ----------------------------------------------------

create table public.projekter (
  id             uuid primary key default gen_random_uuid(),
  virksomhed_id  uuid references public.virksomheder(id) on delete cascade,
  produkt        text not null,
  vaerdi         integer,               -- DKK
  stage          text not null default 'lead',  -- lead, dialog, tilbud, kunde, tabt, netvaerk
  dato           date,
  naeste_skridt  text,
  noter          text,
  oprettet       timestamptz default now()
);

-- LinkedIn outreach -------------------------------------------------------

create table public.linkedin_outreach (
  id                      uuid primary key default gen_random_uuid(),
  navn                    text not null,
  linkedin_url            text,
  status                  text not null default 'pa_listen',
    -- pa_listen, besked_sendt, i_dialog, konverteret, ikke_relevant
  note                    text,
  besked_sendt_dato       date,
  sidste_aktivitet_dato   date,
  konverteret_projekt_id  uuid,
  oprettet                timestamptz not null default now()
);

create or replace function public.handle_linkedin_outreach_status_change()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.sidste_aktivitet_dato is null then
      new.sidste_aktivitet_dato := current_date;
    end if;
    if new.status = 'besked_sendt' and new.besked_sendt_dato is null then
      new.besked_sendt_dato := current_date;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.sidste_aktivitet_dato := current_date;
    if new.status = 'besked_sendt' and new.besked_sendt_dato is null then
      new.besked_sendt_dato := current_date;
    end if;
  end if;

  return new;
end;
$$;

-- To triggers kalder samme funktion (dublet, ryddes op i en senere migration):
--   linkedin_outreach_status_change
--   linkedin_outreach_status_trigger

-- RLS ---------------------------------------------------------------------
-- RLS er slået til på alle tabeller.
-- virksomheder, projekter, linkedin_outreach, items:
--   policy "Admins full access" for all
--   using / with check: private.has_role(auth.uid(), 'admin')
-- user_roles:
--   "Admins manage roles" for all (samme betingelse)
--   "Users can view own roles" for select using (auth.uid() = user_id)

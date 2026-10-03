-- IKKE ANVENDT ENDNU. Venter på Claus' ok.
--
-- 1. Fjerner dublet-triggeren på linkedin_outreach (samme funktion kørte to gange).
-- 2. Tilføjer virksomheder.domaene, så mails og møder kan matches til den rigtige kunde.
-- 3. Tilføjer projekter.naeste_skridt_dato, så et næste skridt altid har en dato.
-- 4. Udfylder domaene fra eksisterende mailadresser (springer private mailudbydere over).

drop trigger if exists linkedin_outreach_status_trigger on public.linkedin_outreach;

alter table public.virksomheder
  add column if not exists domaene text;

alter table public.projekter
  add column if not exists naeste_skridt_dato date;

update public.virksomheder
set domaene = lower(split_part(email, '@', 2))
where domaene is null
  and email like '%@%'
  and lower(split_part(email, '@', 2)) not in (
    'gmail.com', 'hotmail.com', 'outlook.com', 'outlook.dk',
    'icloud.com', 'live.dk', 'live.com', 'yahoo.com', 'mail.dk'
  );

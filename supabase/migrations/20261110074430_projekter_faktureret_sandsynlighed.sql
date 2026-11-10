-- 10/11/2026: Oprydning i værdierne i PULS.
-- vaerdi betyder nu kun forventet værdi af næste aftale (pipeline).
-- Det, der allerede er vundet og faktureret, står i faktureret. Vinderchancen i sandsynlighed.
-- Allerede anvendt i produktion med apply_migration; filen her er til historikken.
create table if not exists public.projekter_vaerdi_backup_20261110 as select id, vaerdi, now() as backup_tid from public.projekter;
alter table public.projekter_vaerdi_backup_20261110 enable row level security;
alter table public.projekter add column if not exists faktureret integer;
alter table public.projekter add column if not exists sandsynlighed integer check (sandsynlighed between 0 and 100);
comment on column public.projekter.vaerdi is 'Forventet værdi af næste aftale (pipeline), kr. ekskl. moms';
comment on column public.projekter.faktureret is 'Allerede faktureret, kr. ekskl. moms';
comment on column public.projekter.sandsynlighed is 'Vinderchance i procent (0-100)';

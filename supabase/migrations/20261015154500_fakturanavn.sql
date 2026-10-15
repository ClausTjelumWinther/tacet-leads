-- Det juridiske navn til fakturaen, når det er anderledes end det navn, vi bruger til daglig
-- (fx "VSG" = "Vantage Support Group ApS"). Tom = brug firmanavn.
alter table public.virksomheder add column if not exists fakturanavn text;

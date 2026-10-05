-- Fanen "Kunder": genkøb hos eksisterende kunder.
-- genkoeb:          én linje med næste oplagte salg (alt, der kan faktureres, også Velatir)
-- sidste_leverance: hvornår vi sidst leverede (bruges, når der ikke ligger leverancer i haendelser)
alter table public.projekter add column if not exists genkoeb text;
alter table public.projekter add column if not exists sidste_leverance date;

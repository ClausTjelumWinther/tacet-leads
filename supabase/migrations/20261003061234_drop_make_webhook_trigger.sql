-- Anvendt 03/10/2026.
-- Fjerner triggeren, der sendte alle opdateringer af projekter til en Make-webhook
-- på en konto, som Claus ikke længere ejer.
drop trigger if exists "ny-kunde" on public.projekter;

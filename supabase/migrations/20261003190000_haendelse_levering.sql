-- Møder, der er leverance (betalt arbejde hos en kunde), skal ikke tælle som "spændende møder" i Mål.
-- Ny hændelsestype: 'levering'.
alter table public.haendelser drop constraint if exists haendelser_type_check;
alter table public.haendelser add constraint haendelser_type_check
  check (type in ('mail_ind', 'mail_ud', 'moede', 'levering', 'invitation'));

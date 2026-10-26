-- LinkedIn-profil på personer, så Claus kan åbne profilen, når han skriver eller ringer.
alter table public.personer add column if not exists linkedin text;
comment on column public.personer.linkedin is 'Fuldt link til personens LinkedIn-profil, fx https://www.linkedin.com/in/navn';

-- Er Claus vært for arrangementet (styrer invitationer og tilmeldinger) eller gæst (fx Agendas fredagsbar)?
alter table public.arrangementer add column if not exists rolle text not null default 'vaert'
  check (rolle in ('vaert', 'gaest'));

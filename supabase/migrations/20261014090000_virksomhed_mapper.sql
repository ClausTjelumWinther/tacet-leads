-- Hver lead/kunde har en mappe i Gmail (Kunder/<navn>) og på Drive (01 Tacet/Kunder/<navn>).
-- Navnene i Gmail/Drive er ikke altid de samme som firmanavnet (fx Tempur = Dan Foam),
-- så vi gemmer den præcise mappe her. Morgen-gennemgangen opretter mapper, der mangler.
alter table public.virksomheder add column if not exists gmail_label text;
alter table public.virksomheder add column if not exists drive_mappe_id text;
comment on column public.virksomheder.gmail_label is 'Gmail-label, fx "Kunder/Tempur"';
comment on column public.virksomheder.drive_mappe_id is 'Id på mappen under 01 Tacet/Kunder på Google Drive';

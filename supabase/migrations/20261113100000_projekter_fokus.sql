-- Fokus 7: højst syv projekter er "i fokus" ad gangen og vises under I dag.
-- Alt andet ligger på hylden med en dato for næste skridt. Loftet på 7 håndhæves i appen.
alter table public.projekter add column if not exists fokus boolean not null default false;
comment on column public.projekter.fokus is 'true = en af Claus'' højst 7 aktive indsatser (vises under I dag). Resten ligger på hylden.';

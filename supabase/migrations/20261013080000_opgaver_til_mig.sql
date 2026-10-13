-- Små ting Claus selv skal huske (køb en Sonos-højttaler, tal med renseriet).
-- De ligger i samme tabel som løfterne, men tæller ikke som løfter:
-- ikke i "holdt inden 48 timer", ikke i top 3 og ikke på kunde- eller personkort.
alter table public.opgaver add column if not exists til_mig boolean not null default false;
comment on column public.opgaver.til_mig is 'true = huskepunkt til Claus selv, ikke et løfte til en anden';

-- Anvendt 03/10/2026.
-- Markerer projekter, der peger på et Velatir-abonnement, så de kan trækkes som en liste.
alter table public.projekter add column if not exists velatir boolean not null default false;

-- Samme dag blev stage-værdien 'netvaerk' taget i brug (kræver ingen skemaændring,
-- da stage er fri tekst). Den bruges til leadgeneratorer: folk og firmaer,
-- der skaffer Claus kunder, men ikke selv bliver kunder.

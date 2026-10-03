# Puls (web-app)

Claus' egen app til leads, netværk og løfter. Kun til ham. Den læser og skriver direkte i Supabase-databasen `tacet-app`.

## Sådan hænger koden sammen

Læs filerne i denne rækkefølge, så giver det mening:

| Fil | Hvad den gør |
|---|---|
| `index.html` | Den eneste HTML-side. Indlæser skrifttyper, ikonet og `src/main.tsx`. |
| `src/main.tsx` | Startpunktet. Beder React om at tegne `<App />`. |
| `src/supabase.ts` | Forbindelsen til databasen. |
| `src/App.tsx` | Styrer, om du er logget ind, og om du ser listerne eller et fokuskort. |
| `src/data.ts` | Alt der taler med databasen: hente, gemme noter, flytte datoer. Plus typerne. |
| `src/dates.ts` | Datohjælpere i dansk tid. |
| `src/Lists.tsx` | Fanerne: I dag, Pipeline, Netværk, Velatir, Personer. |
| `src/Focus.tsx` | Fokuskortet for én person eller ét projekt. |
| `src/QuickNote.tsx` | "+ Note"-knappen til lige efter et møde. |
| `src/parts.tsx` | Små byggesten, der går igen: rækker, datochips, tidslinje, kontakt. |
| `src/styles.css` | Hele designet. Farverne står som tokens øverst. |
| `public/` | Ikoner og `manifest.webmanifest`, der gør appen installerbar. |

**Tre begreber at kende:**
- **Komponent:** en funktion, der returnerer HTML (fx `ProjectRow`). React tegner den igen, når dens data ændrer sig.
- **State:** værdier, der kan ændre sig, fx hvilken fane du står på (`useState`).
- **RLS (Row Level Security):** reglerne i databasen. Kun din admin-bruger kan læse og skrive. Derfor er det fint, at nøglen i `supabase.ts` er offentlig.

## Køre den lokalt

```bash
cd web
npm install
npm run dev      # åbner på http://localhost:5173
npm run build    # tjekker typer og bygger til mappen dist/
```

## Lægge den ud på nettet

Appen er en almindelig statisk side, så den kan ligge gratis hos fx Vercel:

1. Log ind på vercel.com med din GitHub-konto.
2. *Add New → Project* → vælg repoet `tacet-leads`.
3. Sæt **Root Directory** til `web`. Vercel genkender selv Vite.
4. *Deploy*. Hver gang der skubbes til `main`, bliver den lagt ud igen af sig selv.
5. Valgfrit: tilføj domænet `puls.tacet.dk` under *Settings → Domains*, og opret den CNAME-post, Vercel viser, hos din DNS-udbyder.

## På telefonen

Åbn adressen i Safari (iPhone) eller Chrome (Android) → *Del* / menuen → **Føj til hjemmeskærm**. Så får du Puls-ikonet og fuld skærm.

**Indtale:** tryk på mikrofonen på telefonens tastatur i notefeltet. Den rigtige stemmeknap, hvor Claude selv sorterer noten, er næste trin.

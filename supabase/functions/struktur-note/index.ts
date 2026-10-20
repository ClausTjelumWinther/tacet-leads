// struktur-note: tager det, Claus har indtalt, og finder ud af
//   1) hvem eller hvilket firma det handler om,
//   2) en renskrevet note,
//   3) de løfter, han gav (de bliver til opgaver),
//   4) evt. et nyt næste skridt for et projekt.
// Funktionen SKRIVER INTET i databasen. Den returnerer et forslag, som Claus godkender i appen.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const client = new Anthropic(); // læser ANTHROPIC_API_KEY fra Supabase' hemmeligheder

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Skemaet Claude skal udfylde. Ved at tvinge et "værktøj" får vi altid gyldig JSON tilbage.
const tool = {
  name: "gem_note",
  description: "Gem Claus' indtalte note på den rigtige person eller det rigtige projekt.",
  input_schema: {
    type: "object",
    properties: {
      maal_type: { type: "string", enum: ["person", "projekt", "ny_person", "mig_selv", "nyt_lead"], description: "Hvad noten skal gemmes på. mig_selv = noget Claus selv skal huske, uden en person eller kunde. nyt_lead = et firma, der ikke er på listen, og som kan blive kunde." },
      maal_id: { type: "string", description: "Nøglen fra listen, fx P12 eller F3. Udelades ved ny_person." },
      ny_person_navn: { type: "string", description: "Fulde navn, kun ved ny_person." },
      note: { type: "string", description: "Kort og præcis note på dansk i jeg-form, uden dato. Fjern fyldord, gentagelser og talesprog, men bevar ALLE konkrete detaljer (navne, familie, interesser, tal, aftaler)." },
      opgaver: {
        type: "array",
        description: "Kun ting Claus selv har lovet eller skal gøre. Tom liste hvis ingen.",
        items: {
          type: "object",
          properties: {
            tekst: { type: "string", description: "Kort og handlingsrettet, fx 'Send Ole oplægget om AI i bestyrelser'." },
            forfald: { type: "string", description: "YYYY-MM-DD. Standard er i morgen. Ved mig_selv: tom streng, medmindre Claus nævner en dag." },
          },
          required: ["tekst", "forfald"],
        },
      },
      nyt_lead: {
        type: "object",
        description: "Kun ved nyt_lead. Udfyld kun det, Claus faktisk siger. Opfind aldrig mail eller telefonnummer.",
        properties: {
          firmanavn: { type: "string" },
          kontaktperson: { type: "string", description: "Fulde navn på den, Claus talte med." },
          email: { type: "string" },
          mobil: { type: "string" },
          produkt: { type: "string", description: "Hvad det handler om i få ord, fx 'AI i kundeservice'." },
        },
        required: ["firmanavn"],
      },
      naeste_skridt: {
        type: "object",
        description: "Ved projekt: kun hvis noten tydeligt peger på et nyt næste skridt. Ved nyt_lead: altid, med dit bedste bud på et konkret træk og en dato (standard om 2 dage).",
        properties: { tekst: { type: "string" }, dato: { type: "string", description: "YYYY-MM-DD" } },
        required: ["tekst", "dato"],
      },
      sikker: { type: "boolean", description: "false hvis du er i tvivl om, hvem noten handler om." },
      begrundelse: { type: "string", description: "Én kort sætning om, hvorfor du valgte netop dette mål." },
    },
    required: ["maal_type", "note", "opgaver", "sikker", "begrundelse"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ fejl: "Kun POST" }, 405);

  // Kør som den bruger, der kalder, så databasens roller (RLS) gælder.
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: roles } = await sb.from("user_roles").select("role").eq("role", "admin");
  if (!roles || roles.length === 0) return json({ fejl: "Kun for admin." }, 403);

  let body: { transkript?: string; idag?: string; fast?: { type?: string; id?: string } };
  try { body = await req.json(); } catch { return json({ fejl: "Ugyldig forespørgsel." }, 400); }
  const transkript = (body.transkript ?? "").trim();
  const idag = /^\d{4}-\d{2}-\d{2}$/.test(body.idag ?? "") ? body.idag! : new Date().toISOString().slice(0, 10);
  if (transkript.length < 3) return json({ fejl: "Der er ingen tekst at sortere." }, 400);
  if (transkript.length > 8000) return json({ fejl: "Noten er for lang. Del den op." }, 400);

  // Kandidaterne: personer og aktive firmaer/projekter.
  const [pe, pr] = await Promise.all([
    sb.from("personer").select("id, navn, kategori, firma:virksomheder(firmanavn)"),
    sb.from("projekter").select("id, stage, produkt, firma:virksomheder(firmanavn, kontaktperson)").neq("stage", "tabt"),
  ]);
  if (pe.error || pr.error) return json({ fejl: "Kunne ikke læse personer og projekter." }, 500);

  // Claude får korte nøgler (P1, P2 … for personer, F1, F2 … for firmaer/projekter) i stedet for de lange id'er.
  // Lange id'er bliver nogle gange skrevet en anelse forkert af modellen, og så "fandtes" personen ikke.
  // deno-lint-ignore no-explicit-any
  const pData = pe.data as any[], fData = pr.data as any[];
  const personer = pData.map((p, i) => `P${i + 1} | person | ${p.navn}${p.firma ? " | " + p.firma.firmanavn : ""} | ${p.kategori}`);
  const projekter = fData.map((p, i) => `F${i + 1} | projekt | ${p.firma?.firmanavn ?? p.produkt}${p.firma?.kontaktperson ? " | kontakt: " + p.firma.kontaktperson : ""} | ${p.stage}`);

  // Alle kandidater med læsbart navn (bruges til at tjekke svaret og vise navnet i appen).
  type Kandidat = { noegle: string; type: "person" | "projekt"; id: string; navn: string; rent: string };
  const alle: Kandidat[] = [
    ...pData.map((p, i) => ({ noegle: `P${i + 1}`, type: "person" as const, id: p.id, rent: p.navn as string,
      navn: p.navn + (p.firma ? ` · ${p.firma.firmanavn}` : "") })),
    ...fData.map((p, i) => ({ noegle: `F${i + 1}`, type: "projekt" as const, id: p.id, rent: (p.firma?.kontaktperson ?? "") as string,
      navn: (p.firma?.firmanavn ?? p.produkt) as string })),
  ];
  // Små bogstaver, uden accenter og tegn, så navne kan sammenlignes.
  const norm = (t: string) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9æøå]+/g, " ").trim();
  /** Find en person på listen med præcis dette navn. */
  const personMedNavn = (navn: string) => {
    const n = norm(navn);
    return n ? alle.find(a => a.type === "person" && norm(a.rent) === n) : undefined;
  };
  /** Find det længste fulde personnavn, der står i selve teksten. */
  const personITekst = (tekst: string) => {
    const t = " " + norm(tekst) + " ";
    return alle.filter(a => a.type === "person" && norm(a.rent).includes(" ") && t.includes(" " + norm(a.rent) + " "))
      .sort((a, b) => b.rent.length - a.rent.length)[0];
  };
  // Kender appen allerede målet, skal Claude kun stramme teksten op og finde løfterne.
  const fast = body.fast ? alle.find(a => a.id === body.fast!.id && a.type === body.fast!.type) : undefined;

  const system = `Du hjælper Claus, en dansk AI-rådgiver og relationsmand, med at gemme noter efter møder.
I dag er ${idag}. Regn relative datoer ("på fredag", "om en uge") om til YYYY-MM-DD ud fra det.

Vælg målet for noten:
- Handler noten om en navngiven PERSON, så vælg personen fra listen, også selvom personen er kontakt på et projekt.
- Handler den om et firma eller en aftale uden en person på listen, så vælg projektet.
- Findes personen ikke, så brug ny_person med det fulde navn, Claus nævner.
- Er du i tvivl mellem flere, så sæt sikker=false og vælg det bedste bud.
- Taler Claus om et FIRMA, der ikke er på listen, som en mulig kunde (de vil høre om AI, der er en mulig opgave, "nyt lead"), så brug nyt_lead. Er det bare en privat bekendt uden et firma, så ny_person.
- Er det noget, Claus bare selv skal huske, og ikke et løfte til en bestemt person eller kunde ("jeg skal huske at købe en Sonos-højttaler", "tal med renseriet"), så brug mig_selv. Læg hver ting i opgaver som en kort, handlingsrettet linje, og lad note være en kort samlet tekst. Et firma som "renseriet" eller "Sonos" er ikke en kunde.

Stavning: Noten er ofte indtalt, og talegenkendelsen hører navne forkert. "Tacet" er Claus' eget firma (fejlhøres fx som "tasset", "taset", "tacit"). "Velatir" er en samarbejdspartner, der sælger software til AI-governance (fejlhøres fx som "vela tir", "velatier", "fela tir"). "Puls" er Claus' leadsystem. Stav altid disse og navnene på listen nedenfor korrekt.

Opgaver er KUN ting, Claus selv har lovet eller skal gøre. Ikke ting, den anden person skal gøre.
Brug kun nøgler fra listen nedenfor (P… eller F…). Opfind aldrig nøgler.

${fast ? `NOTEN HANDLER OM: ${fast.navn} (${fast.type}, nøgle ${fast.noegle}). Brug præcis dette mål.\n` : ""}
LISTE (nøgle | type | navn | detaljer):
${[...personer, ...projekter].join("\n")}`;

  // Prøv den stærke model først. Er den ikke tilgængelig på nøglen, så brug den hurtige,
  // som indkøbslistens "kategoriser" allerede bruger med samme nøgle.
  const MODELLER = ["claude-sonnet-5-5", "claude-haiku-4-5-20251001"];
  const ask = (model: string) => client.messages.create({
    model,
    max_tokens: 1500,
    system,
    // deno-lint-ignore no-explicit-any
    tools: [tool as any],
    // Nyere modeller tillader ikke at tvinge et bestemt værktøj, så vi beder pænt i stedet
    // og tjekker bagefter, at svaret faktisk er et kald til gem_note.
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: `Claus har indtalt:\n\n"""${transkript}"""\n\nSvar ved at kalde gem_note.` }],
  });

  try {
    // deno-lint-ignore no-explicit-any
    let msg: any = null;
    let sidsteFejl: unknown = null;
    for (const model of MODELLER) {
      try {
        msg = await ask(model);
        // deno-lint-ignore no-explicit-any
        if (msg.content.some((c: any) => c.type === "tool_use")) break;
        console.error(`${model} kaldte ikke gem_note, prøver næste model`);
        continue;
      }
      catch (e) {
        sidsteFejl = e;
        // deno-lint-ignore no-explicit-any
        const status = (e as any)?.status;
        console.error(`Claude-fejl med ${model}:`, status, (e as Error).message);
        // Model findes ikke, ingen adgang, travlt eller overbelastet: prøv den næste model.
        // Forkert nøgle (401) eller manglende kredit hjælper det ikke at prøve igen.
        if (![400, 403, 404, 429, 500, 502, 503, 529].includes(status)) throw e;
      }
    }
    if (!msg) throw sidsteFejl;
    // deno-lint-ignore no-explicit-any
    const use = msg.content.find((c: any) => c.type === "tool_use");
    if (!use || use.type !== "tool_use") return json({ fejl: "Claude svarede ikke som forventet." }, 502);
    // deno-lint-ignore no-explicit-any
    const forslag = use.input as any;

    // Tjek at id'et faktisk findes, og find et læsbart navn til appen.
    if (fast) {
      Object.assign(forslag, { maal_type: fast.type, maal_id: fast.id, maal_navn: fast.navn, sikker: true });
    } else if (forslag.maal_type === "nyt_lead") {
      forslag.nyt_lead ??= { firmanavn: "" };
      forslag.maal_navn = forslag.nyt_lead.firmanavn; forslag.sikker = !!forslag.nyt_lead.firmanavn;
    } else if (forslag.maal_type === "mig_selv") {
      forslag.maal_navn = "Til mig selv"; forslag.sikker = true;
    } else {
      // Nøglen (P12) eller det lange id, hvis modellen alligevel brugte det.
      const id = String(forslag.maal_id ?? "").trim();
      let hit: Kandidat | undefined = forslag.maal_type === "ny_person" ? undefined
        : alle.find(a => a.noegle.toLowerCase() === id.toLowerCase() || a.id === id);
      // "Ny person", men navnet findes allerede: så er det den eksisterende person.
      if (!hit && forslag.maal_type === "ny_person") {
        hit = personMedNavn(forslag.ny_person_navn ?? "");
        if (hit) forslag.sikker = true;
      }
      // Ugyldig nøgle: find personen ud fra navnet i teksten, men lad Claus bekræfte.
      if (!hit && forslag.maal_type !== "ny_person") {
        hit = personITekst(transkript);
        forslag.sikker = false;
        if (hit) forslag.begrundelse = `Fandt ${hit.rent} i teksten. Tjek at det er rigtigt.`;
      }
      if (hit) Object.assign(forslag, { maal_type: hit.type, maal_id: hit.id, maal_navn: hit.navn });
      else if (forslag.maal_type !== "ny_person") { forslag.maal_type = "ny_person"; forslag.ny_person_navn ??= ""; }
    }
    return json({ forslag });
  } catch (e) {
    const m = (e as Error).message ?? "";
    // deno-lint-ignore no-explicit-any
    const status = (e as any)?.status;
    console.error("struktur-note fejlede:", status, m);
    if (status === 401 || /api[_ -]?key|authentication/i.test(m)) return json({ fejl: "API-nøglen til Claude mangler eller er ugyldig i Supabase." }, 500);
    if (/credit|billing|balance/i.test(m)) return json({ fejl: "Claude-kontoen mangler kredit. Fyld op på console.anthropic.com." }, 502);
    if (status === 429) return json({ fejl: "Claude har travlt lige nu. Prøv igen om et øjeblik." }, 502);
    return json({ fejl: `Claude kunne ikke sortere noten (${status ?? "ukendt"}): ${m.slice(0, 160)}` }, 502);
  }
});

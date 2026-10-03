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
      maal_type: { type: "string", enum: ["person", "projekt", "ny_person"], description: "Hvad noten skal gemmes på." },
      maal_id: { type: "string", description: "id fra listen. Udelades ved ny_person." },
      ny_person_navn: { type: "string", description: "Fulde navn, kun ved ny_person." },
      note: { type: "string", description: "Renskrevet note på dansk i jeg-form, uden dato. Bevar ALLE konkrete detaljer (navne, familie, tal, aftaler)." },
      opgaver: {
        type: "array",
        description: "Kun ting Claus selv har lovet eller skal gøre. Tom liste hvis ingen.",
        items: {
          type: "object",
          properties: {
            tekst: { type: "string", description: "Kort og handlingsrettet, fx 'Send Ole oplægget om AI i bestyrelser'." },
            forfald: { type: "string", description: "YYYY-MM-DD. Standard er i morgen." },
          },
          required: ["tekst", "forfald"],
        },
      },
      naeste_skridt: {
        type: "object",
        description: "Kun hvis maal_type er projekt og noten tydeligt peger på et nyt næste skridt.",
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

  let body: { transkript?: string; idag?: string };
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

  // deno-lint-ignore no-explicit-any
  const personer = (pe.data as any[]).map(p => `person | ${p.id} | ${p.navn}${p.firma ? " | " + p.firma.firmanavn : ""} | ${p.kategori}`);
  // deno-lint-ignore no-explicit-any
  const projekter = (pr.data as any[]).map(p => `projekt | ${p.id} | ${p.firma?.firmanavn ?? p.produkt}${p.firma?.kontaktperson ? " | kontakt: " + p.firma.kontaktperson : ""} | ${p.stage}`);

  const system = `Du hjælper Claus, en dansk AI-rådgiver og relationsmand, med at gemme noter efter møder.
I dag er ${idag}. Regn relative datoer ("på fredag", "om en uge") om til YYYY-MM-DD ud fra det.

Vælg målet for noten:
- Handler noten om en navngiven PERSON, så vælg personen fra listen, også selvom personen er kontakt på et projekt.
- Handler den om et firma eller en aftale uden en person på listen, så vælg projektet.
- Findes personen ikke, så brug ny_person med det fulde navn, Claus nævner.
- Er du i tvivl mellem flere, så sæt sikker=false og vælg det bedste bud.

Opgaver er KUN ting, Claus selv har lovet eller skal gøre. Ikke ting, den anden person skal gøre.
Brug kun id'er fra listen nedenfor. Opfind aldrig id'er.

LISTE (type | id | navn | detaljer):
${[...personer, ...projekter].join("\n")}`;

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 1500,
      system,
      // deno-lint-ignore no-explicit-any
      tools: [tool as any],
      tool_choice: { type: "tool", name: "gem_note" },
      messages: [{ role: "user", content: `Claus har indtalt:\n\n"""${transkript}"""` }],
    });
    const use = msg.content.find(c => c.type === "tool_use");
    if (!use || use.type !== "tool_use") return json({ fejl: "Claude svarede ikke som forventet." }, 502);
    // deno-lint-ignore no-explicit-any
    const forslag = use.input as any;

    // Tjek at id'et faktisk findes, og find et læsbart navn til appen.
    const alle = [
      // deno-lint-ignore no-explicit-any
      ...(pe.data as any[]).map(p => ({ type: "person", id: p.id, navn: p.navn + (p.firma ? ` · ${p.firma.firmanavn}` : "") })),
      // deno-lint-ignore no-explicit-any
      ...(pr.data as any[]).map(p => ({ type: "projekt", id: p.id, navn: p.firma?.firmanavn ?? p.produkt })),
    ];
    if (forslag.maal_type !== "ny_person") {
      const hit = alle.find(a => a.id === forslag.maal_id && a.type === forslag.maal_type);
      if (!hit) { forslag.maal_type = "ny_person"; forslag.sikker = false; forslag.ny_person_navn ??= ""; }
      else forslag.maal_navn = hit.navn;
    }
    return json({ forslag });
  } catch (e) {
    const m = (e as Error).message ?? "";
    if (/api[_ -]?key|authentication|401/i.test(m)) return json({ fejl: "API-nøglen til Claude mangler eller er ugyldig i Supabase." }, 500);
    return json({ fejl: "Claude kunne ikke sortere noten lige nu. Prøv igen." }, 502);
  }
});

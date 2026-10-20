// transskriber: tager en lydoptagelse fra mikrofonen i Puls og skriver den om til tekst.
// Selve talegenkendelsen sker hos OpenAI (Whisper) på Claus' egen konto, med nøglen OPENAI_API_KEY
// fra Supabase' hemmeligheder. Funktionen gemmer intet: lyden sendes videre, teksten sendes tilbage.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAKS = 24 * 1024 * 1024; // OpenAI tager højst 25 MB (ca. 25 minutters tale)

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

  const noegle = Deno.env.get("OPENAI_API_KEY");
  if (!noegle) {
    return json({ kode: "ingen_noegle", fejl: "Optagelse er ikke sat op endnu (OPENAI_API_KEY mangler i Supabase)." }, 503);
  }

  let lyd: File;
  try {
    const form = await req.formData();
    const f = form.get("lyd");
    if (!(f instanceof File)) return json({ fejl: "Der kom ingen lyd med." }, 400);
    lyd = f;
  } catch { return json({ fejl: "Ugyldig forespørgsel." }, 400); }
  if (lyd.size < 500) return json({ tekst: "" });              // et tryk uden tale
  if (lyd.size > MAKS) return json({ fejl: "Optagelsen er for lang. Del den op." }, 413);

  // Navnene i Puls gives med som stavehjælp, så Whisper skriver fx "Christian Tvede" og "Velatir" rigtigt.
  const [pe, vi] = await Promise.all([
    sb.from("personer").select("navn").order("sidste_kontakt", { ascending: false, nullsFirst: false }).limit(80),
    sb.from("virksomheder").select("firmanavn").limit(80),
  ]);
  const navne = [
    "Tacet", "Velatir", "Puls",
    ...((pe.data ?? []) as { navn: string }[]).map(p => p.navn),
    ...((vi.data ?? []) as { firmanavn: string }[]).map(v => v.firmanavn?.trim()),
  ].filter(Boolean);
  let stavehjaelp = "";
  for (const n of navne) { if ((stavehjaelp + n).length > 500) break; stavehjaelp += (stavehjaelp ? ", " : "") + n; }

  const ud = new FormData();
  ud.append("file", lyd, lyd.name || "lyd.mp4");
  ud.append("model", Deno.env.get("TRANSSKRIPTION_MODEL") ?? "whisper-1");
  ud.append("language", "da");
  ud.append("prompt", `Noter efter møder. Navne: ${stavehjaelp}.`);

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${noegle}` },
    body: ud,
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("OpenAI-fejl:", r.status, t.slice(0, 300));
    if (r.status === 401) return json({ fejl: "OpenAI-nøglen er ugyldig. Tjek OPENAI_API_KEY i Supabase." }, 502);
    if (r.status === 429) return json({ fejl: "OpenAI-kontoen mangler kredit eller har travlt. Prøv igen om lidt." }, 502);
    return json({ fejl: `Talegenkendelsen fejlede (${r.status}). Prøv igen.` }, 502);
  }
  const svar = await r.json() as { text?: string };
  return json({ tekst: (svar.text ?? "").trim() });
});

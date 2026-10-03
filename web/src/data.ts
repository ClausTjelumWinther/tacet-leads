import { supabase } from "./supabase";
import { stamp, today } from "./dates";

// ---------- Typer: sådan ser rækkerne ud, når de kommer fra databasen ----------

export type Stage = "lead" | "dialog" | "tilbud" | "kunde" | "netvaerk" | "tabt";

export interface Projekt {
  id: string;
  virksomhed_id: string | null;
  produkt: string;
  stage: Stage;
  vaerdi: number | null;
  naeste_skridt: string | null;
  naeste_skridt_dato: string | null;
  noter: string | null;
  velatir: boolean;
  firma: { firmanavn: string; kontaktperson: string | null; email: string | null; mobilnummer: string | null; over20: boolean | null } | null;
}

export interface Person {
  id: string;
  navn: string;
  kategori: "privat" | "netvaerk" | "kunde";
  virksomhed_id: string | null;
  email: string | null;
  mobilnummer: string | null;
  noter: string | null;
  sidste_kontakt: string | null;
  firma: { firmanavn: string } | null;
}

export interface Opgave {
  id: string;
  tekst: string;
  forfald: string | null;
  person: { navn: string } | null;
  projekt: { firma: { firmanavn: string } | null } | null;
}

/** Fakta fra Gmail og kalenderen, skrevet af morgen-gennemgangen. */
export interface Haendelse {
  id: string;
  dato: string;
  type: "mail_ind" | "mail_ud" | "moede" | "levering" | "invitation";
  titel: string;
  email: string | null;
  person_id: string | null;
  projekt_id: string | null;
}

/** Noget Claude foreslår, som kræver dit ja (ny kontakt, nyt næste skridt, nyt løfte). */
export interface ClaudeForslag {
  id: string;
  type: "ny_person" | "naeste_skridt" | "opgave";
  tekst: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  person_id: string | null;
  projekt_id: string | null;
}

// ---------- Mål ----------
export interface Maal {
  id: string; periode: string; start: string; slut: string; fokus: string | null;
  noegle: string; titel: string; maal: number | null; perfekt: number | null; enhed: string | null; sortering: number;
}
export interface Maaling { dato: string; noegle: string; vaerdi: number; detaljer: { dato?: string; titel?: string; dage?: number; timer?: number }[] }
export interface Arrangement { id: string; navn: string; dato: string; sted: string | null }
export type DeltagerStatus = "inviteret" | "tilmeldt" | "afbud" | "moedt";
export interface Deltager {
  id: string; arrangement_id: string; navn: string; email: string | null;
  person_id: string | null; projekt_id: string | null; status: DeltagerStatus;
}
/** Alle løfter (også de klarede), så vi kan måle "holdt inden 48 timer". */
export interface LoefteStat { oprettet: string; faerdig: boolean; faerdig_dato: string | null }

export interface Data {
  projekter: Projekt[];
  personer: Person[];
  opgaver: Opgave[];
  haendelser: Haendelse[];
  forslag: ClaudeForslag[];
  maal: Maal[];
  maalinger: Maaling[];
  arrangementer: Arrangement[];
  deltagere: Deltager[];
  loefter: LoefteStat[];
}

export const STAGES: Record<Stage, string> = {
  tilbud: "Tilbud", dialog: "Dialog", lead: "Lead", kunde: "Kunde", netvaerk: "Netværk", tabt: "Tabt",
};
export const ACTIVE: Stage[] = ["tilbud", "dialog", "lead"];
export const KATEGORI: Record<Person["kategori"], string> = { privat: "Privat", netvaerk: "Netværk", kunde: "Kunde" };

// ---------- Læsning ----------

/** Henter alt på én gang. Navnet før kolon ("firma:") omdøber den tilknyttede tabel. */
export async function loadAll(): Promise<Data> {
  const [p, pe, o, h, f, m, ml, ar, de, lo] = await Promise.all([
    supabase.from("projekter").select(
      "id, virksomhed_id, produkt, stage, vaerdi, naeste_skridt, naeste_skridt_dato, noter, velatir, " +
      "firma:virksomheder(firmanavn, kontaktperson, email, mobilnummer, over20)"),
    supabase.from("personer").select(
      "id, navn, kategori, virksomhed_id, email, mobilnummer, noter, sidste_kontakt, firma:virksomheder(firmanavn)"),
    supabase.from("opgaver").select(
      "id, tekst, forfald, person:personer(navn), projekt:projekter(firma:virksomheder(firmanavn))").eq("faerdig", false),
    supabase.from("haendelser").select("id, dato, type, titel, email, person_id, projekt_id")
      .order("dato", { ascending: false }).limit(1000),
    supabase.from("forslag").select("id, type, tekst, data, person_id, projekt_id").eq("status", "aaben").order("oprettet"),
    supabase.from("maal").select("*").order("sortering"),
    supabase.from("maalinger").select("dato, noegle, vaerdi, detaljer").order("dato", { ascending: false }).limit(200),
    supabase.from("arrangementer").select("id, navn, dato, sted").order("dato"),
    supabase.from("deltagere").select("id, arrangement_id, navn, email, person_id, projekt_id, status").order("navn"),
    supabase.from("opgaver").select("oprettet, faerdig, faerdig_dato"),
  ]);
  const err = p.error || pe.error || o.error || h.error || f.error || m.error || ml.error || ar.error || de.error || lo.error;
  if (err) throw err;
  return {
    projekter: (p.data ?? []) as unknown as Projekt[],
    personer: (pe.data ?? []) as unknown as Person[],
    opgaver: (o.data ?? []) as unknown as Opgave[],
    haendelser: (h.data ?? []) as Haendelse[],
    forslag: (f.data ?? []) as ClaudeForslag[],
    maal: (m.data ?? []) as Maal[],
    maalinger: (ml.data ?? []) as Maaling[],
    arrangementer: (ar.data ?? []) as Arrangement[],
    deltagere: (de.data ?? []) as Deltager[],
    loefter: (lo.data ?? []) as LoefteStat[],
  };
}

// ---------- Skrivning ----------

/** Lægger en dateret note øverst. Vi læser den nyeste udgave først, så intet overskrives. */
export async function addNote(kind: "projekt" | "person", id: string, text: string): Promise<void> {
  const table = kind === "projekt" ? "projekter" : "personer";
  const { data, error } = await supabase.from(table).select("noter").eq("id", id).single();
  if (error) throw error;
  const line = `${stamp()}: ${text.trim()}`;
  const noter = data?.noter ? `${line}\n${data.noter}` : line;
  const patch: Record<string, string> = { noter };
  if (kind === "person") patch.sidste_kontakt = today();
  const res = await supabase.from(table).update(patch).eq("id", id);
  if (res.error) throw res.error;
}

export async function moveNextStep(id: string, date: string): Promise<void> {
  const { error } = await supabase.from("projekter").update({ naeste_skridt_dato: date }).eq("id", id);
  if (error) throw error;
}

export async function completeTask(id: string): Promise<void> {
  const { error } = await supabase.from("opgaver").update({ faerdig: true, faerdig_dato: today() }).eq("id", id);
  if (error) throw error;
}

/** Opretter en ny privat person med en første note. Returnerer det nye id. */
export async function createPerson(navn: string, note: string): Promise<string> {
  const { data, error } = await supabase.from("personer")
    .insert({ navn: navn.trim(), kategori: "privat", noter: `${stamp()}: ${note.trim()}`, sidste_kontakt: today() })
    .select("id").single();
  if (error) throw error;
  return data.id as string;
}

// ---------- Mikrofonen: Claude sorterer, du godkender ----------

export interface Forslag {
  maal_type: "person" | "projekt" | "ny_person";
  maal_id?: string;
  maal_navn?: string;
  ny_person_navn?: string;
  note: string;
  opgaver: { tekst: string; forfald: string }[];
  naeste_skridt?: { tekst: string; dato: string };
  sikker: boolean;
  begrundelse: string;
}

/** Sender den indtalte tekst til edge-funktionen "struktur-note". Den skriver intet selv. */
/** Kender appen allerede personen/projektet (fast), skal Claude kun stramme teksten op og finde løfterne. */
export async function structure(transkript: string, fast?: { type: "person" | "projekt"; id: string }): Promise<Forslag> {
  const { data, error } = await supabase.functions.invoke("struktur-note", { body: { transkript, idag: today(), fast } });
  if (error) {
    // Funktionen svarer med {fejl: "..."} på dansk. Vi prøver at læse den ud af svaret.
    let fejl = "";
    try { const ctx = (error as { context?: Response }).context; fejl = (await ctx?.json())?.fejl ?? ""; } catch { /* intet læsbart svar */ }
    throw new Error(fejl || "Kunne ikke kontakte AI-funktionen. Tjek forbindelsen og prøv igen.");
  }
  if (data?.fejl) throw new Error(data.fejl);
  return data.forslag as Forslag;
}

export async function createTask(tekst: string, forfald: string, link: { person_id?: string; projekt_id?: string }): Promise<void> {
  const { error } = await supabase.from("opgaver").insert({ tekst, forfald, ...link });
  if (error) throw error;
}

/** Det nuværende skridt er klaret: skriv det i historikken og sæt det næste. */
export async function completeStep(id: string, gammelt: string | null, tekst: string, dato: string): Promise<void> {
  if (gammelt?.trim()) await addNote("projekt", id, `Klaret: ${gammelt.trim()}`);
  await setNextStep(id, tekst, dato);
}

export async function setNextStep(id: string, tekst: string, dato: string): Promise<void> {
  const { error } = await supabase.from("projekter").update({ naeste_skridt: tekst, naeste_skridt_dato: dato }).eq("id", id);
  if (error) throw error;
}

// ---------- Forslag fra morgen-gennemgangen ----------

/** Siger du ja, udfører appen forslaget. Først derefter ændres noget i dine data. */
export async function acceptForslag(f: ClaudeForslag): Promise<void> {
  if (f.type === "ny_person") {
    const { navn, email, kategori, virksomhed_id, note } = f.data ?? {};
    const { data, error } = await supabase.from("personer").insert({
      navn, email: email || null, kategori: kategori || "netvaerk", virksomhed_id: virksomhed_id || null,
      noter: note ? `${stamp()}: ${note}` : null,
    }).select("id").single();
    if (error) throw error;
    // Kobl de mails og invitationer på, der allerede er registreret med samme adresse.
    if (email) await supabase.from("haendelser").update({ person_id: data.id }).ilike("email", email).is("person_id", null);
  } else if (f.type === "naeste_skridt" && f.projekt_id) {
    await setNextStep(f.projekt_id, f.data.tekst, f.data.dato);
  } else if (f.type === "opgave") {
    const link: { person_id?: string; projekt_id?: string } = {};
    if (f.person_id) link.person_id = f.person_id;
    if (f.projekt_id) link.projekt_id = f.projekt_id;
    await createTask(f.data.tekst, f.data.forfald ?? today(), link);
  }
  await markForslag(f.id, "godkendt");
}

export async function rejectForslag(f: ClaudeForslag): Promise<void> {
  await markForslag(f.id, "afvist");
}

async function markForslag(id: string, status: "godkendt" | "afvist") {
  const { error } = await supabase.from("forslag").update({ status, behandlet: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** Mails og møder for en person eller et projekt, nyeste først. */
export function haendelserFor(data: Data, k: { person?: Person; projekt?: Projekt }): Haendelse[] {
  const mail = k.person?.email?.toLowerCase();
  const kolleger = k.projekt ? data.personer.filter(x => x.virksomhed_id && x.virksomhed_id === k.projekt!.virksomhed_id).map(x => x.id) : [];
  return data.haendelser.filter(h =>
    (k.person && (h.person_id === k.person.id || (!!mail && h.email?.toLowerCase() === mail))) ||
    (k.projekt && (h.projekt_id === k.projekt.id || (!!h.person_id && kolleger.includes(h.person_id)))));
}

// ---------- Mål: små rettelser fra fanen ----------

export async function setDeltagerStatus(id: string, status: DeltagerStatus): Promise<void> {
  const { error } = await supabase.from("deltagere").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Over 20 funktionærer? true/false, eller null hvis du ikke ved det. */
export async function setOver20(virksomhedId: string, over20: boolean | null): Promise<void> {
  const { error } = await supabase.from("virksomheder").update({ over20 }).eq("id", virksomhedId);
  if (error) throw error;
}

// ---------- Hjælpere ----------

export const projectName = (p: Projekt) => p.firma?.firmanavn?.trim() || p.produkt;

/** Forståelige fejlbeskeder på dansk. */
export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? "";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Ingen forbindelse. Tjek internettet og prøv igen.";
  if (/JWT|session|auth/i.test(msg)) return "Dit login er udløbet. Log ind igen.";
  if (/permission|policy|row-level/i.test(msg)) return "Din bruger har ikke adgang. Tjek at den har admin-rollen.";
  return msg ? `Noget gik galt: ${msg}` : "Noget gik galt. Prøv igen.";
}

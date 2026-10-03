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
  firma: { firmanavn: string; kontaktperson: string | null; email: string | null; mobilnummer: string | null } | null;
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

export interface Data {
  projekter: Projekt[];
  personer: Person[];
  opgaver: Opgave[];
}

export const STAGES: Record<Stage, string> = {
  tilbud: "Tilbud", dialog: "Dialog", lead: "Lead", kunde: "Kunde", netvaerk: "Netværk", tabt: "Tabt",
};
export const ACTIVE: Stage[] = ["tilbud", "dialog", "lead"];
export const KATEGORI: Record<Person["kategori"], string> = { privat: "Privat", netvaerk: "Netværk", kunde: "Kunde" };

// ---------- Læsning ----------

/** Henter alt på én gang. Navnet før kolon ("firma:") omdøber den tilknyttede tabel. */
export async function loadAll(): Promise<Data> {
  const [p, pe, o] = await Promise.all([
    supabase.from("projekter").select(
      "id, virksomhed_id, produkt, stage, vaerdi, naeste_skridt, naeste_skridt_dato, noter, velatir, " +
      "firma:virksomheder(firmanavn, kontaktperson, email, mobilnummer)"),
    supabase.from("personer").select(
      "id, navn, kategori, virksomhed_id, email, mobilnummer, noter, sidste_kontakt, firma:virksomheder(firmanavn)"),
    supabase.from("opgaver").select(
      "id, tekst, forfald, person:personer(navn), projekt:projekter(firma:virksomheder(firmanavn))").eq("faerdig", false),
  ]);
  const err = p.error || pe.error || o.error;
  if (err) throw err;
  return {
    projekter: (p.data ?? []) as unknown as Projekt[],
    personer: (pe.data ?? []) as unknown as Person[],
    opgaver: (o.data ?? []) as unknown as Opgave[],
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
export async function structure(transkript: string): Promise<Forslag> {
  const { data, error } = await supabase.functions.invoke("struktur-note", { body: { transkript, idag: today() } });
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

export async function setNextStep(id: string, tekst: string, dato: string): Promise<void> {
  const { error } = await supabase.from("projekter").update({ naeste_skridt: tekst, naeste_skridt_dato: dato }).eq("id", id);
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

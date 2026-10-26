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
  dato: string | null;              // hvornår projektet blev solgt/startede
  genkoeb: string | null;           // næste oplagte salg hos en kunde
  sidste_leverance: string | null;  // hvornår vi sidst leverede
  firma: {
    firmanavn: string; kontaktperson: string | null; email: string | null; mobilnummer: string | null; over20: boolean | null;
    // Til fakturering. fakturanavn er det juridiske navn, hvis det er et andet end firmanavn (fx VSG).
    fakturanavn: string | null; cvr: string | null; adresse: string | null; postnummer: string | null; by: string | null;
  } | null;
}

export interface Person {
  id: string;
  navn: string;
  kategori: "privat" | "netvaerk" | "kunde";
  virksomhed_id: string | null;
  email: string | null;
  mobilnummer: string | null;
  linkedin: string | null;          // link til LinkedIn-profilen
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
export interface Arrangement { id: string; navn: string; dato: string; sted: string | null; rolle: "vaert" | "gaest" }
export type DeltagerStatus = "inviteret" | "tilmeldt" | "afbud" | "moedt";
export interface Deltager {
  id: string; arrangement_id: string; navn: string; email: string | null;
  person_id: string | null; projekt_id: string | null; status: DeltagerStatus;
}
/** Alle løfter (også de klarede), så vi kan måle "holdt inden 48 timer". */
export interface Opslag { id: string; dato: string; tekst: string | null; url: string | null }
/** Alle løfter, også de klarede: bruges til "holdt inden 48 timer" og til status på kortene. */
export interface LoefteStat {
  id: string; tekst: string; person_id: string | null; projekt_id: string | null;
  forfald: string | null; oprettet: string; faerdig: boolean; faerdig_dato: string | null;
}

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
  opslag: Opslag[];
  /** Små ting du selv skal huske (til_mig = true). Ikke løfter. */
  mine: Opgave[];
}

export const STAGES: Record<Stage, string> = {
  tilbud: "Tilbud", dialog: "Dialog", lead: "Lead", kunde: "Kunde", netvaerk: "Netværk", tabt: "Tabt",
};
export const ACTIVE: Stage[] = ["tilbud", "dialog", "lead"];
export const KATEGORI: Record<Person["kategori"], string> = { privat: "Privat", netvaerk: "Netværk", kunde: "Kunde" };

// ---------- Læsning ----------

/** Henter alt på én gang. Navnet før kolon ("firma:") omdøber den tilknyttede tabel. */
export async function loadAll(): Promise<Data> {
  const [p, pe, o, h, f, m, ml, ar, de, lo, op, mi] = await Promise.all([
    supabase.from("projekter").select(
      "id, virksomhed_id, produkt, stage, vaerdi, naeste_skridt, naeste_skridt_dato, noter, velatir, dato, genkoeb, sidste_leverance, " +
      "firma:virksomheder(firmanavn, kontaktperson, email, mobilnummer, over20, fakturanavn, cvr, adresse, postnummer, by)"),
    supabase.from("personer").select(
      "id, navn, kategori, virksomhed_id, email, mobilnummer, linkedin, noter, sidste_kontakt, firma:virksomheder(firmanavn)"),
    supabase.from("opgaver").select(
      "id, tekst, forfald, person:personer(navn), projekt:projekter(firma:virksomheder(firmanavn))").eq("faerdig", false).eq("til_mig", false),
    supabase.from("haendelser").select("id, dato, type, titel, email, person_id, projekt_id")
      .order("dato", { ascending: false }).limit(1000),
    supabase.from("forslag").select("id, type, tekst, data, person_id, projekt_id").eq("status", "aaben").order("oprettet"),
    supabase.from("maal").select("*").order("sortering"),
    supabase.from("maalinger").select("dato, noegle, vaerdi, detaljer").order("dato", { ascending: false }).limit(200),
    supabase.from("arrangementer").select("id, navn, dato, sted, rolle").order("dato"),
    supabase.from("deltagere").select("id, arrangement_id, navn, email, person_id, projekt_id, status").order("navn"),
    supabase.from("opgaver").select("id, tekst, person_id, projekt_id, forfald, oprettet, faerdig, faerdig_dato").eq("til_mig", false).order("oprettet", { ascending: false }),
    supabase.from("opslag").select("id, dato, tekst, url").order("dato", { ascending: false }),
    // Dine egne huskepunkter holdes adskilt fra løfterne ovenfor.
    supabase.from("opgaver").select("id, tekst, forfald").eq("faerdig", false).eq("til_mig", true).order("oprettet"),
  ]);
  const err = p.error || pe.error || o.error || h.error || f.error || m.error || ml.error || ar.error || de.error || lo.error || op.error || mi.error;
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
    mine: ((mi.data ?? []) as { id: string; tekst: string; forfald: string | null }[]).map(x => ({ ...x, person: null, projekt: null })),
    opslag: (op.data ?? []) as Opslag[],
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
  maal_type: "person" | "projekt" | "ny_person" | "mig_selv" | "nyt_lead";
  /** Kun ved nyt_lead: det, Claude fandt i teksten. Du retter det i appen før Gem. */
  nyt_lead?: { firmanavn: string; kontaktperson?: string; email?: string; mobil?: string; produkt?: string };
  maal_id?: string;
  maal_navn?: string;
  ny_person_navn?: string;
  note: string;
  opgaver: { tekst: string; forfald: string }[];
  naeste_skridt?: { tekst: string; dato: string };
  sikker: boolean;
  begrundelse: string;
}

/** Sender en lydoptagelse til edge-funktionen "transskriber" og får teksten tilbage.
 *  Fejlen har `kode = "ingen_noegle"`, hvis optagelse ikke er sat op endnu. */
export async function transcribe(lyd: Blob, filnavn: string): Promise<string> {
  const form = new FormData();
  form.append("lyd", lyd, filnavn);
  const { data, error } = await supabase.functions.invoke("transskriber", { body: form });
  if (error) {
    let svar: { fejl?: string; kode?: string } = {};
    try { svar = (await (error as { context?: Response }).context?.json()) ?? {}; } catch { /* intet læsbart svar */ }
    throw Object.assign(new Error(svar.fejl || "Kunne ikke sende optagelsen. Tjek forbindelsen og prøv igen."), { kode: svar.kode });
  }
  if (data?.fejl) throw Object.assign(new Error(data.fejl), { kode: data.kode });
  return (data?.tekst ?? "") as string;
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
/** Et huskepunkt til dig selv. Dato er valgfri: meget er bare "en dag". */
export async function createMine(tekst: string, forfald: string | null = null): Promise<void> {
  const { error } = await supabase.from("opgaver").insert({ tekst, forfald, til_mig: true });
  if (error) throw error;
}

export async function completeStep(id: string, gammelt: string | null, tekst: string, dato: string): Promise<void> {
  if (gammelt?.trim()) await addNote("projekt", id, `Klaret: ${gammelt.trim()}`);
  await setNextStep(id, tekst, dato);
}

/** Det, der skal til for at oprette et nyt lead. Firma, næste skridt og dato er påkrævet. */
export interface NytLead {
  firmanavn: string;
  kontaktperson?: string;
  email?: string;
  mobil?: string;
  produkt?: string;          // hvad det handler om, fx "AI sparring". Tom = "AI"
  naeste_skridt: string;
  naeste_skridt_dato: string;
  note?: string;
}

/** Opretter firma + projekt (stage lead). Er der en kontaktperson, oprettes hun også under Personer.
 *  Returnerer projektets id, så noter og løfter kan hænges på det. */
export async function createLead(l: NytLead): Promise<string> {
  const ren = (x?: string) => (x ?? "").trim() || null;
  const email = ren(l.email);
  // Domænet bruges af morgen-gennemgangen til at finde mails fra firmaet.
  // Brede domæner (gmail.com o.l.) giver ingen mening at matche på.
  const dom = email?.split("@")[1]?.toLowerCase() ?? null;
  const bred = !dom || /^(gmail|hotmail|outlook|live|icloud|yahoo|me|mail)\./.test(dom);

  const v = await supabase.from("virksomheder").insert({
    firmanavn: l.firmanavn.trim(), kontaktperson: ren(l.kontaktperson), email, mobilnummer: ren(l.mobil),
    domaene: bred ? null : dom,
  }).select("id").single();
  if (v.error) throw v.error;

  const p = await supabase.from("projekter").insert({
    virksomhed_id: v.data.id, produkt: ren(l.produkt) ?? "AI", stage: "lead",
    naeste_skridt: l.naeste_skridt.trim(), naeste_skridt_dato: l.naeste_skridt_dato,
    noter: ren(l.note) ? `${stamp()}: ${l.note!.trim()}` : null,
  }).select("id").single();
  if (p.error) throw p.error;

  if (ren(l.kontaktperson)) {
    const pe = await supabase.from("personer").insert({
      navn: l.kontaktperson!.trim(), email, mobilnummer: ren(l.mobil), kategori: "kunde",
      virksomhed_id: v.data.id, sidste_kontakt: today(),
    });
    if (pe.error) throw pe.error;
  }
  return p.data.id as string;
}

/** En netværksperson: en, der kan skaffe dig kunder, men ikke selv bliver kunde. */
export interface NyNetvaerk {
  navn: string;
  firma?: string;            // hvor personen arbejder. Tom = kortet hedder personens navn
  email?: string;
  mobil?: string;
  naeste_skridt: string;
  naeste_skridt_dato: string;
  note?: string;
}

/** Opretter personen (kategori netværk) og et kort under Netværk med næste skridt.
 *  Kortet hænger på en virksomhed, ligesom leads, så det kan vises sammen med de andre. */
export async function createNetvaerk(n: NyNetvaerk): Promise<void> {
  const ren = (x?: string) => (x ?? "").trim() || null;
  const email = ren(n.email);
  const firma = ren(n.firma);
  // Domænet giver kun mening, når der er et firma og en firmamail (ikke gmail.com o.l.).
  const dom = email?.split("@")[1]?.toLowerCase() ?? null;
  const bred = !firma || !dom || /^(gmail|hotmail|outlook|live|icloud|yahoo|me|mail)\./.test(dom);

  const v = await supabase.from("virksomheder").insert({
    firmanavn: firma ?? n.navn.trim(), kontaktperson: n.navn.trim(), email, mobilnummer: ren(n.mobil),
    domaene: bred ? null : dom,
  }).select("id").single();
  if (v.error) throw v.error;

  const p = await supabase.from("projekter").insert({
    virksomhed_id: v.data.id, produkt: "Netværk", stage: "netvaerk",
    naeste_skridt: n.naeste_skridt.trim(), naeste_skridt_dato: n.naeste_skridt_dato,
  });
  if (p.error) throw p.error;

  const pe = await supabase.from("personer").insert({
    navn: n.navn.trim(), email, mobilnummer: ren(n.mobil), kategori: "netvaerk", virksomhed_id: v.data.id,
    noter: ren(n.note) ? `${stamp()}: ${n.note!.trim()}` : null, sidste_kontakt: today(),
  });
  if (pe.error) throw pe.error;
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

/** Registrér et LinkedIn-opslag (fra fanen Mål). */
export async function addOpslag(dato: string, tekst: string, url: string): Promise<void> {
  const { error } = await supabase.from("opslag").insert({ dato, tekst: tekst.trim() || null, url: url.trim() || null });
  if (error) throw error;
}

/** Genkøbsidé og sidste leverance på en kunde. */
export async function setGenkoeb(id: string, genkoeb: string, sidste_leverance: string | null): Promise<void> {
  const { error } = await supabase.from("projekter")
    .update({ genkoeb: genkoeb.trim() || null, sidste_leverance: sidste_leverance || null }).eq("id", id);
  if (error) throw error;
}

/** Gemmer LinkedIn-linket på en person. Mangler https://, sættes det på. Tomt felt fjerner linket. */
export async function setLinkedin(person_id: string, url: string): Promise<void> {
  let u = url.trim();
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  const { error } = await supabase.from("personer").update({ linkedin: u || null }).eq("id", person_id);
  if (error) throw error;
}

export interface Faktura { fakturanavn: string; cvr: string; adresse: string; postnummer: string; by: string }

/** Gemmer faktureringsoplysningerne på virksomheden. Tomme felter gemmes som tomme. */
export async function setFaktura(virksomhed_id: string, f: Faktura): Promise<void> {
  const ren = (x: string) => x.trim() || null;
  const { error } = await supabase.from("virksomheder").update({
    fakturanavn: ren(f.fakturanavn), cvr: ren(f.cvr), adresse: ren(f.adresse), postnummer: ren(f.postnummer), by: ren(f.by),
  }).eq("id", virksomhed_id);
  if (error) throw error;
}

/** Skift status (stage) på et projekt. Skiftet skrives også i historikken, så du kan se, hvornår det skete.
 *  Bliver det til kunde for første gang, sættes salgsdatoen til i dag. */
export async function setStage(p: Projekt, stage: Stage): Promise<void> {
  if (p.stage === stage) return;
  const linje = `${stamp()}: Status: ${STAGES[p.stage]} → ${STAGES[stage]}`;
  const patch: Record<string, unknown> = { stage, noter: p.noter ? `${linje}\n${p.noter}` : linje };
  if (stage === "kunde" && !p.dato) patch.dato = today();
  const { error } = await supabase.from("projekter").update(patch).eq("id", p.id);
  if (error) throw error;
}

/** Sæt eller fjern Velatir-markeringen på et projekt (peger på et Velatir-abonnement). */
export async function setVelatir(id: string, velatir: boolean): Promise<void> {
  const { error } = await supabase.from("projekter").update({ velatir }).eq("id", id);
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

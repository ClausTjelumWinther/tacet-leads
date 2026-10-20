import { useEffect, useMemo, useRef, useState } from "react";
import {
  addNote, createLead, createMine, createPerson, createTask, errorText, projectName, setNextStep, structure,
  type Data, type Forslag, type NytLead,
} from "./data";
import LeadFields, { DubletAdvarsel, leadMangler, tomtLead } from "./LeadFields";
import { short } from "./dates";
import { canDictate, useDiktat } from "./Dictate";

// Mikrofonen i tre trin:
//   1. "lyt"      – telefonens talegenkendelse skriver det ned, mens du taler
//   2. "sorterer" – Claude finder personen, renser noten og finder dine løfter
//   3. "forslag"  – du ser forslaget, retter hvis nødvendigt og trykker Gem

type Step = "lyt" | "sorterer" | "forslag" | "gemmer";
type Target = { type: "person" | "projekt"; id: string; navn: string } | { type: "ny"; navn: string }
  | { type: "mig"; navn: string }    // "mig" = huskepunkt til dig selv (køb Sonos, tal med renseriet)
  | { type: "lead"; navn: string };  // "lead" = nyt firma i pipelinen; felterne står i `lead`
const MIG: Target = { type: "mig", navn: "Til mig selv" };

// ---------- Kladde: en indtalt note må aldrig forsvinde ----------
// Alt, hvad du har sagt, gemmes løbende i telefonens hukommelse (localStorage),
// indtil du trykker Gem eller Kassér. Lukker du skærmen, eller genstarter telefonen appen,
// ligger noten klar, næste gang du trykker på mikrofonen.
const KLADDE = "puls.indtalt-kladde";
interface Kladde {
  text: string; forslag: Forslag | null; target: Target | null; note: string;
  tasks: { tekst: string; forfald: string; med: boolean }[]; useNext: boolean; tid: number;
  lead?: NytLead;
}
function readDraft(): Kladde | null {
  try { const s = localStorage.getItem(KLADDE); return s ? JSON.parse(s) as Kladde : null; } catch { return null; }
}
function writeDraft(k: Kladde | null) {
  try { if (k) localStorage.setItem(KLADDE, JSON.stringify(k)); else localStorage.removeItem(KLADDE); } catch { /* ingen lagerplads */ }
}
/** Bruges af mikrofonknappen til at vise en prik, når der ligger en ikke-gemt note. */
export const hasDraft = () => !!readDraft();

// Kan browseren lytte direkte? (Ellers bruger man mikrofonen på tastaturet.)
const SpeechRec = canDictate;

export default function VoiceNote({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: () => Promise<void> }) {
  // Ligger der en kladde fra sidst, starter vi dér i stedet for at lytte.
  const [draft] = useState(readDraft);
  const [step, setStep] = useState<Step>(draft?.forslag ? "forslag" : "lyt");
  const [text, setText] = useState(draft?.text ?? "");   // det du har sagt (kan rettes)
  const [interim, setInterim] = useState("");    // det, der lige nu bliver genkendt
  const [error, setError] = useState("");
  const [forslag, setForslag] = useState<Forslag | null>(draft?.forslag ?? null);
  const [target, setTarget] = useState<Target | null>(draft?.target ?? null);
  const [note, setNote] = useState(draft?.note ?? "");
  const [tasks, setTasks] = useState<{ tekst: string; forfald: string; med: boolean }[]>(draft?.tasks ?? []);
  const [useNext, setUseNext] = useState(draft?.useNext ?? false);
  const [picking, setPicking] = useState(!!draft?.forslag && !draft.target);
  const [lead, setLead] = useState<NytLead>(draft?.lead ?? tomtLead());

  // Gem kladden, hver gang noget ændrer sig. Tom tekst = ingen kladde.
  const savedRef = useRef(false);
  const tidRef = useRef(draft?.tid ?? Date.now());
  useEffect(() => {
    if (savedRef.current) return;
    if (!text.trim() && !note.trim()) { writeDraft(null); return; }
    writeDraft({ text, forslag, target, note, tasks, useNext, tid: tidRef.current, lead });
  }, [text, forslag, target, note, tasks, useNext, lead]);

  function discard() { savedRef.current = true; writeDraft(null); stop(); onClose(); }

  // ---------- Trin 1: lyt ----------
  // Selve lytningen ligger i useDiktat (Dictate.tsx), så den store og den lille mikrofon opfører sig ens.
  const textRef = useRef(text);
  textRef.current = text;
  const diktat = useDiktat({
    hent: () => textRef.current,
    skriv: (t, live) => { setText(t); setInterim(live); },
  });
  const listening = diktat.lytter;
  const start = diktat.start;
  const stop = diktat.stop;
  useEffect(() => { if (diktat.fejl) setError(diktat.fejl); }, [diktat.fejl]);

  // Start med det samme, når skærmen åbnes. useDiktat slipper selv mikrofonen, når skærmen lukkes.
  useEffect(() => {
    if (SpeechRec && !draft) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Trin 2: Claude sorterer ----------
  async function sort() {
    stop();
    const t = text.trim();
    if (t.length < 3) { setError("Sig eller skriv lidt mere først."); return; }
    setStep("sorterer"); setError("");
    try {
      const f = await structure(t);
      setForslag(f);
      setNote(f.note);
      setTasks((f.opgaver ?? []).map(o => ({ ...o, med: true })));
      setUseNext(false); // næste skridt ændres kun, hvis du selv sætter flueben
      if (f.maal_type === "nyt_lead") {
        // Claude har fundet et nyt firma. Udfyld felterne; næste skridt flyttes over i leadet.
        const nl = f.nyt_lead ?? { firmanavn: "" };
        setLead({ ...tomtLead(nl.firmanavn), ...nl,
          naeste_skridt: f.naeste_skridt?.tekst ?? "", naeste_skridt_dato: f.naeste_skridt?.dato || tomtLead().naeste_skridt_dato });
      }
      setTarget(f.maal_type === "mig_selv" ? MIG
        : f.maal_type === "nyt_lead" ? { type: "lead", navn: f.nyt_lead?.firmanavn ?? "" }
        : f.maal_type === "ny_person" ? { type: "ny", navn: f.ny_person_navn ?? "" }
        : { type: f.maal_type as "person" | "projekt", id: f.maal_id!, navn: f.maal_navn ?? "" });
      setPicking(f.maal_type !== "mig_selv" && (!f.sikker || (f.maal_type === "ny_person" && !f.ny_person_navn)));
      setStep("forslag");
    } catch (e) {
      setError(errorText(e));
      setStep("lyt");
    }
  }

  // Hvis Claude ikke kan bruges lige nu: gem teksten som den er, og vælg selv personen.
  function manual() {
    stop();
    setForslag({ maal_type: "ny_person", note: text.trim(), opgaver: [], sikker: false, begrundelse: "" });
    setNote(text.trim()); setTasks([]); setTarget(null); setPicking(true); setStep("forslag"); setError("");
  }

  // ---------- Trin 3: gem ----------
  async function save() {
    if (!target || (target.type === "ny" && !target.navn.trim())) { setError("Vælg hvem noten handler om."); setPicking(true); return; }
    if (!note.trim()) { setError("Noten er tom."); return; }
    setStep("gemmer"); setError("");
    try {
      if (target.type === "mig") {
        // Til dig selv: hver ting bliver et huskepunkt. Fandt Claude ingen, bliver hele noten ét.
        const valgt = tasks.filter(t => t.med && t.tekst.trim());
        if (valgt.length) for (const t of valgt) await createMine(t.tekst.trim(), t.forfald || null);
        else await createMine(note.trim());
        savedRef.current = true; writeDraft(null); await onSaved(); onClose();
        return;
      }
      if (target.type === "lead") {
        const mangler = leadMangler(lead);
        if (mangler) { setError(mangler); setStep("forslag"); return; }
        // Firma + projekt + kontaktperson oprettes; noten og løfterne hænges på projektet.
        const projektId = await createLead({ ...lead, note });
        for (const t of tasks.filter(t => t.med && t.tekst.trim())) await createTask(t.tekst.trim(), t.forfald, { projekt_id: projektId });
        savedRef.current = true; writeDraft(null); await onSaved(); onClose();
        return;
      }
      let link: { person_id?: string; projekt_id?: string };
      if (target.type === "ny") link = { person_id: await createPerson(target.navn, note) };
      else {
        await addNote(target.type, target.id, note);
        link = target.type === "person" ? { person_id: target.id } : { projekt_id: target.id };
      }
      for (const t of tasks.filter(t => t.med && t.tekst.trim())) await createTask(t.tekst.trim(), t.forfald, link);
      if (useNext && target.type === "projekt" && forslag?.naeste_skridt) {
        await setNextStep(target.id, forslag.naeste_skridt.tekst, forslag.naeste_skridt.dato);
      }
      savedRef.current = true;
      writeDraft(null);   // gemt i databasen, så kladden kan væk
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setStep("forslag");
    }
  }

  return (
    <div className="sheet-bg" onClick={() => { if (step === "lyt" && !text) onClose(); }}>
      <div className="sheet voice" role="dialog" aria-modal="true" aria-labelledby="vn-title" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="vn-title">{step === "forslag" || step === "gemmer" ? "Tjek og gem" : "Indtal"}</h2>
          <button type="button" className="linkbtn" onClick={() => { stop(); onClose(); }}>
            {text.trim() || note.trim() ? "Luk · gemmes som kladde" : "Luk"}</button>
        </div>

        {draft && (
          <p className="draft-note">Ikke-gemt note fra kl. {new Date(draft.tid).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}.
            {" "}<button type="button" className="linkbtn" onClick={discard}>Kassér</button></p>
        )}

        {(step === "lyt" || step === "sorterer") && (
          <>
            {SpeechRec ? (
              <div className="mic-row">
                <button type="button" className={`mic${listening ? " on" : ""}`} onClick={listening ? stop : start}
                  aria-label={listening ? "Stop optagelse" : "Start optagelse"} disabled={step === "sorterer"}>
                  <MicIcon />
                </button>
                <span className="muted">{listening ? "Jeg lytter … fortæl hvem du har talt med, og hvad I talte om." : text ? "Tryk for at tale videre." : "Tryk for at tale."}</span>
              </div>
            ) : (
              <p className="muted">Din browser kan ikke lytte direkte. Tryk i feltet og brug mikrofonen på tastaturet.</p>
            )}
            <textarea id="vn-text" className="voice-text" value={text + (interim ? (text ? " " : "") + interim : "")}
              readOnly={listening} onChange={e => setText(e.target.value)}
              placeholder="Fx: Har lige gået tur med Ole Schmidt. Han er glad for at være startet hos Aider … Jeg lovede at sende ham mit oplæg om AI i bestyrelser." />
            <div className="acts">
              <button type="button" className="btn primary" onClick={sort} disabled={step === "sorterer" || !(text.trim())}>
                {step === "sorterer" ? "Claude sorterer …" : "Færdig – lad Claude sortere"}
              </button>
              <button type="button" className="linkbtn" onClick={manual} disabled={step === "sorterer" || !text.trim()}>Gem uden AI</button>
            </div>
          </>
        )}

        {(step === "forslag" || step === "gemmer") && forslag && (
          <>
            <div className="sec">Gemmes på</div>
            {!picking && target ? (
              <div className="chosen">
                <span><b>{target.type === "ny" ? `Ny kontakt: ${target.navn}` : target.type === "lead" ? "Nyt lead" : target.navn}</b>
                  {(target.type === "person" || target.type === "projekt") && <span className="muted"> · {target.type === "person" ? "Person" : "Projekt"}</span>}</span>
                <button type="button" className="linkbtn" onClick={() => setPicking(true)}>Skift</button>
              </div>
            ) : (
              <Picker data={data} initial={target?.navn.split(" · ")[0] || forslag.ny_person_navn || kendtNavn(text, data)} hint={forslag.sikker ? "" : forslag.begrundelse}
                onPick={t => {
                  // Vælger du "nyt lead", fyldes firmanavnet og evt. Claudes næste skridt ind.
                  if (t.type === "lead") setLead(l => ({ ...l, firmanavn: t.navn, naeste_skridt: l.naeste_skridt || forslag.naeste_skridt?.tekst || "", naeste_skridt_dato: forslag.naeste_skridt?.dato || l.naeste_skridt_dato }));
                  setTarget(t); setPicking(false); setError("");
                }} />
            )}

            {target?.type === "lead" && !picking && (
              <>
                <DubletAdvarsel navn={lead.firmanavn} data={data} onBrug={p => setTarget({ type: "projekt", id: p.id, navn: projectName(p) })} />
                <LeadFields idPrefix="vl" value={lead} onChange={setLead} />
              </>
            )}

            <label className="sec" htmlFor="vn-note">Noten</label>
            <textarea id="vn-note" value={note} onChange={e => setNote(e.target.value)} />

            {tasks.length > 0 && (
              <div className="tasks">
                <div className="sec">{target?.type === "mig" ? "Det, du skal huske · med flueben kommer de på listen" : "Dine løfter · med flueben bliver de til opgaver"}</div>
                {tasks.map((t, i) => (
                  <div className="task-edit" key={i}>
                    <input type="checkbox" id={`vn-t${i}`} checked={t.med} aria-label="Tag med"
                      onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, med: e.target.checked } : x))} />
                    <input className="task-text" value={t.tekst} aria-label="Opgave"
                      onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, tekst: e.target.value } : x))} />
                    <input className="task-date" type="date" value={t.forfald} aria-label="Forfald"
                      onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, forfald: e.target.value } : x))} />
                  </div>
                ))}
              </div>
            )}

            {/* Kun når projektet er valgt. Det er noget andet end en opgave: det ændrer projektets "Næste skridt". */}
            {forslag.naeste_skridt && target?.type === "projekt" && !picking && (
              <label className="next-opt">
                <input type="checkbox" checked={useNext} onChange={e => setUseNext(e.target.checked)} />
                <span>Sæt også som næste skridt på {target.navn}: <b>{forslag.naeste_skridt.tekst}</b> ({short(forslag.naeste_skridt.dato)})</span>
              </label>
            )}

            <div className="acts">
              <button type="button" className="btn primary" onClick={save} disabled={step === "gemmer"}>{step === "gemmer" ? "Gemmer …" : "Gem"}</button>
              <button type="button" className="linkbtn" onClick={() => { setStep("lyt"); setForslag(null); }} disabled={step === "gemmer"}>Tilbage til teksten</button>
            </div>
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

/** Vælg selv personen eller firmaet, hvis Claude var i tvivl. */
function Picker({ data, initial, hint, onPick }: { data: Data; initial: string; hint: string; onPick: (t: Target) => void }) {
  const [q, setQ] = useState(initial);
  const hits = useMemo(() => {
    const s = q.trim();
    if (!s) return [] as Target[];
    const ppl: Target[] = data.personer.filter(x => passer(x.navn, s))
      .map(x => ({ type: "person", id: x.id, navn: x.navn + (x.firma ? ` · ${x.firma.firmanavn.trim()}` : "") }));
    const prj: Target[] = data.projekter.filter(p => p.stage !== "tabt" &&
      (passer(projectName(p), s) || passer(p.firma?.kontaktperson ?? "", s)))
      .map(p => ({ type: "projekt", id: p.id, navn: projectName(p) }));
    return [...ppl, ...prj].slice(0, 6);
  }, [q, data]);
  return (
    <div className="picker">
      {hint && <p className="warn-hint">Claude er i tvivl: {hint}</p>}
      <input className="search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Søg person eller firma" aria-label="Søg person eller firma"
        autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" />
      <div className="suggest">
        {hits.map(h => (
          <button type="button" key={h.type + ("id" in h ? h.id : "")} className="row" onClick={() => onPick(h)}>
            <span className="who">{h.navn}</span>
            <span className="side"><span className="pill">{h.type === "person" ? "Person" : "Projekt"}</span></span>
          </button>
        ))}
        {q.trim().length > 1 && (
          <button type="button" className="row new-lead" onClick={() => onPick({ type: "lead", navn: q.trim() })}>
            <span className="who">Opret “{q.trim()}” som nyt lead</span>
            <span className="side"><span className="pill lead">Lead</span></span>
          </button>
        )}
        <button type="button" className="row" onClick={() => onPick(MIG)}>
          <span className="who">Til mig selv</span>
          <span className="side"><span className="pill">Husk</span></span>
        </button>
        {q.trim().length > 1 && (
          <button type="button" className="row" onClick={() => onPick({ type: "ny", navn: q.trim() })}>
            <span className="who">Opret “{q.trim()}” som ny kontakt</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Navne ----------
/** Små bogstaver, uden accenter og ekstra mellemrum, så "Christian  Tvede" og "christian tvede" er ens. */
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9æøå]+/g, " ").trim();

/** Passer navnet på søgningen? Alle ord i søgningen skal findes i navnet, i vilkårlig rækkefølge. */
function passer(navn: string, soeg: string): boolean {
  const n = " " + norm(navn) + " ";
  return norm(soeg).split(" ").filter(Boolean).every(o => n.includes(" " + o));
}

/** Find et navn fra personlisten, der står i den indtalte tekst. Bruges til at udfylde søgefeltet. */
function kendtNavn(tekst: string, data: Data): string {
  const t = " " + norm(tekst) + " ";
  // Længste navn først, så "Christian Tvede" vinder over en anden "Christian".
  const navne = data.personer.map(p => p.navn).filter(Boolean).sort((a, b) => b.length - a.length);
  return navne.find(n => norm(n).includes(" ") && t.includes(" " + norm(n) + " ")) ?? "";
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export { MicIcon };

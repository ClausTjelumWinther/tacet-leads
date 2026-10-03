import { useEffect, useMemo, useRef, useState } from "react";
import {
  addNote, createPerson, createTask, errorText, projectName, setNextStep, structure,
  type Data, type Forslag,
} from "./data";
import { short } from "./dates";

// Mikrofonen i tre trin:
//   1. "lyt"      – telefonens talegenkendelse skriver det ned, mens du taler
//   2. "sorterer" – Claude finder personen, renser noten og finder dine løfter
//   3. "forslag"  – du ser forslaget, retter hvis nødvendigt og trykker Gem

type Step = "lyt" | "sorterer" | "forslag" | "gemmer";
type Target = { type: "person" | "projekt"; id: string; navn: string } | { type: "ny"; navn: string };

// ---------- Kladde: en indtalt note må aldrig forsvinde ----------
// Alt, hvad du har sagt, gemmes løbende i telefonens hukommelse (localStorage),
// indtil du trykker Gem eller Kassér. Lukker du skærmen, eller genstarter telefonen appen,
// ligger noten klar, næste gang du trykker på mikrofonen.
const KLADDE = "puls.indtalt-kladde";
interface Kladde {
  text: string; forslag: Forslag | null; target: Target | null; note: string;
  tasks: { tekst: string; forfald: string; med: boolean }[]; useNext: boolean; tid: number;
}
function readDraft(): Kladde | null {
  try { const s = localStorage.getItem(KLADDE); return s ? JSON.parse(s) as Kladde : null; } catch { return null; }
}
function writeDraft(k: Kladde | null) {
  try { if (k) localStorage.setItem(KLADDE, JSON.stringify(k)); else localStorage.removeItem(KLADDE); } catch { /* ingen lagerplads */ }
}
/** Bruges af mikrofonknappen til at vise en prik, når der ligger en ikke-gemt note. */
export const hasDraft = () => !!readDraft();

// Browserens talegenkendelse hedder noget forskelligt i Chrome og Safari.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRec: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function VoiceNote({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: () => Promise<void> }) {
  // Ligger der en kladde fra sidst, starter vi dér i stedet for at lytte.
  const [draft] = useState(readDraft);
  const [step, setStep] = useState<Step>(draft?.forslag ? "forslag" : "lyt");
  const [listening, setListening] = useState(false);
  const [text, setText] = useState(draft?.text ?? "");   // det du har sagt (kan rettes)
  const [interim, setInterim] = useState("");    // det, der lige nu bliver genkendt
  const [error, setError] = useState("");
  const [forslag, setForslag] = useState<Forslag | null>(draft?.forslag ?? null);
  const [target, setTarget] = useState<Target | null>(draft?.target ?? null);
  const [note, setNote] = useState(draft?.note ?? "");
  const [tasks, setTasks] = useState<{ tekst: string; forfald: string; med: boolean }[]>(draft?.tasks ?? []);
  const [useNext, setUseNext] = useState(draft?.useNext ?? false);
  const [picking, setPicking] = useState(!!draft?.forslag && !draft.target);

  // Gem kladden, hver gang noget ændrer sig. Tom tekst = ingen kladde.
  const savedRef = useRef(false);
  const tidRef = useRef(draft?.tid ?? Date.now());
  useEffect(() => {
    if (savedRef.current) return;
    if (!text.trim() && !note.trim()) { writeDraft(null); return; }
    writeDraft({ text, forslag, target, note, tasks, useNext, tid: tidRef.current });
  }, [text, forslag, target, note, tasks, useNext]);

  function discard() { savedRef.current = true; writeDraft(null); stop(); onClose(); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const wantRef = useRef(false);   // vil vi stadig lytte? (Safari stopper selv efter en pause)
  const baseRef = useRef("");      // tekst før den aktuelle lytte-runde

  // ---------- Trin 1: lyt ----------
  function start() {
    if (!SpeechRec) return;
    setError("");
    const rec = new SpeechRec();
    rec.lang = "da-DK";
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = text ? text.trimEnd() + " " : "";
    let finals = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript + " ";
        else live += r[0].transcript;
      }
      setText((baseRef.current + finals).trimStart());
      setInterim(live);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantRef.current = false;
        setError("Appen har ikke adgang til mikrofonen. Giv adgang i telefonens indstillinger, eller brug mikrofonen på tastaturet.");
      }
    };
    rec.onend = () => {
      setInterim("");
      if (wantRef.current) {
        // Safari stopper efter en pause. Vi starter igen og bygger videre på teksten.
        baseRef.current = ((baseRef.current + finals).trimEnd() + " ");
        finals = "";
        try { rec.start(); return; } catch { /* kunne ikke starte igen */ }
      }
      setListening(false);
    };
    recRef.current = rec;
    wantRef.current = true;
    try { rec.start(); setListening(true); } catch { setError("Mikrofonen kunne ikke starte. Prøv igen."); }
  }

  function stop() {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
  }

  // Start med det samme, når skærmen åbnes. Stop, hvis den lukkes.
  useEffect(() => {
    if (SpeechRec && !draft) start();
    return () => { wantRef.current = false; recRef.current?.abort?.(); };
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
      setTarget(f.maal_type === "ny_person"
        ? { type: "ny", navn: f.ny_person_navn ?? "" }
        : { type: f.maal_type, id: f.maal_id!, navn: f.maal_navn ?? "" });
      setPicking(!f.sikker || (f.maal_type === "ny_person" && !f.ny_person_navn));
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
                <span><b>{target.type === "ny" ? `Ny kontakt: ${target.navn}` : target.navn}</b>
                  {target.type !== "ny" && <span className="muted"> · {target.type === "person" ? "Person" : "Projekt"}</span>}</span>
                <button type="button" className="linkbtn" onClick={() => setPicking(true)}>Skift</button>
              </div>
            ) : (
              <Picker data={data} initial={target?.navn ?? forslag.ny_person_navn ?? ""} hint={forslag.sikker ? "" : forslag.begrundelse}
                onPick={t => { setTarget(t); setPicking(false); setError(""); }} />
            )}

            <label className="sec" htmlFor="vn-note">Noten</label>
            <textarea id="vn-note" value={note} onChange={e => setNote(e.target.value)} />

            {tasks.length > 0 && (
              <div className="tasks">
                <div className="sec">Dine løfter, bliver til opgaver</div>
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

            {forslag.naeste_skridt && target?.type === "projekt" && (
              <label className="next-opt">
                <input type="checkbox" checked={useNext} onChange={e => setUseNext(e.target.checked)} />
                <span>Opdatér næste skridt til <b>{forslag.naeste_skridt.tekst}</b> ({short(forslag.naeste_skridt.dato)})</span>
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
    const s = q.trim().toLowerCase();
    if (!s) return [] as Target[];
    const ppl: Target[] = data.personer.filter(x => x.navn.toLowerCase().includes(s))
      .map(x => ({ type: "person", id: x.id, navn: x.navn + (x.firma ? ` · ${x.firma.firmanavn.trim()}` : "") }));
    const prj: Target[] = data.projekter.filter(p => p.stage !== "tabt" &&
      (projectName(p).toLowerCase().includes(s) || (p.firma?.kontaktperson ?? "").toLowerCase().includes(s)))
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
          <button type="button" className="row" onClick={() => onPick({ type: "ny", navn: q.trim() })}>
            <span className="who">Opret “{q.trim()}” som ny kontakt</span>
          </button>
        )}
      </div>
    </div>
  );
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

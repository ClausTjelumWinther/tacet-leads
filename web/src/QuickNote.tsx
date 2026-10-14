import { useEffect, useMemo, useRef, useState } from "react";
import { addNote, createLead, createPerson, errorText, projectName, type Data, type NytLead } from "./data";
import LeadFields, { leadMangler, tomtLead } from "./LeadFields";
import { DictateButton } from "./Dictate";
import NoteComposer, { saveTasks, type Task } from "./NoteComposer";

type Target = { kind: "person" | "projekt"; id: string; label: string } | { kind: "ny"; label: string }
  | { kind: "lead"; label: string };   // nyt firma i pipelinen (stage lead)

// "+ Note": det hurtige felt til lige efter et møde.
// 1) Skriv eller indtal hvem det handler om. 2) Vælg. 3) Indtal noten. 4) Gem.
export default function QuickNote({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: () => Promise<void> }) {
  const [who, setWho] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const whoRef = useRef<HTMLInputElement>(null);
  const [lead, setLead] = useState<NytLead>(tomtLead());
  const [leadNote, setLeadNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Nyt lead: firma, næste skridt og dato skal være udfyldt. Noten er valgfri.
  async function saveLead() {
    const mangler = leadMangler(lead);
    if (mangler) { setMsg({ text: mangler, err: true }); return; }
    setBusy(true); setMsg(null);
    try {
      await createLead({ ...lead, note: leadNote });
      await onSaved();
      onClose();
    } catch (e) {
      setMsg({ text: errorText(e), err: true });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { whoRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Forslag: personer først (det er dem, man oftest har talt med), derefter firmaer.
  const suggestions = useMemo(() => {
    const q = who.trim().toLowerCase();
    // Uden søgning: vis de personer, du senest har talt med.
    if (!q) return data.personer
      .filter(x => x.sidste_kontakt)
      .sort((a, b) => (b.sidste_kontakt ?? "").localeCompare(a.sidste_kontakt ?? ""))
      .slice(0, 5)
      .map(x => ({ kind: "person", id: x.id, label: x.navn + (x.firma ? ` · ${x.firma.firmanavn.trim()}` : "") }) as Target);
    const people: Target[] = data.personer.filter(x => x.navn.toLowerCase().includes(q))
      .map(x => ({ kind: "person", id: x.id, label: x.navn + (x.firma ? ` · ${x.firma.firmanavn.trim()}` : "") }));
    const projs: Target[] = data.projekter.filter(p => p.stage !== "tabt" &&
      (projectName(p).toLowerCase().includes(q) || (p.firma?.kontaktperson ?? "").toLowerCase().includes(q)))
      .map(p => ({ kind: "projekt", id: p.id, label: projectName(p) + (p.firma?.kontaktperson ? ` · ${p.firma.kontaktperson.trim()}` : "") }));
    return [...people, ...projs].slice(0, 6);
  }, [who, data]);

  async function save(text: string, tasks: Task[]) {
    if (!target || target.kind === "lead") { setMsg({ text: "Vælg hvem noten handler om.", err: true }); return; }
    setMsg(null);
    if (target.kind === "ny") {
      const id = await createPerson(target.label, text);
      await saveTasks(tasks, { person_id: id });
    } else {
      await addNote(target.kind, target.id, text);
      await saveTasks(tasks, target.kind === "person" ? { person_id: target.id } : { projekt_id: target.id });
    }
    await onSaved();
    onClose();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="qn-title" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="qn-title">{target?.kind === "lead" ? "Nyt lead" : "Hurtig note"}</h2>
          <button type="button" className="linkbtn" onClick={onClose}>Luk</button>
        </div>

        {!target ? (
          <>
            <label className="sec" htmlFor="qn-who">Hvem har du talt med?</label>
            <input id="qn-who" ref={whoRef} className="search" type="search" value={who} onChange={e => setWho(e.target.value)}
              placeholder="Søg navn eller firma" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" />
            {!who.trim() && suggestions.length > 0 && <div className="sec">Senest talt med</div>}
            <div className="suggest">
              {suggestions.map(s => (
                <button type="button" key={s.kind + ("id" in s ? s.id : "")} className="row" onClick={() => setTarget(s)}>
                  <span className="who">{s.label}</span>
                  <span className="side"><span className="pill">{s.kind === "person" ? "Person" : "Projekt"}</span></span>
                </button>
              ))}
              {who.trim().length > 1 && (
                <button type="button" className="row" onClick={() => setTarget({ kind: "ny", label: who.trim() })}>
                  <span className="who">Opret “{who.trim()}” som ny privat kontakt</span>
                </button>
              )}
              {/* Nyt firma til pipelinen. Står altid nederst, også uden søgning. */}
              <button type="button" className="row new-lead" onClick={() => { setLead(tomtLead(who.trim())); setTarget({ kind: "lead", label: who.trim() }); }}>
                <span className="who">{who.trim().length > 1 ? <>Opret “{who.trim()}” som nyt lead</> : "Opret nyt lead"}</span>
                <span className="side"><span className="pill lead">Lead</span></span>
              </button>
            </div>
          </>
        ) : target.kind === "lead" ? (
          <>
            <button type="button" className="linkbtn back" onClick={() => { setTarget(null); setMsg(null); }}>← Tilbage til søgning</button>
            <LeadFields idPrefix="ql" value={lead} onChange={setLead} />
            <label className="sec" htmlFor="ql-note">Note <span className="muted small">valgfri</span></label>
            <div className="composer">
              <textarea id="ql-note" value={leadNote} onChange={e => setLeadNote(e.target.value)} placeholder="Hvordan mødte I hinanden, og hvad talte I om?" />
              <div className="acts">
                <DictateButton value={leadNote} onChange={setLeadNote} />
                <button type="button" className="btn primary" onClick={saveLead} disabled={busy}>{busy ? "Opretter…" : "Opret lead"}</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="chosen">
              <span><b>{target.label}</b>{target.kind === "ny" ? " (ny kontakt)" : ""}</span>
              <button type="button" className="linkbtn" onClick={() => setTarget(null)}>Skift</button>
            </div>
            <label className="sec" htmlFor="qn-text">Hvad talte I om?</label>
            <NoteComposer id="qn-text" autoFocus placeholder="" saveLabel="Gem note"
              target={target.kind === "person" || target.kind === "projekt" ? { type: target.kind, id: target.id } : null} onSave={save} />
          </>
        )}
        {msg && <p className={msg.err ? "error" : "muted"}>{msg.text}</p>}
      </div>
    </div>
  );
}

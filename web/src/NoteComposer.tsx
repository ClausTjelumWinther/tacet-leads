import { useState } from "react";
import { createTask, errorText, structure, type Forslag } from "./data";
import { DictateButton, canDictate } from "./Dictate";
import { addDays, today } from "./dates";

export type Task = { tekst: string; forfald: string; med: boolean };
export type NoteTarget = { type: "person" | "projekt"; id: string } | null;

/** Gemmer de løfter, der har flueben, på personen eller projektet. */
export async function saveTasks(tasks: Task[], link: { person_id?: string; projekt_id?: string }) {
  for (const t of tasks.filter(t => t.med && t.tekst.trim())) await createTask(t.tekst.trim(), t.forfald, link);
}

// Notefeltet, der bruges i "+ Note" og på fokuskortet:
//   Indtal          – browseren skriver det, du siger
//   Kort og præcis  – Claude strammer teksten op og finder dine løfter
//   Gem             – noten (og de løfter, der har flueben) gemmes
export default function NoteComposer({ id, placeholder, saveLabel, target, autoFocus, onSave }: {
  id: string; placeholder: string; saveLabel: string; target: NoteTarget; autoFocus?: boolean;
  onSave: (text: string, tasks: Task[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [tightening, setTightening] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  async function tighten() {
    if (text.trim().length < 3) { setMsg({ text: "Sig eller skriv lidt mere først.", err: true }); return; }
    setTightening(true); setMsg(null);
    try {
      const f: Forslag = await structure(text, target ?? undefined);
      setText(f.note);
      // Løfter, Claude fandt, lægges oveni dem, du evt. allerede har.
      const found = (f.opgaver ?? []).map(o => ({ tekst: o.tekst, forfald: o.forfald || addDays(today(), 1), med: true }));
      if (found.length) setTasks(ts => [...ts, ...found]);
      setMsg({ text: found.length ? `Strammet op. ${found.length} ${found.length === 1 ? "løfte" : "løfter"} fundet.` : "Strammet op." });
    } catch (e) {
      setMsg({ text: errorText(e), err: true });
    } finally {
      setTightening(false);
    }
  }

  async function save() {
    if (!text.trim()) { setMsg({ text: "Skriv noten først.", err: true }); return; }
    setBusy(true); setMsg(null);
    try {
      await onSave(text, tasks);
      setText(""); setTasks([]);
    } catch (e) {
      setMsg({ text: errorText(e), err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer">
      <textarea id={id} autoFocus={autoFocus} value={text} onChange={e => setText(e.target.value)}
        placeholder={placeholder || (canDictate ? "Skriv, eller tryk på Indtal og fortæl" : "Skriv, eller brug mikrofonen på tastaturet")} />

      {tasks.length > 0 && (
        <div className="tasks">
          <div className="sec">Dine løfter, bliver til opgaver</div>
          {tasks.map((t, i) => (
            <div className="task-edit" key={i}>
              <input type="checkbox" checked={t.med} aria-label="Tag med"
                onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, med: e.target.checked } : x))} />
              <input className="task-text" value={t.tekst} aria-label="Opgave"
                onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, tekst: e.target.value } : x))} />
              <input className="task-date" type="date" value={t.forfald} aria-label="Forfald"
                onChange={e => setTasks(ts => ts.map((x, j) => j === i ? { ...x, forfald: e.target.value } : x))} />
            </div>
          ))}
        </div>
      )}

      <div className="acts">
        <DictateButton value={text} onChange={setText} />
        <button type="button" className="ai-btn" onClick={tighten} disabled={tightening || busy || text.trim().length < 3}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
          </svg>
          <span>{tightening ? "Claude strammer op …" : "Kort og præcis"}</span>
        </button>
        <button type="button" className="btn primary" onClick={save} disabled={busy || tightening}>{busy ? "Gemmer…" : saveLabel}</button>
      </div>
      {msg && <p className={msg.err ? "error" : "muted small"} role="status">{msg.text}</p>}
    </div>
  );
}

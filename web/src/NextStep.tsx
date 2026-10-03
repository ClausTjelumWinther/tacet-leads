import { useState } from "react";
import { addDays, short, today } from "./dates";

// "Klaret – hvad er det næste?"
// Et lead skal altid have en kommende action. Når du har gjort det nuværende skridt,
// skriver du med det samme det næste, og vælger en dato. Uden dato kan du ikke gemme.

const HURTIG: { label: string; dage: number }[] = [
  { label: "I morgen", dage: 1 }, { label: "+3 dage", dage: 3 }, { label: "+1 uge", dage: 7 }, { label: "+2 uger", dage: 14 },
];

export default function NextStep({ current, onSave, onCancel }: {
  current: string | null;
  onSave: (tekst: string, dato: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [tekst, setTekst] = useState("");
  const [dato, setDato] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = tekst.trim().length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(dato);

  async function save() {
    if (!ok) return;
    setBusy(true);
    try { await onSave(tekst.trim(), dato); } finally { setBusy(false); }
  }

  return (
    <div className="nextstep">
      {current && <p className="muted small">Klaret: <s>{current}</s></p>}
      <label className="sec" htmlFor="ns-tekst">Hvad er det næste?</label>
      <input id="ns-tekst" className="task-text" value={tekst} autoFocus placeholder="Fx: Ring til Kasper og hør om budgettet"
        onChange={e => setTekst(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }} />
      <div className="acts">
        {HURTIG.map(h => {
          const d = addDays(today(), h.dage);
          return <button type="button" key={h.dage} className={`btn${dato === d ? " primary" : ""}`} onClick={() => setDato(d)}>{h.label}</button>;
        })}
        <input type="date" className="task-date" value={dato} min={today()} aria-label="Dato" onChange={e => setDato(e.target.value)} />
      </div>
      <div className="acts">
        <button type="button" className="btn primary" disabled={!ok || busy} onClick={save}>
          {busy ? "Gemmer …" : dato ? `Gem næste skridt (${short(dato)})` : "Vælg en dato"}
        </button>
        <button type="button" className="linkbtn" onClick={onCancel} disabled={busy}>Fortryd</button>
      </div>
    </div>
  );
}

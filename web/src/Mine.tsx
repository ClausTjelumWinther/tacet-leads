import { useState } from "react";
import { completeTask, createMine, errorText, type Data } from "./data";
import { DictateButton } from "./Dictate";
import { TaskRow } from "./parts";

// "Til mig selv": små ting, du selv skal huske (køb en Sonos-højttaler, tal med renseriet).
// De bor i samme tabel som løfterne (opgaver), men med til_mig = true.
// Derfor tæller de ikke med i "løfter holdt inden 48 timer" og vises ikke på kunde- eller personkort.
export default function Mine({ data, onChanged }: { data: Data; onChanged: () => Promise<void> }) {
  const [tekst, setTekst] = useState("");
  const [dato, setDato] = useState("");
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");

  // Uden dato til sidst; med dato efter dato.
  const liste = [...data.mine].sort((a, b) => (a.forfald ?? "9999").localeCompare(b.forfald ?? "9999"));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!tekst.trim()) return;
    setBusy(true); setFejl("");
    try {
      await createMine(tekst.trim(), dato || null);
      setTekst(""); setDato("");
      await onChanged();
    } catch (err) {
      setFejl(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="group" id="mine">
      <div className="ghead">
        <h2>Til mig selv</h2>
        <small>{liste.length}</small>
      </div>
      {liste.map(o => <TaskRow key={o.id} o={o} mine onDone={async () => { await completeTask(o.id); await onChanged(); }} />)}
      <form className="mine-add" onSubmit={add}>
        <input value={tekst} onChange={e => setTekst(e.target.value)} placeholder="Husk … (fx køb Sonos-højttaler)" aria-label="Ny ting at huske" />
        <input type="date" value={dato} onChange={e => setDato(e.target.value)} aria-label="Dato (valgfri)" />
        <DictateButton value={tekst} onChange={setTekst} />
        <button type="submit" className="btn" disabled={busy || !tekst.trim()}>{busy ? "Gemmer…" : "Tilføj"}</button>
      </form>
      {fejl && <p className="error" role="alert">{fejl}</p>}
    </section>
  );
}

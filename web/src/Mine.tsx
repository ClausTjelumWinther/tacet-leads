import { useRef, useState } from "react";
import { completeTask, createMine, errorText, type Data } from "./data";
import { DictateButton } from "./Dictate";
import { WhenChip } from "./parts";
import { short } from "./dates";

// "Til mig selv": små ting, du selv skal huske (køb en Sonos-højttaler, tal med renseriet).
// De bor i samme tabel som løfterne (opgaver), men med til_mig = true.
// Derfor tæller de ikke med i "løfter holdt inden 48 timer" og vises ikke på kunde- eller personkort.
//
// Visningen er en tjekliste frem for rækker med knapper:
//   ○ tryk på cirklen  → punktet streges over og forsvinder
//   + feltet nederst   → skriv eller indtal, dato er valgfri (kalender-ikonet)
export default function Mine({ data, onChanged }: { data: Data; onChanged: () => Promise<void> }) {
  const [tekst, setTekst] = useState("");
  const [dato, setDato] = useState("");
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [klaret, setKlaret] = useState<Set<string>>(new Set()); // streges over, mens de gemmes
  const datoRef = useRef<HTMLInputElement>(null);

  // Med dato først (tidligste øverst), uden dato til sidst.
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

  async function done(id: string) {
    // Vis med det samme, at den er klaret. Gem i baggrunden, og hent listen igen bagefter.
    setKlaret(s => new Set(s).add(id));
    try {
      await completeTask(id);
      await new Promise(r => setTimeout(r, 350)); // lige tid nok til at se stregen
      await onChanged();
    } catch (err) {
      setKlaret(s => { const n = new Set(s); n.delete(id); return n; });
      setFejl(errorText(err));
    }
  }

  // Åbn telefonens/browserens datovælger fra kalender-ikonet.
  function pickDate() {
    const el = datoRef.current;
    if (!el) return;
    // showPicker findes i nyere browsere. Ellers giver vi feltet fokus, så det kan udfyldes.
    if (typeof el.showPicker === "function") { try { el.showPicker(); return; } catch { /* falder igennem */ } }
    el.focus(); el.click();
  }

  return (
    <section className="group mine" id="mine">
      <div className="ghead">
        <h2>Til mig selv</h2>
        <small>{liste.length || ""}</small>
      </div>

      {liste.length > 0 ? (
        <ul className="mine-list">
          {liste.map(o => {
            const er = klaret.has(o.id);
            return (
              <li key={o.id} className={er ? "done" : undefined}>
                <button type="button" className="tick" aria-label={`Færdig: ${o.tekst}`} disabled={er} onClick={() => done(o.id)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </button>
                <span className="m-txt">{o.tekst}</span>
                {o.forfald && <WhenChip date={o.forfald} />}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mine-empty">Intet at huske lige nu.</p>
      )}

      <form className="mine-add" onSubmit={add}>
        <span className="plus" aria-hidden="true">+</span>
        <input value={tekst} onChange={e => setTekst(e.target.value)} placeholder="Husk at …" aria-label="Ny ting at huske"
          enterKeyHint="done" autoComplete="off" />
        {dato && (
          <button type="button" className="date-chip" onClick={() => setDato("")} aria-label={`Fjern dato ${short(dato)}`}>
            {short(dato)} <span aria-hidden="true">×</span>
          </button>
        )}
        <span className="icon-btn date-btn">
          <button type="button" onClick={pickDate} aria-label="Vælg dato (valgfri)">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
          </button>
          {/* Usynligt datofelt: åbnes fra ikonet ovenfor */}
          <input ref={datoRef} type="date" value={dato} onChange={e => setDato(e.target.value)} tabIndex={-1} aria-hidden="true" />
        </span>
        <DictateButton value={tekst} onChange={setTekst} compact />
        {tekst.trim() && <button type="submit" className="btn primary add-btn" disabled={busy}>{busy ? "…" : "Tilføj"}</button>}
      </form>
      {fejl && <p className="error" role="alert">{fejl}</p>}
    </section>
  );
}

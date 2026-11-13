import { useState } from "react";
import { addDays, short, today } from "./dates";
import { ACTIVE, FOKUS_LOFT, STAGES, errorText, haendelserFor, iFokus, moveNextStep, projectName, setFokus, setStage, type Data, type Projekt } from "./data";
import { WhenChip } from "./parts";

// Oprydning: ét kort ad gangen, og for hvert kort én beslutning.
//   I fokus        → kortet kommer op under I dag (højst 7)
//   Venter på svar → datoen flyttes 14 dage frem, så du bliver mindet om at rykke
//   Parkér til …   → kortet lægges på hylden til en dato, du vælger
//   Slip den       → status sættes til Tabt (to tryk, så det ikke sker ved et uheld)
// Idéen: i stedet for 55 røde tal hver dag tager du stilling én gang, og så er der ro.

/** Kort, der trænger til en beslutning: ikke i fokus, og datoen er nået eller mangler. */
export function tilOprydning(data: Data): Projekt[] {
  const t = today();
  return data.projekter
    .filter(p => !p.fokus && (ACTIVE.includes(p.stage) || p.stage === "netvaerk" || p.stage === "kunde"))
    // Har du parkeret kortet til en dato, respekteres den, også selv om næste skridt mangler tekst.
    .filter(p => !p.naeste_skridt_dato || p.naeste_skridt_dato <= t)
    .sort((a, b) => (a.naeste_skridt_dato ?? "0000").localeCompare(b.naeste_skridt_dato ?? "0000")); // ældste først
}

/** Første hverdag i januar: "efter nytår". */
function efterNytaar(): string {
  const y = +today().slice(0, 4) + 1;
  let d = `${y}-01-05`;
  while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = addDays(d, 1);
  return d;
}

export default function Oprydning({ data, onClose, onChanged }:
  { data: Data; onClose: () => void; onChanged: () => Promise<void> }) {
  // Køen fryses, når du åbner oprydningen, så kortene ikke hopper rundt, mens du arbejder.
  const [koe] = useState(() => tilOprydning(data).map(p => p.id));
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [slip, setSlip] = useState(false);    // første tryk på "Slip den"
  const [dato, setDato] = useState("");

  const fokusN = iFokus(data).length;
  // Spring kort over, der er forsvundet i mellemtiden (fx sat til Tabt et andet sted).
  const p = koe.slice(i).map(id => data.projekter.find(x => x.id === id)).find(Boolean);
  const nr = p ? koe.indexOf(p.id) : koe.length;

  async function vaelg(fn: () => Promise<void>) {
    if (!p) return;
    setBusy(true); setFejl("");
    try {
      await fn();
      await onChanged();
      setI(nr + 1); setSlip(false); setDato("");
    } catch (e) {
      setFejl(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const top = (
    <div className="ryd-top">
      <button type="button" className="back" onClick={onClose}>← Tilbage til I dag</button>
      <span className="mono muted">{Math.min(nr + 1, koe.length)} af {koe.length}</span>
    </div>
  );
  const bar = <div className="ryd-bar"><div style={{ width: `${koe.length ? (nr / koe.length) * 100 : 100}%` }} /></div>;

  if (!p) return (
    <div className="ryd">
      {top}{bar}
      <div className="ryd-slut">
        <h2>Hylden er ryddet</h2>
        <p>Du har {fokusN} af {FOKUS_LOFT} i fokus. Resten dukker op her igen, når deres dato kommer.</p>
        <button type="button" className="btn primary" onClick={onClose}>Til I dag</button>
      </div>
    </div>
  );

  const akt = haendelserFor(data, { projekt: p });
  const sidste = akt.find(h => h.type === "mail_ind" || h.type === "mail_ud" || h.type === "moede");
  const note = (p.noter ?? "").split("\n")[0];
  const fuld = fokusN >= FOKUS_LOFT;

  return (
    <div className="ryd">
      {top}{bar}
      <h2 className="ryd-q">Hvad skal der ske med den her?</h2>

      <section className="ryd-kort">
        <div className="eyebrow">
          {STAGES[p.stage]}{p.velatir ? " · Velatir" : ""}
          {sidste ? ` · sidste kontakt ${short(sidste.dato.slice(0, 10))}` : " · ingen mails registreret"}
        </div>
        <div className="fname">{projectName(p)}{p.firma?.kontaktperson && <span className="person"> · {p.firma.kontaktperson.trim()}</span>}</div>
        <div className={`ryd-next${p.naeste_skridt ? "" : " none"}`}>{p.naeste_skridt || "Intet næste skridt"}</div>
        <div><WhenChip date={p.naeste_skridt_dato} /></div>
        {note && <div className="ryd-note">{note}</div>}
      </section>

      {fejl && <div className="flash err" role="status">{fejl}</div>}

      <div className="ryd-valg">
        <button type="button" className="valg primary" disabled={busy || fuld}
          onClick={() => vaelg(() => setFokus(data, p.id, true))}>
          I fokus <span>{fuld ? `fuld, ${FOKUS_LOFT}/${FOKUS_LOFT}` : `${fokusN}/${FOKUS_LOFT} brugt`}</span>
        </button>
        <button type="button" className="valg" disabled={busy}
          onClick={() => vaelg(() => moveNextStep(p.id, addDays(today(), 14)))}>
          Venter på svar <span>ryk om 14 dage ({short(addDays(today(), 14))})</span>
        </button>
        <div className="valg parker">
          <span className="valg-titel">Parkér til</span>
          <div className="acts">
            <button type="button" className="btn" disabled={busy} onClick={() => vaelg(() => moveNextStep(p.id, addDays(today(), 30)))}>1 måned</button>
            <button type="button" className="btn" disabled={busy} onClick={() => vaelg(() => moveNextStep(p.id, efterNytaar()))}>Efter nytår</button>
            <button type="button" className="btn" disabled={busy} onClick={() => vaelg(() => moveNextStep(p.id, addDays(today(), 90)))}>3 måneder</button>
            <input type="date" className="task-text" value={dato} min={addDays(today(), 1)} aria-label="Vælg dato"
              onChange={e => setDato(e.target.value)} />
            {dato && <button type="button" className="btn primary" disabled={busy} onClick={() => vaelg(() => moveNextStep(p.id, dato))}>Parkér til {short(dato)}</button>}
          </div>
        </div>
        <button type="button" className={`valg slip${slip ? " bekraeft" : ""}`} disabled={busy}
          onClick={() => slip ? vaelg(() => setStage(p, "tabt")) : setSlip(true)}>
          {slip ? "Tryk igen for at slippe den" : "Slip den"} <span>status bliver Tabt</span>
        </button>
      </div>

      <button type="button" className="linkbtn ryd-skip" disabled={busy} onClick={() => { setI(nr + 1); setSlip(false); setDato(""); }}>
        Spring over
      </button>
    </div>
  );
}

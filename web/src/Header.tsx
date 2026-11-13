import { today } from "./dates";
import { FOKUS_LOFT, iFokus, type Data } from "./data";
import { tilOprydning } from "./Oprydning";

export type Jump = "fokus" | "hylde" | "loefter" | "pipeline";

// Toppen: dato og de fire tal. Med Fokus 7 er der ingen røde tal for alt det, der ligger på hylden:
// kun hvor mange du har i fokus, hvor mange kort der venter på en beslutning, og løfterne. Tallene er knapper, der springer til det, de tæller.
export default function Header({ data, loading, onRefresh, onJump, onHome }:
  { data: Data | null; loading: boolean; onRefresh: () => void; onJump: (j: Jump) => void; onHome: () => void }) {
  const t = today();
  const date = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long" }).format(new Date());

  let pulse = null;
  if (data) {
    const fokus = iFokus(data).length;
    const ryd = tilOprydning(data).length;
    // Løfter vejer tungt for en relationsmand, så forfaldne løfter er det eneste, der bliver rødt.
    const loefterOver = data.opgaver.filter(o => o.forfald && o.forfald < t).length;
    const pipe = data.projekter.filter(p => p.stage === "tilbud" || p.stage === "dialog").reduce((s, p) => s + (p.vaerdi ?? 0), 0);
    pulse = (
      <div className="pulse">
        <button type="button" onClick={() => onJump("fokus")}><b>{fokus}/{FOKUS_LOFT}</b><span>I fokus</span></button>
        <button type="button" onClick={() => onJump("hylde")}><b>{ryd}</b><span>Ryd op</span></button>
        <button type="button" className={loefterOver ? "hot" : ""} onClick={() => onJump("loefter")}><b>{data.opgaver.length}</b><span>Løfter</span></button>
        <button type="button" onClick={() => onJump("pipeline")}><b>{new Intl.NumberFormat("da-DK", { notation: "compact", maximumFractionDigits: 0 }).format(pipe)}</b><span>I spil, kr.</span></button>
      </div>
    );
  }

  return (
    <header className="top">
      <div className="brand">
        {/* "Puls" er en knap hjem: rydder søgningen og går til I dag, ligesom et logo på en hjemmeside. */}
        <h1><button type="button" className="home" onClick={onHome} aria-label="Til forsiden">Puls</button></h1>
        <div className="date">{date}</div>
      </div>
      {pulse}
      <div className="tools">
        <button className="btn" type="button" onClick={onRefresh} disabled={loading}>{loading ? "Henter…" : "Opdatér"}</button>
      </div>
    </header>
  );
}

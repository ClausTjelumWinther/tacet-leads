import { addDays, today } from "./dates";
import type { Data } from "./data";

export type Jump = "forfaldent" | "uge" | "loefter" | "pipeline";

// Toppen: dato og de fire tal. Tallene er knapper, der springer til det, de tæller.
export default function Header({ data, loading, onRefresh, onJump }:
  { data: Data | null; loading: boolean; onRefresh: () => void; onJump: (j: Jump) => void }) {
  const t = today();
  const date = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long" }).format(new Date());

  let pulse = null;
  if (data) {
    const live = data.projekter.filter(p => p.stage !== "tabt");
    const over = live.filter(p => p.naeste_skridt_dato && p.naeste_skridt_dato < t).length
      + data.opgaver.filter(o => o.forfald && o.forfald < t).length;
    const week = live.filter(p => p.naeste_skridt_dato && p.naeste_skridt_dato >= t && p.naeste_skridt_dato <= addDays(t, 6)).length;
    const pipe = data.projekter.filter(p => p.stage === "tilbud" || p.stage === "dialog").reduce((s, p) => s + (p.vaerdi ?? 0), 0);
    pulse = (
      <div className="pulse">
        <button type="button" className={over ? "hot" : ""} onClick={() => onJump("forfaldent")}><b>{over}</b><span>Forfaldne</span></button>
        <button type="button" onClick={() => onJump("uge")}><b>{week}</b><span>Næste 7 dage</span></button>
        <button type="button" onClick={() => onJump("loefter")}><b>{data.opgaver.length}</b><span>Løfter</span></button>
        <button type="button" onClick={() => onJump("pipeline")}><b>{new Intl.NumberFormat("da-DK", { notation: "compact", maximumFractionDigits: 0 }).format(pipe)}</b><span>I spil, kr.</span></button>
      </div>
    );
  }

  return (
    <header className="top">
      <div className="brand">
        <h1>Puls</h1>
        <div className="date">{date}</div>
      </div>
      {pulse}
      <div className="tools">
        <button className="btn" type="button" onClick={onRefresh} disabled={loading}>{loading ? "Henter…" : "Opdatér"}</button>
      </div>
    </header>
  );
}

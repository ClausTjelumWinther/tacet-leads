import { addDays, today } from "./dates";
import type { Data } from "./data";

// Toppen: dato og de fire tal, der fortæller, hvordan det står til.
export default function Header({ data, loading, onRefresh }: { data: Data | null; loading: boolean; onRefresh: () => void }) {
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
        <div className={over ? "hot" : ""}><b>{over}</b><span>Forfaldne</span></div>
        <div><b>{week}</b><span>Næste 7 dage</span></div>
        <div><b>{data.opgaver.length}</b><span>Løfter</span></div>
        <div><b>{new Intl.NumberFormat("da-DK", { notation: "compact", maximumFractionDigits: 0 }).format(pipe)}</b><span>I spil, kr.</span></div>
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

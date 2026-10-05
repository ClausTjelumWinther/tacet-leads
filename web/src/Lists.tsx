import { useState } from "react";
import { addDays, kr, today } from "./dates";
import { ACTIVE, STAGES, acceptForslag, completeTask, errorText, rejectForslag, type Data, type Projekt, type Stage } from "./data";
import { ForslagRow, Group, PersonRow, ProjectRow, TaskRow } from "./parts";
import type { FocusKey } from "./Focus";
import Maal from "./Maal";
import Kunder from "./Kunder";

export type Tab = "idag" | "pipeline" | "kunder" | "netvaerk" | "velatir" | "personer" | "maal";
export const TABS: { key: Tab; label: string }[] = [
  { key: "idag", label: "I dag" },
  { key: "pipeline", label: "Pipeline" },
  { key: "kunder", label: "Kunder" },
  { key: "netvaerk", label: "Netværk" },
  { key: "velatir", label: "Velatir" },
  { key: "personer", label: "Personer" },
  { key: "maal", label: "Mål" },
];

const byDate = (a: Projekt, b: Projekt) => (a.naeste_skridt_dato ?? "9999").localeCompare(b.naeste_skridt_dato ?? "9999");

export default function Lists({ data, tab, onTab, onOpen, onChanged, query, setQuery }:
  { data: Data; tab: Tab; onTab: (t: Tab) => void; onOpen: (k: FocusKey) => void; onChanged: () => Promise<void>;
    query: string; setQuery: (q: string) => void }) {
  const [showPrivate, setShowPrivate] = useState(false);
  const t = today(), w = addDays(t, 6);

  // Søgningen virker på tværs af alle faner.
  const q = query.trim().toLowerCase();
  const hit = (...f: (string | null | undefined)[]) => !q || f.some(x => x && x.toLowerCase().includes(q));
  const projekter = data.projekter.filter(p => hit(p.firma?.firmanavn, p.firma?.kontaktperson, p.naeste_skridt, p.produkt));
  const personer = data.personer.filter(x => hit(x.navn, x.firma?.firmanavn, x.noter));
  const open = (p: Projekt) => () => onOpen({ kind: "projekt", id: p.id });
  const pRow = (p: Projekt) => <ProjectRow key={p.id} p={p} onOpen={open(p)} />;

  const counts: Record<Tab, number> = {
    idag: data.projekter.filter(p => p.stage !== "tabt" && p.naeste_skridt_dato && p.naeste_skridt_dato <= w).length + data.opgaver.length,
    pipeline: data.projekter.filter(p => ACTIVE.includes(p.stage)).length,
    netvaerk: data.projekter.filter(p => p.stage === "netvaerk").length + data.personer.filter(x => x.kategori === "netvaerk").length,
    velatir: data.projekter.filter(p => p.velatir).length,
    personer: data.personer.filter(x => showPrivate || x.kategori !== "privat").length,
    maal: data.arrangementer.filter(a => a.dato >= t).length,
    kunder: data.projekter.filter(p => p.stage === "kunde").length,
  };

  let body;
  if (q) {
    // Når du søger, leder vi i alt – uanset fane. Private kontakter tages med, fordi du selv har spurgt efter dem.
    const ppl = personer.slice().sort((a, b) => a.navn.localeCompare(b.navn, "da"));
    const projs = projekter.slice().sort((a, b) => (a.stage === "tabt" ? 1 : 0) - (b.stage === "tabt" ? 1 : 0) || byDate(a, b));
    body = (
      <div className="grid split">
        <Group title="Personer" count={ppl.length} empty="Ingen personer matcher.">
          {ppl.map(x => <PersonRow key={x.id} x={x} onOpen={() => onOpen({ kind: "person", id: x.id })} />)}
        </Group>
        <Group title="Firmaer og projekter" count={projs.length} empty="Ingen firmaer eller projekter matcher.">{projs.map(pRow)}</Group>
      </div>
    );
  } else if (tab === "idag") {
    const live = projekter.filter(p => p.stage !== "tabt");
    const over = live.filter(p => p.naeste_skridt_dato && p.naeste_skridt_dato < t).sort(byDate);
    const soon = live.filter(p => p.naeste_skridt_dato && p.naeste_skridt_dato >= t && p.naeste_skridt_dato <= w).sort(byDate);
    // Et lead skal altid have en kommende action med dato. Netværk og kunder tæller med her.
    const nodate = live.filter(p => (ACTIVE.includes(p.stage) || p.stage === "netvaerk" || p.stage === "kunde") && (!p.naeste_skridt?.trim() || !p.naeste_skridt_dato));
    const tasks = data.opgaver
      .filter(o => hit(o.tekst, o.person?.navn, o.projekt?.firma?.firmanavn))
      .sort((a, b) => (a.forfald ?? "9999").localeCompare(b.forfald ?? "9999"));
    // Kør et forslag og vis fejlen, hvis det går galt.
    const doF = (fn: () => Promise<void>) => async () => { try { await fn(); await onChanged(); } catch (e) { alert(errorText(e)); } };
    body = (
      <>
      {data.forslag.length > 0 && (
        <Group id="forslag" title="Forslag fra Claude" count={data.forslag.length}>
          {data.forslag.map(f => <ForslagRow key={f.id} f={f} onYes={doF(() => acceptForslag(f))} onNo={doF(() => rejectForslag(f))} />)}
        </Group>
      )}
      <div className="grid split">
        <div>
          <Group id="forfaldent" title="Forfaldent" count={over.length} warn={over.length > 0} empty="Intet forfaldent. Du er ajour.">{over.map(pRow)}</Group>
          <Group id="uge" title="De næste 7 dage" count={soon.length} empty="Ingen næste skridt den kommende uge.">{soon.map(pRow)}</Group>
        </div>
        <div>
          <Group id="loefter" title="Små løfter" count={tasks.length} empty="Ingen åbne løfter.">
            {tasks.map(o => <TaskRow key={o.id} o={o} onDone={async () => { await completeTask(o.id); await onChanged(); }} />)}
          </Group>
          <Group title="Mangler næste skridt" count={nodate.length} warn={nodate.length > 0} empty="Alle leads har et næste skridt med dato.">{nodate.map(pRow)}</Group>
        </div>
      </div>
      </>
    );
  } else if (tab === "kunder") {
    // Kunderne har deres egen fane, så pipelinen kan handle om salg.
    body = <Kunder data={data} onOpen={onOpen} />;
  } else if (tab === "maal") {
    // Mål har sin egen side, så I dag-fokus ikke forstyrres.
    body = <Maal data={data} onOpen={onOpen} onChanged={onChanged} />;
  } else if (tab === "pipeline") {
    const col = (s: Stage) => {
      const rows = projekter.filter(p => p.stage === s).sort(byDate);
      const sum = rows.reduce((a, p) => a + (p.vaerdi ?? 0), 0);
      return <Group key={s} title={STAGES[s]} extra={sum ? kr(sum) : undefined} count={rows.length}>{rows.map(pRow)}</Group>;
    };
    const lost = data.projekter.filter(p => p.stage === "tabt").length;
    body = (
      <div className="grid split">
        <div>{col("tilbud")}{col("dialog")}</div>
        <div>{col("lead")}<div className="empty">Kunder står under fanen Kunder. {lost} tabte projekter er skjult.</div></div>
      </div>
    );
  } else if (tab === "netvaerk") {
    const rows = projekter.filter(p => p.stage === "netvaerk").sort(byDate);
    const ppl = personer.filter(x => x.kategori === "netvaerk");
    body = (
      <div className="grid split">
        <Group title="Leadgeneratorer" count={rows.length} empty="Ingen i netværket endnu.">{rows.map(pRow)}</Group>
        <Group title="Personer i netværket" count={ppl.length} empty="Skriv en note om en person, så dukker de op her.">
          {ppl.map(x => <PersonRow key={x.id} x={x} onOpen={() => onOpen({ kind: "person", id: x.id })} />)}
        </Group>
      </div>
    );
  } else if (tab === "velatir") {
    const rows = projekter.filter(p => p.velatir).sort(byDate);
    body = <Group title="Leads der peger på Velatir" count={rows.length} empty="Ingen leads er markeret til Velatir endnu.">{rows.map(pRow)}</Group>;
  } else {
    const ppl = personer
      .filter(x => showPrivate || x.kategori !== "privat")
      .sort((a, b) => (b.sidste_kontakt ?? "").localeCompare(a.sidste_kontakt ?? ""));
    const hidden = data.personer.filter(x => x.kategori === "privat").length;
    body = (
      <>
        <label className="toggle"><input type="checkbox" checked={showPrivate} onChange={e => setShowPrivate(e.target.checked)} /> Vis private kontakter ({hidden})</label>
        <Group title="Personer" count={ppl.length} empty="Ingen personer endnu. Tryk på + Note efter dit næste møde.">
          {ppl.map(x => <PersonRow key={x.id} x={x} onOpen={() => onOpen({ kind: "person", id: x.id })} />)}
        </Group>
      </>
    );
  }

  return (
    <>
      <nav className="tabs" role="tablist">
        {TABS.map(x => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => onTab(x.key)}>
            {x.label}<span className="n">{counts[x.key]}</span>
          </button>
        ))}
      </nav>
      <div className="searchbox">
        <input className="search" type="search" placeholder="Søg efter person, firma eller næste skridt" value={query}
          onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Escape") setQuery(""); }}
          autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" aria-label="Søg" />
        {query && <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Ryd søgning">✕</button>}
      </div>
      {body}
    </>
  );
}

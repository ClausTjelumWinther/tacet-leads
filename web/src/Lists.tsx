import { useState } from "react";
import { addDays, kr, today } from "./dates";
import { ACTIVE, FOKUS_LOFT, STAGES, acceptForslag, iFokus, venterPaaDem, completeTask, errorText, rejectForslag, type Data, type Projekt, type Stage } from "./data";
import { ForslagRow, Group, PersonRow, ProjectRow, TaskRow } from "./parts";
import type { FocusKey } from "./Focus";
import Maal from "./Maal";
import Kunder from "./Kunder";
import Mine from "./Mine";
import { tilOprydning } from "./Oprydning";

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

export default function Lists({ data, tab, onTab, onOpen, onChanged, query, setQuery, onRydOp }:
  { data: Data; tab: Tab; onTab: (t: Tab) => void; onOpen: (k: FocusKey) => void; onChanged: () => Promise<void>;
    query: string; setQuery: (q: string) => void; onRydOp: () => void }) {
  const [showPrivate, setShowPrivate] = useState(false);
  const [alleLoefter, setAlleLoefter] = useState(false);
  const [visHylde, setVisHylde] = useState(false);
  const t = today(), w = addDays(t, 6);

  // Søgningen virker på tværs af alle faner.
  const q = query.trim().toLowerCase();
  const hit = (...f: (string | null | undefined)[]) => !q || f.some(x => x && x.toLowerCase().includes(q));
  const projekter = data.projekter.filter(p => hit(p.firma?.firmanavn, p.firma?.kontaktperson, p.naeste_skridt, p.produkt));
  const personer = data.personer.filter(x => hit(x.navn, x.firma?.firmanavn, x.noter));
  const open = (p: Projekt) => () => onOpen({ kind: "projekt", id: p.id });
  const pRow = (p: Projekt) => <ProjectRow key={p.id} p={p} onOpen={open(p)} />;

  const counts: Record<Tab, number> = {
    idag: iFokus(data).length,
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
    // Fokus 7: I dag viser kun det, du har valgt at have i hovedet lige nu (højst 7),
    // delt efter hvor bolden ligger. Alt andet ligger på hylden og larmer ikke.
    const fokus = iFokus(data).filter(p => projekter.includes(p)).sort(byDate);
    const venter = fokus.filter(p => venterPaaDem(data, p));
    const dinTur = fokus.filter(p => !venter.includes(p));
    const ryd = tilOprydning(data);
    const hylde = projekter
      .filter(p => !p.fokus && p.stage !== "tabt" && !ryd.includes(p))
      .sort(byDate);
    const snart = hylde.filter(p => p.naeste_skridt_dato && p.naeste_skridt_dato <= w).length;
    const tasks = data.opgaver
      .filter(o => hit(o.tekst, o.person?.navn, o.projekt?.firma?.firmanavn))
      .sort((a, b) => (a.forfald ?? "9999").localeCompare(b.forfald ?? "9999"));
    // Løfter er fredet: de forsvinder aldrig, men kun de 3 ældste vises, til du beder om resten.
    const visTasks = alleLoefter ? tasks : tasks.slice(0, 3);
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
          <Group id="fokus" title="Din tur" extra={`${fokus.length}/${FOKUS_LOFT} i fokus`} count={dinTur.length}
            empty={fokus.length ? "Bolden er hos de andre. Godt gået." : "Intet i fokus endnu. Tryk Ryd op og vælg op til 7."}>
            {dinTur.map(pRow)}
          </Group>
          {venter.length > 0 && (
            <Group id="venter" title="Venter på dem" count={venter.length}>{venter.map(pRow)}</Group>
          )}
        </div>
        <div>
          <Group id="loefter" title="Små løfter" count={tasks.length} empty="Ingen åbne løfter.">
            {visTasks.map(o => <TaskRow key={o.id} o={o} onDone={async () => { await completeTask(o.id); await onChanged(); }} />)}
            {tasks.length > 3 && (
              <button type="button" className="linkbtn more" onClick={() => setAlleLoefter(!alleLoefter)}>
                {alleLoefter ? "Vis færre" : `Vis alle ${tasks.length}`}
              </button>
            )}
          </Group>
          <Mine data={data} onChanged={onChanged} />
        </div>
      </div>
      <section className="hylde" id="hylde">
        <div className="hylde-top">
          <div>
            <h2>Hylden</h2>
            <div className="muted">{hylde.length} parkeret{snart ? ` · ${snart} kommer frem den næste uge` : ""}</div>
          </div>
          <button type="button" className="linkbtn" onClick={() => setVisHylde(!visHylde)}>{visHylde ? "Skjul" : "Vis"}</button>
        </div>
        {ryd.length > 0 && (
          <button type="button" className="btn primary ryd-knap" onClick={onRydOp}>
            Ryd op · {ryd.length} {ryd.length === 1 ? "kort venter" : "kort venter"} på en beslutning
          </button>
        )}
        {visHylde && hylde.map(pRow)}
      </section>
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

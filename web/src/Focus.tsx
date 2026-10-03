import { useState } from "react";
import { addDays, kr, short, today } from "./dates";
import { KATEGORI, STAGES, addNote, errorText, moveNextStep, projectName, type Data } from "./data";
import { Contact, Group, PersonRow, ProjectRow, Timeline, WhenChip } from "./parts";
import { DictateButton } from "./Dictate";

export type FocusKey = { kind: "projekt" | "person"; id: string };

// Fokuskortet viser én person eller ét projekt ad gangen. Ingen andre rækker forstyrrer.
export default function Focus({ data, focusKey, tabLabel, onBack, onOpen, onChanged }: {
  data: Data; focusKey: FocusKey; tabLabel: string;
  onBack: () => void; onOpen: (k: FocusKey) => void; onChanged: () => Promise<void>;
}) {
  const [flash, setFlash] = useState<{ text: string; err?: boolean } | null>(null);

  // Kør en ændring, vis en kvittering, og hent frisk data bagefter.
  async function run(action: () => Promise<void>, ok: string) {
    try { await action(); setFlash({ text: ok }); await onChanged(); }
    catch (e) { setFlash({ text: errorText(e), err: true }); }
  }

  const back = <button type="button" className="back" onClick={onBack}>← Tilbage til {tabLabel}</button>;
  const flashEl = flash && <div className={`flash${flash.err ? " err" : ""}`} role="status">{flash.text}</div>;

  if (focusKey.kind === "projekt") {
    const p = data.projekter.find(x => x.id === focusKey.id);
    if (!p) return <div className="focus">{back}<div className="empty">Projektet findes ikke længere.</div></div>;
    const people = data.personer.filter(x => p.virksomhed_id && x.virksomhed_id === p.virksomhed_id);
    const others = data.projekter.filter(q => p.virksomhed_id && q.virksomhed_id === p.virksomhed_id && q.id !== p.id);
    const move = (n: number) => { const d = addDays(today(), n); run(() => moveNextStep(p.id, d), `Næste skridt er flyttet til ${short(d)}`); };

    return (
      <div className="focus">
        {back}
        <header>
          <div className="eyebrow">{STAGES[p.stage]}{p.velatir ? " · Velatir" : ""}</div>
          <h2 className="fname">{projectName(p)}</h2>
          <div className="fsub">
            {p.firma?.kontaktperson && <span>{p.firma.kontaktperson.trim()}</span>}
            <span>{p.produkt}</span>
            {p.vaerdi ? <span className="mono">{kr(p.vaerdi)}</span> : null}
          </div>
        </header>
        {flashEl}
        <div className="fgrid">
          <div className="fmain">
            <section className="panel">
              <div className="sec">Næste skridt</div>
              <p className={`bignext${p.naeste_skridt ? "" : " none"}`}>{p.naeste_skridt || "Intet næste skridt endnu"}</p>
              <div><WhenChip date={p.naeste_skridt_dato} /></div>
              <div className="acts">
                <span className="lbl">Flyt til</span>
                <button type="button" className="btn" onClick={() => move(1)}>I morgen</button>
                <button type="button" className="btn" onClick={() => move(3)}>+3 dage</button>
                <button type="button" className="btn" onClick={() => move(7)}>+1 uge</button>
                <button type="button" className="btn" onClick={() => move(14)}>+2 uger</button>
              </div>
            </section>
            <NoteBox key={p.id} placeholder="Fx: Kasper har budget fra januar" label="Gem note"
              onSave={text => run(() => addNote("projekt", p.id, text), "Noten er gemt")} />
            <section>
              <div className="ghead"><h2>Historik</h2><small>nyeste øverst</small></div>
              <Timeline noter={p.noter} />
            </section>
          </div>
          <aside className="fside">
            <section className="panel"><div className="sec">Kontakt</div><Contact email={p.firma?.email ?? null} phone={p.firma?.mobilnummer ?? null} /></section>
            <Group title="Hos samme firma" count={people.length + others.length} empty="Ingen andre personer eller projekter endnu.">
              {people.map(x => <PersonRow key={x.id} x={x} onOpen={() => onOpen({ kind: "person", id: x.id })} />)}
              {others.map(q => <ProjectRow key={q.id} p={q} onOpen={() => onOpen({ kind: "projekt", id: q.id })} />)}
            </Group>
          </aside>
        </div>
      </div>
    );
  }

  const x = data.personer.find(y => y.id === focusKey.id);
  if (!x) return <div className="focus">{back}<div className="empty">Personen findes ikke længere.</div></div>;
  const projs = data.projekter.filter(q => x.virksomhed_id && q.virksomhed_id === x.virksomhed_id);
  const colleagues = data.personer.filter(y => x.virksomhed_id && y.virksomhed_id === x.virksomhed_id && y.id !== x.id);

  return (
    <div className="focus">
      {back}
      <header>
        <div className="eyebrow">{KATEGORI[x.kategori]}</div>
        <h2 className="fname">{x.navn}</h2>
        <div className="fsub">
          {x.firma && <span>{x.firma.firmanavn.trim()}</span>}
          <span>{x.sidste_kontakt ? `Talt sammen ${short(x.sidste_kontakt)}` : "Ingen kontakt registreret"}</span>
        </div>
      </header>
      {flashEl}
      <div className="fgrid">
        <div className="fmain">
          <NoteBox key={x.id} placeholder="Hvad talte I om? Familie, interesser, hvad du lovede" label="Gem og sæt talt sammen til i dag"
            onSave={text => run(() => addNote("person", x.id, text), "Noten er gemt")} />
          <section>
            <div className="ghead"><h2>Det du ved om {x.navn.split(" ")[0]}</h2><small>nyeste øverst</small></div>
            <Timeline noter={x.noter} />
          </section>
        </div>
        <aside className="fside">
          <section className="panel"><div className="sec">Kontakt</div><Contact email={x.email} phone={x.mobilnummer} /></section>
          {projs.length > 0 && (
            <Group title="Projekter" count={projs.length}>
              {projs.map(q => <ProjectRow key={q.id} p={q} onOpen={() => onOpen({ kind: "projekt", id: q.id })} />)}
            </Group>
          )}
          {colleagues.length > 0 && (
            <Group title="Kolleger" count={colleagues.length}>
              {colleagues.map(y => <PersonRow key={y.id} x={y} onOpen={() => onOpen({ kind: "person", id: y.id })} />)}
            </Group>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Notefeltet, med knap til at indtale. */
function NoteBox({ placeholder, label, onSave }: { placeholder: string; label: string; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  async function save() {
    if (!text.trim()) { setHint("Skriv noten først."); return; }
    setBusy(true); setHint("");
    await onSave(text);
    setText(""); setBusy(false);
  }
  return (
    <section className="panel">
      <label className="sec" htmlFor="note">Notér</label>
      <textarea id="note" placeholder={placeholder} value={text} onChange={e => setText(e.target.value)} />
      <div className="acts">
        <DictateButton value={text} onChange={setText} />
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Gemmer…" : label}</button>
        {hint && <span className="status err">{hint}</span>}
      </div>
    </section>
  );
}

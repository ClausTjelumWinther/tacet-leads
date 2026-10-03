import { useState } from "react";
import { addDays, kr, short, today } from "./dates";
import { KATEGORI, STAGES, addNote, completeStep, completeTask, errorText, haendelserFor, moveNextStep, projectName, type Data } from "./data";
import NextStep from "./NextStep";
import { Activity, Contact, Group, PersonRow, ProjectRow, Promises, Timeline, WhenChip, boldenHosDig } from "./parts";
import NoteComposer, { saveTasks } from "./NoteComposer";

export type FocusKey = { kind: "projekt" | "person"; id: string };

// Fokuskortet viser én person eller ét projekt ad gangen. Ingen andre rækker forstyrrer.
export default function Focus({ data, focusKey, tabLabel, onBack, onOpen, onChanged }: {
  data: Data; focusKey: FocusKey; tabLabel: string;
  onBack: () => void; onOpen: (k: FocusKey) => void; onChanged: () => Promise<void>;
}) {
  const [flash, setFlash] = useState<{ text: string; err?: boolean } | null>(null);
  const [klaret, setKlaret] = useState(false);   // viser "Hvad er det næste?"

  // Kør en ændring, vis en kvittering, og hent frisk data bagefter.
  // rethrow=true: fejlen sendes videre, så notefeltet beholder din tekst, hvis gemningen fejler.
  async function run(action: () => Promise<void>, ok: string, rethrow = false) {
    try { await action(); setFlash({ text: ok }); await onChanged(); }
    catch (e) { setFlash({ text: errorText(e), err: true }); if (rethrow) throw e; }
  }

  const back = <button type="button" className="back" onClick={onBack}>← Tilbage til {tabLabel}</button>;
  const flashEl = flash && <div className={`flash${flash.err ? " err" : ""}`} role="status">{flash.text}</div>;

  if (focusKey.kind === "projekt") {
    const p = data.projekter.find(x => x.id === focusKey.id);
    if (!p) return <div className="focus">{back}<div className="empty">Projektet findes ikke længere.</div></div>;
    const people = data.personer.filter(x => p.virksomhed_id && x.virksomhed_id === p.virksomhed_id);
    const others = data.projekter.filter(q => p.virksomhed_id && q.virksomhed_id === p.virksomhed_id && q.id !== p.id);
    const akt = haendelserFor(data, { projekt: p });
    const loefterP = data.loefter.filter(l => l.projekt_id === p.id || (!!l.person_id && people.some(x => x.id === l.person_id)));
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
            {boldenHosDig(akt) && <span className="ball">Bolden er hos dig</span>}
          </div>
        </header>
        {flashEl}
        <div className="fgrid">
          <div className="fmain">
            <section className="panel">
              <div className="sec">Næste skridt</div>
              {klaret ? (
                <NextStep key={p.id} current={p.naeste_skridt} onCancel={() => setKlaret(false)}
                  onSave={(tekst, dato) => run(async () => { await completeStep(p.id, p.naeste_skridt, tekst, dato); setKlaret(false); },
                    `Næste skridt er sat til ${short(dato)}`, true)} />
              ) : (
                <>
                  <p className={`bignext${p.naeste_skridt ? "" : " none"}`}>{p.naeste_skridt || "Intet næste skridt endnu"}</p>
                  <div><WhenChip date={p.naeste_skridt_dato} /></div>
                  <div className="acts">
                    <button type="button" className="btn primary" onClick={() => setKlaret(true)}>
                      {p.naeste_skridt ? "✓ Klaret – hvad er det næste?" : "Sæt næste skridt"}</button>
                  </div>
                  {p.naeste_skridt && (
                    <div className="acts">
                      <span className="lbl">Eller flyt til</span>
                      <button type="button" className="btn" onClick={() => move(1)}>I morgen</button>
                      <button type="button" className="btn" onClick={() => move(3)}>+3 dage</button>
                      <button type="button" className="btn" onClick={() => move(7)}>+1 uge</button>
                      <button type="button" className="btn" onClick={() => move(14)}>+2 uger</button>
                    </div>
                  )}
                </>
              )}
            </section>
            <section className="panel">
              <label className="sec" htmlFor="note">Notér</label>
              <NoteComposer key={p.id} id="note" placeholder="" saveLabel="Gem note" target={{ type: "projekt", id: p.id }}
                onSave={(text, tasks) => run(async () => { await addNote("projekt", p.id, text); await saveTasks(tasks, { projekt_id: p.id }); }, "Noten er gemt", true)} />
            </section>
            <section>
              <div className="ghead"><h2>Historik</h2><small>nyeste øverst</small></div>
              <Timeline noter={p.noter} />
            </section>
          </div>
          <aside className="fside">
            <section className="panel"><div className="sec">Kontakt</div><Contact email={p.firma?.email ?? null} phone={p.firma?.mobilnummer ?? null} /></section>
            <section className="panel"><div className="sec">Små løfter</div>
              <Promises items={loefterP} onDone={id => run(() => completeTask(id), "Løftet er klaret")} /></section>
            <section className="panel"><div className="sec">Mails og møder</div><Activity items={akt} /></section>
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
  const aktP = haendelserFor(data, { person: x });
  const loefterX = data.loefter.filter(l => l.person_id === x.id);
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
          {boldenHosDig(aktP) && <span className="ball">Bolden er hos dig</span>}
        </div>
      </header>
      {flashEl}
      <div className="fgrid">
        <div className="fmain">
          <section className="panel">
            <label className="sec" htmlFor="note">Notér</label>
            <NoteComposer key={x.id} id="note" placeholder="" saveLabel="Gem og sæt talt sammen til i dag" target={{ type: "person", id: x.id }}
              onSave={(text, tasks) => run(async () => { await addNote("person", x.id, text); await saveTasks(tasks, { person_id: x.id }); }, "Noten er gemt", true)} />
          </section>
          <section>
            <div className="ghead"><h2>Det du ved om {x.navn.split(" ")[0]}</h2><small>nyeste øverst</small></div>
            <Timeline noter={x.noter} />
          </section>
        </div>
        <aside className="fside">
          <section className="panel"><div className="sec">Kontakt</div><Contact email={x.email} phone={x.mobilnummer} /></section>
          <section className="panel"><div className="sec">Små løfter</div>
            <Promises items={loefterX} onDone={id => run(() => completeTask(id), "Løftet er klaret")} /></section>
          <section className="panel"><div className="sec">Mails og møder</div><Activity items={aktP} /></section>
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

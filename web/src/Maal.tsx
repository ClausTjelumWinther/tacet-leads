import { useState } from "react";
import { addDays, daysFromToday, short, today } from "./dates";
import {
  errorText, projectName, setDeltagerStatus, setOver20,
  type Data, type Deltager, type DeltagerStatus, type Haendelse, type Maal as MaalT, type Projekt,
} from "./data";
import type { FocusKey } from "./Focus";

// Fanen "Mål": er jeg på vej mod målet for perioden?
// Q4 2026 handler om at fylde kalenderen i 2027. Derfor måler vi aktivitet, der fører til booking:
//   1) dage booket i Q1 2027   2) spændende møder   3) løfter holdt inden 48 timer   4) netværksmøder.

export default function Maal({ data, onOpen, onChanged }: { data: Data; onOpen: (k: FocusKey) => void; onChanged: () => Promise<void> }) {
  const t = today();
  // Den aktuelle periode er den, dagens dato ligger i. Ellers den næste.
  const perioder = [...new Set(data.maal.map(m => m.periode))];
  const periode = perioder.find(p => data.maal.some(m => m.periode === p && m.start <= t && t <= m.slut))
    ?? perioder.find(p => data.maal.some(m => m.periode === p && m.start > t));
  const mål = data.maal.filter(m => m.periode === periode);
  if (!periode || !mål.length) return <div className="empty">Der er ingen mål for perioden endnu. Sig til Claude, hvad du vil nå.</div>;

  const { start, slut, fokus } = mål[0];
  const uger = Math.max(0, Math.ceil(daysFromToday(slut) / 7));
  const get = (k: string) => mål.find(m => m.noegle === k);

  async function run(fn: () => Promise<void>) {
    try { await fn(); await onChanged(); } catch (e) { alert(errorText(e)); }
  }

  return (
    <div className="maal">
      <section className="maal-head">
        <div className="eyebrow">{periode} · {short(start)}–{short(slut)} · {uger} {uger === 1 ? "uge" : "uger"} tilbage</div>
        {fokus && <p className="maal-fokus">{fokus}</p>}
      </section>
      <div className="grid split">
        <div>
          {/* Booket tid i næste kvartal. Måles i timer (sådan fakturerer du), tidligere i dage. */}
          {(get("timer_q1_2027") ?? get("dage_q1_2027")) && <Booket m={(get("timer_q1_2027") ?? get("dage_q1_2027"))!} data={data} uger={uger} />}
          {get("spaendende_moeder") && <Moeder m={get("spaendende_moeder")!} data={data} start={start} slut={slut} uger={uger} onOpen={onOpen}
            onOver20={(id, v) => run(() => setOver20(id, v))} />}
        </div>
        <div>
          {get("loefter_48t") && <Loefter m={get("loefter_48t")!} data={data} start={start} />}
          <Arrangementer data={data} onStatus={(d, s) => run(() => setDeltagerStatus(d.id, s))} />
        </div>
      </div>
    </div>
  );
}

/** Bjælke fra 0 til "perfekt" med en streg ved "tilfredsstillende". */
function Meter({ value, m }: { value: number; m: MaalT }) {
  const maal = Number(m.maal), perfekt = Number(m.perfekt);
  const top = perfekt || maal || 1;
  const pct = Math.min(100, (value / top) * 100);
  const mark = maal && perfekt ? (maal / perfekt) * 100 : null;
  const ok = !!maal && value >= maal;
  return (
    <div className="meter" role="img" aria-label={`${value} af ${m.maal ?? top} ${m.enhed ?? ""}`}>
      <div className={`meter-fill${ok ? " ok" : ""}`} style={{ width: `${pct}%` }} />
      {mark != null && <div className="meter-mark" style={{ left: `${mark}%` }} />}
    </div>
  );
}

function Tal({ value, m, suffix }: { value: number | string; m: MaalT; suffix?: string }) {
  return (
    <p className="maal-tal">
      <b>{value}</b>{suffix}
      <span className="muted"> af {m.maal}{m.enhed === "%" ? " %" : ""} · perfekt {m.perfekt}{m.enhed === "%" ? " %" : ` ${m.enhed ?? ""}`}</span>
    </p>
  );
}

// ---------- 1. Booket tid i Q1 2027 ----------
const TIMEPRIS = 1500; // kr. pr. time, som hos KEN

function Booket({ m, data }: { m: MaalT; data: Data; uger: number }) {
  const seneste = data.maalinger.find(x => x.noegle === m.noegle);
  const v = Number(seneste?.vaerdi ?? 0);
  const timer = m.enhed === "timer";
  return (
    <section className="panel maal-kort">
      <div className="sec">{m.titel}</div>
      <Tal value={fmt(v)} m={m} />
      <Meter value={v} m={m} />
      <p className="muted small">
        {timer && <>≈ {kr(v * TIMEPRIS)} · målet er {kr(Number(m.maal) * TIMEPRIS)}, perfekt {kr(Number(m.perfekt) * TIMEPRIS)}. </>}
        {seneste ? `Talt i kalenderen ${short(seneste.dato)}.` : "Ikke talt endnu."} 14 t/uge = tilfredsstillende, 21 t/uge = perfekt.
      </p>
      {seneste && seneste.detaljer.length > 0 && (
        <ul className="maal-liste">
          {seneste.detaljer.map((d, i) => (
            <li key={i}><span className="d">{d.dato ? short(d.dato) : ""}</span> {d.titel}
              {d.timer ? <span className="muted"> · {fmt(d.timer)} t</span> : d.dage ? <span className="muted"> · {fmt(d.dage)} d</span> : null}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- 2. Spændende møder ----------
function Moeder({ m, data, start, slut, uger, onOpen, onOver20 }: {
  m: MaalT; data: Data; start: string; slut: string; uger: number; onOpen: (k: FocusKey) => void;
  onOver20: (virksomhedId: string, v: boolean) => void;
}) {
  const t = today();
  const mandag = addDays(t, -((new Date(t + "T12:00:00Z").getUTCDay() + 6) % 7));
  const projekt = (h: Haendelse) => data.projekter.find(p => p.id === h.projekt_id);

  // Ét møde pr. dag og modpart. Møder i fremtiden tæller med: de er booket.
  const set = new Map<string, Haendelse>();
  for (const h of data.haendelser) {
    if (h.type !== "moede" || h.dato < start || h.dato > slut) continue;
    set.set(`${h.dato}:${h.projekt_id ?? h.email}`, h);
  }
  const alle = [...set.values()].sort((a, b) => a.dato.localeCompare(b.dato));
  const spaendende = alle.filter(h => projekt(h)?.firma?.over20 === true);
  const ukendte = alle.filter(h => { const p = projekt(h); return p?.virksomhed_id && p.firma?.over20 == null; });
  const denneUge = spaendende.filter(h => h.dato >= mandag && h.dato <= addDays(mandag, 6)).length;

  // Hvilke firmaer skal du tage stilling til? Kun én gang pr. firma.
  const tilVurdering = [...new Map(ukendte.map(h => [projekt(h)!.virksomhed_id!, projekt(h)!])).values()];

  return (
    <section className="panel maal-kort">
      <div className="sec">{m.titel}</div>
      <Tal value={spaendende.length} m={m} />
      <Meter value={spaendende.length} m={m} />
      <p className="muted small">Denne uge: {denneUge}. {takt(Number(m.maal) - spaendende.length, uger)}</p>
      {spaendende.length > 0 && (
        <ul className="maal-liste">
          {spaendende.map(h => (
            <li key={h.id}><span className="d">{short(h.dato)}</span>
              <button type="button" className="linkbtn" onClick={() => onOpen({ kind: "projekt", id: h.projekt_id! })}>{projectName(projekt(h)!)}</button>
              {h.dato > t && <span className="pill">booket</span>}</li>
          ))}
        </ul>
      )}
      {tilVurdering.length > 0 && (
        <div className="vurder">
          <div className="sec">Over 20 funktionærer?</div>
          {tilVurdering.map((p: Projekt) => (
            <div className="vurder-row" key={p.virksomhed_id!}>
              <span>{projectName(p)}</span>
              <span className="acts">
                <button type="button" className="btn" onClick={() => onOver20(p.virksomhed_id!, true)}>Ja</button>
                <button type="button" className="btn" onClick={() => onOver20(p.virksomhed_id!, false)}>Nej</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- 3. Løfter holdt inden 48 timer ----------
function Loefter({ m, data, start }: { m: MaalT; data: Data; start: string }) {
  const t = today();
  // Kun løfter, der har haft 48 timer at blive holdt i, tæller med.
  const relevante = data.loefter.filter(l => {
    const d = l.oprettet.slice(0, 10);
    return d >= start && addDays(d, 2) <= t;
  });
  const holdt = relevante.filter(l => l.faerdig && l.faerdig_dato && l.faerdig_dato <= addDays(l.oprettet.slice(0, 10), 2)).length;
  const pct = relevante.length ? Math.round((holdt / relevante.length) * 100) : 100;
  const forfaldne = data.opgaver.filter(o => o.forfald && o.forfald < t).length;
  return (
    <section className="panel maal-kort">
      <div className="sec">{m.titel}</div>
      <Tal value={pct} suffix=" %" m={m} />
      <Meter value={pct} m={m} />
      <p className="muted small">{holdt} af {relevante.length} løfter holdt til tiden. {forfaldne ? `${forfaldne} er forfaldne nu.` : "Ingen forfaldne lige nu."}</p>
    </section>
  );
}

// ---------- 4. Netværksmøder ----------
const STATUS: { k: DeltagerStatus; label: string }[] = [
  { k: "inviteret", label: "Inviteret" }, { k: "tilmeldt", label: "Tilmeldt" }, { k: "moedt", label: "Mødt" }, { k: "afbud", label: "Afbud" },
];

function Arrangementer({ data, onStatus }: { data: Data; onStatus: (d: Deltager, s: DeltagerStatus) => void }) {
  const [aaben, setAaben] = useState<string | null>(null);
  const t = today();

  // Opfølgningsmøde = et møde med samme person/firma efter arrangementet.
  const opfoelgning = (d: Deltager, dato: string) => data.haendelser.some(h => h.type === "moede" && h.dato > dato &&
    ((d.email && h.email?.toLowerCase() === d.email.toLowerCase()) || (d.person_id && h.person_id === d.person_id) || (d.projekt_id && h.projekt_id === d.projekt_id)));

  return (
    <section className="panel maal-kort">
      <div className="sec">Netværksmøder → opfølgningsmøder</div>
      {data.arrangementer.length === 0 && <div className="empty tight">Ingen arrangementer endnu.</div>}
      {data.arrangementer.map(a => {
        const dl = data.deltagere.filter(d => d.arrangement_id === a.id);
        const n = (s: DeltagerStatus) => dl.filter(d => d.status === s).length;
        const opf = dl.filter(d => opfoelgning(d, a.dato)).length;
        const forbi = a.dato < t;
        return (
          <div className={`arr${forbi ? " forbi" : ""}`} key={a.id}>
            <button type="button" className="arr-head" onClick={() => setAaben(aaben === a.id ? null : a.id)} aria-expanded={aaben === a.id}>
              <span className="d">{short(a.dato)}</span>
              <span className="arr-navn">{a.navn}</span>
              <span className="arr-tal">
                {dl.length ? <>{dl.length - n("afbud")} inv. · {n("tilmeldt")} tilm. · {n("moedt")} mødt · <b>{opf} opf.</b></> : <span className="muted">ingen deltagere</span>}
              </span>
            </button>
            {aaben === a.id && dl.length > 0 && (
              <ul className="arr-liste">
                {dl.map(d => (
                  <li key={d.id}>
                    <span className="arr-person">{d.navn}{opfoelgning(d, a.dato) && <span className="pill t-moede">møde booket</span>}</span>
                    <span className="seg">
                      {STATUS.map(s => (
                        <button type="button" key={s.k} className={d.status === s.k ? "on" : ""} onClick={() => onStatus(d, s.k)}>{s.label}</button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** "Takt: 1 om ugen" ud fra hvor mange der mangler, og hvor mange uger der er tilbage. */
function takt(mangler: number, uger: number): string {
  if (mangler <= 0) return "Målet er nået.";
  if (uger <= 0) return `${mangler} mangler.`;
  const pr = mangler / uger;
  return `Takt til målet: ${pr < 1 ? `1 hver ${Math.round(1 / pr)}. uge` : `${Math.ceil(pr)} om ugen`}.`;
}

const kr = (n: number) => new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(n) + " kr.";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

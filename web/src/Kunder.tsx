import { daysFromToday, kr, short, today } from "./dates";
import { projectName, type Data, type Projekt } from "./data";
import { Group, WhenChip } from "./parts";
import type { FocusKey } from "./Focus";

// Fanen "Kunder": hvor er der chance for genkøb?
// Genkøb er alt, du kan sende faktura på: nyt forløb, nyt hold, oplæg og Velatir.
//   I gang            – der ligger en leverance i fremtiden
//   Klar til genkøb   – sidste leverance for højst 4 måneder siden (det bedste vindue)
//   Sovende           – mere end 4 måneder siden, eller vi kender ikke datoen

const VINDUE = 120; // dage

type Status = { gruppe: "igang" | "klar" | "sovende"; naeste: string | null; sidste: string | null };

/** Find kundens status ud fra leverancer i hændelserne, sidste leverance og salgsdatoen. */
export function kundeStatus(p: Projekt, data: Data): Status {
  const t = today();
  const lev = data.haendelser.filter(h => h.type === "levering" && h.projekt_id === p.id).map(h => h.dato).sort();
  const naeste = lev.find(d => d >= t) ?? null;
  const foer = lev.filter(d => d < t);
  const kandidater = [foer[foer.length - 1], p.sidste_leverance, p.dato].filter((d): d is string => !!d && d <= t).sort();
  const sidste = kandidater[kandidater.length - 1] ?? null;
  if (naeste) return { gruppe: "igang", naeste, sidste };
  if (sidste && -daysFromToday(sidste) <= VINDUE) return { gruppe: "klar", naeste: null, sidste };
  return { gruppe: "sovende", naeste: null, sidste };
}

/** "for 3 uger siden" / "for 4 mdr. siden" */
function siden(iso: string): string {
  const d = -daysFromToday(iso);
  if (d < 14) return `for ${d} dage siden`;
  if (d < 60) return `for ${Math.round(d / 7)} uger siden`;
  return `for ${Math.round(d / 30)} mdr. siden`;
}

export default function Kunder({ data, onOpen }: { data: Data; onOpen: (k: FocusKey) => void }) {
  const kunder = data.projekter.filter(p => p.stage === "kunde");
  const med = kunder.map(p => ({ p, s: kundeStatus(p, data) }));
  const grp = (g: Status["gruppe"]) => med.filter(x => x.s.gruppe === g)
    .sort((a, b) => (b.s.sidste ?? "").localeCompare(a.s.sidste ?? ""));
  const igang = grp("igang"), klar = grp("klar"), sovende = grp("sovende");
  const omsaetning = kunder.reduce((a, p) => a + (p.vaerdi ?? 0), 0);

  const row = ({ p, s }: { p: Projekt; s: Status }) => (
    <button type="button" key={p.id} className="row kunde" onClick={() => onOpen({ kind: "projekt", id: p.id })}>
      <span className="who">{projectName(p)}{p.velatir && <span className="pill">Velatir</span>}</span>
      <span className="side"><WhenChip date={p.naeste_skridt_dato} /></span>
      <span className="next">
        {p.produkt}{p.vaerdi ? ` · ${kr(p.vaerdi)}` : ""}
        {s.naeste ? ` · næste leverance ${short(s.naeste)}` : s.sidste ? ` · sidst ${siden(s.sidste)}` : " · dato mangler"}
      </span>
      <span className={`genkoeb${p.genkoeb ? "" : " none"}`}>{p.genkoeb ? `Genkøb: ${p.genkoeb}` : "Ingen genkøbsidé endnu"}</span>
    </button>
  );

  return (
    <>
      <p className="muted small kunder-intro">{kunder.length} kunder · {kr(omsaetning)} i alt. Genkøb er alt, du kan fakturere, også Velatir.</p>
      <div className="grid split">
        <div>
          <Group title="Klar til genkøb" extra="sidst leveret inden for 4 mdr." count={klar.length} empty="Ingen lige nu.">{klar.map(row)}</Group>
          <Group title="I gang" count={igang.length} empty="Ingen igangværende leverancer.">{igang.map(row)}</Group>
        </div>
        <div>
          <Group title="Sovende" extra="over 4 mdr. siden" count={sovende.length} empty="Ingen sovende kunder.">{sovende.map(row)}</Group>
        </div>
      </div>
    </>
  );
}

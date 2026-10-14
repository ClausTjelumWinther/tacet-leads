import type { NytLead, NyNetvaerk } from "./data";
import { addDays, today } from "./dates";

// Felterne til et nyt lead. Bruges både i "+ Note" (når du skriver) og ved mikrofonen (når Claude har udfyldt dem).
// Tre ting er påkrævet, for et lead uden dem bliver glemt: firma, næste skridt og en dato.

export const tomtLead = (firmanavn = ""): NytLead =>
  ({ firmanavn, kontaktperson: "", email: "", mobil: "", produkt: "", naeste_skridt: "", naeste_skridt_dato: addDays(today(), 2) });

/** Returnerer en fejltekst, hvis noget påkrævet mangler. Ellers null. */
export function leadMangler(l: NytLead): string | null {
  if (!l.firmanavn.trim()) return "Skriv firmanavnet.";
  if (!l.naeste_skridt.trim()) return "Skriv det næste skridt, så leadet ikke bliver glemt.";
  if (!l.naeste_skridt_dato) return "Vælg en dato for næste skridt.";
  return null;
}

export default function LeadFields({ value, onChange, idPrefix }: { value: NytLead; onChange: (l: NytLead) => void; idPrefix: string }) {
  const set = (k: keyof NytLead) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="lead-fields">
      <label htmlFor={id("firma")}>Firma <span className="req">påkrævet</span></label>
      <input id={id("firma")} value={value.firmanavn} onChange={set("firmanavn")} autoComplete="organization" />

      <div className="lf-two">
        <div>
          <label htmlFor={id("kontakt")}>Kontaktperson</label>
          <input id={id("kontakt")} value={value.kontaktperson ?? ""} onChange={set("kontaktperson")} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={id("produkt")}>Handler om</label>
          <input id={id("produkt")} value={value.produkt ?? ""} onChange={set("produkt")} placeholder="AI" autoComplete="off" />
        </div>
      </div>

      <div className="lf-two">
        <div>
          <label htmlFor={id("mail")}>Mail</label>
          <input id={id("mail")} type="email" inputMode="email" value={value.email ?? ""} onChange={set("email")} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={id("mobil")}>Mobil</label>
          <input id={id("mobil")} type="tel" inputMode="tel" value={value.mobil ?? ""} onChange={set("mobil")} autoComplete="off" />
        </div>
      </div>

      <label htmlFor={id("ns")}>Næste skridt <span className="req">påkrævet</span></label>
      <div className="lf-next">
        <input id={id("ns")} value={value.naeste_skridt} onChange={set("naeste_skridt")} placeholder="Fx send oplæg om AI i kundeservice" autoComplete="off" />
        <input type="date" aria-label="Dato for næste skridt" value={value.naeste_skridt_dato} onChange={set("naeste_skridt_dato")} />
      </div>
    </div>
  );
}

// ---------- Netværksperson ----------
// Samme idé som et lead, men personen er det vigtige. Firma er valgfrit.

export const tomtNetvaerk = (navn = ""): NyNetvaerk =>
  ({ navn, firma: "", email: "", mobil: "", naeste_skridt: "", naeste_skridt_dato: addDays(today(), 7) });

export function netvaerkMangler(n: NyNetvaerk): string | null {
  if (!n.navn.trim()) return "Skriv personens navn.";
  if (!n.naeste_skridt.trim()) return "Skriv det næste skridt, så kontakten ikke bliver glemt.";
  if (!n.naeste_skridt_dato) return "Vælg en dato for næste skridt.";
  return null;
}

export function NetvaerkFields({ value, onChange, idPrefix }: { value: NyNetvaerk; onChange: (n: NyNetvaerk) => void; idPrefix: string }) {
  const set = (k: keyof NyNetvaerk) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="lead-fields">
      <div className="lf-two">
        <div>
          <label htmlFor={id("navn")}>Navn <span className="req">påkrævet</span></label>
          <input id={id("navn")} value={value.navn} onChange={set("navn")} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={id("firma")}>Firma</label>
          <input id={id("firma")} value={value.firma ?? ""} onChange={set("firma")} autoComplete="off" />
        </div>
      </div>

      <div className="lf-two">
        <div>
          <label htmlFor={id("mail")}>Mail</label>
          <input id={id("mail")} type="email" inputMode="email" value={value.email ?? ""} onChange={set("email")} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={id("mobil")}>Mobil</label>
          <input id={id("mobil")} type="tel" inputMode="tel" value={value.mobil ?? ""} onChange={set("mobil")} autoComplete="off" />
        </div>
      </div>

      <label htmlFor={id("ns")}>Næste skridt <span className="req">påkrævet</span></label>
      <div className="lf-next">
        <input id={id("ns")} value={value.naeste_skridt} onChange={set("naeste_skridt")} placeholder="Fx foreslå en kop kaffe" autoComplete="off" />
        <input type="date" aria-label="Dato for næste skridt" value={value.naeste_skridt_dato} onChange={set("naeste_skridt_dato")} />
      </div>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { kr, short, whenLabel } from "./dates";
import { KATEGORI, STAGES, projectName, type ClaudeForslag, type Haendelse, type Opgave, type Person, type Projekt } from "./data";

// Små genbrugelige byggesten. Hver funktion her er en "komponent": den tager data ind og returnerer HTML.

export function WhenChip({ date }: { date: string | null }) {
  if (!date) return <span className="when nodate">uden dato</span>;
  const w = whenLabel(date);
  return <span className={`when${w.over ? " over" : ""}`}>{w.text}</span>;
}

export function Group({ id, title, extra, count, warn, empty, children }:
  { id?: string; title: string; extra?: string; count: number; warn?: boolean; empty?: string; children?: ReactNode }) {
  return (
    <section className="group" id={id}>
      <div className={`ghead${warn ? " warn" : ""}`}>
        <h2>{title}{extra && <span className="ghead-extra"> · {extra}</span>}</h2>
        <small>{count}</small>
      </div>
      {count ? children : <div className="empty">{empty ?? "Intet her."}</div>}
    </section>
  );
}

export function ProjectRow({ p, onOpen }: { p: Projekt; onOpen: () => void }) {
  return (
    <button type="button" className="row" onClick={onOpen}>
      <span className="who">
        {projectName(p)}
        {p.firma?.kontaktperson && <span className="person">· {p.firma.kontaktperson.trim()}</span>}
        {p.stage !== "netvaerk" && <span className="pill">{STAGES[p.stage]}</span>}
        {p.velatir && <span className="pill v">Velatir</span>}
      </span>
      <span className="side">
        <WhenChip date={p.naeste_skridt_dato} />
        {p.vaerdi ? <span className="val">{kr(p.vaerdi)}</span> : null}
      </span>
      <span className={`next${p.naeste_skridt ? "" : " none"}`}>{p.naeste_skridt || "Intet næste skridt"}</span>
    </button>
  );
}

export function PersonRow({ x, onOpen }: { x: Person; onOpen: () => void }) {
  const first = (x.noter ?? "").split("\n")[0];
  return (
    <button type="button" className="row" onClick={onOpen}>
      <span className="who">
        {x.navn}
        {x.firma && <span className="person">· {x.firma.firmanavn.trim()}</span>}
        <span className="pill">{KATEGORI[x.kategori]}</span>
      </span>
      <span className="side"><span className="val">{x.sidste_kontakt ? `Talt sammen ${short(x.sidste_kontakt)}` : "Ingen kontakt endnu"}</span></span>
      <span className={`next${first ? "" : " none"}`}>{first || "Ingen noter endnu"}</span>
    </button>
  );
}

export function TaskRow({ o, onDone }: { o: Opgave; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const who = o.person?.navn || o.projekt?.firma?.firmanavn?.trim() || "";
  return (
    <div className="row static">
      <span className="who">{o.tekst}</span>
      <span className="side">
        <WhenChip date={o.forfald} />
        <button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await onDone(); } finally { setBusy(false); } }}>
          {busy ? "Gemmer…" : "Færdig"}
        </button>
      </span>
      <span className={`next${who ? "" : " none"}`}>{who || "Uden person"}</span>
    </div>
  );
}

/** Email og telefon som tekst man kan markere, med kopiér-knap og direkte link. */
export function Contact({ email, phone }: { email: string | null; phone: string | null }) {
  if (!email && !phone) return <div className="empty tight">Ingen kontaktoplysninger endnu.</div>;
  return (
    <div className="contact">
      {email && <CopyLine value={email} href={`mailto:${email}`} />}
      {phone && <CopyLine value={phone.trim()} href={`tel:${phone.replace(/\s/g, "")}`} />}
    </div>
  );
}

function CopyLine({ value, href }: { value: string; href: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copyline">
      <a href={href} className="sel">{value}</a>
      <button type="button" className="linkbtn" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignorer */ }
      }}>{copied ? "Kopieret" : "Kopiér"}</button>
    </div>
  );
}

/** Noter er skrevet som "DD/MM/YYYY: tekst", nyeste øverst. Her bliver de til en tidslinje. */
export function Timeline({ noter }: { noter: string | null }) {
  const lines = (noter ?? "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return <div className="empty tight">Ingen noter endnu. Skriv den første ovenfor.</div>;
  return (
    <ol className="tl">
      {lines.map((l, i) => {
        const m = l.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[:\-]?\s+(.*)$/);
        return <li key={i}><span className="d">{m ? m[1] : ""}</span><span>{m ? m[2] : l}</span></li>;
      })}
    </ol>
  );
}

const TYPE: Record<Haendelse["type"], string> = { mail_ind: "Mail ind", mail_ud: "Mail ud", moede: "Møde", invitation: "Invitation" };

/** Mails, møder og invitationer fra morgen-gennemgangen. Kun fakta, dine egne noter står for sig. */
export function Activity({ items }: { items: Haendelse[] }) {
  if (!items.length) return <div className="empty tight">Ingen mails eller møder registreret endnu.</div>;
  return (
    <ol className="tl act">
      {items.slice(0, 12).map(h => (
        <li key={h.id}><span className="d">{short(h.dato)}</span>
          <span><span className={`pill t-${h.type}`}>{TYPE[h.type]}</span> {h.titel}</span></li>
      ))}
    </ol>
  );
}

/** Ligger bolden hos dig? Ja, hvis det seneste er en mail ind. */
export const boldenHosDig = (items: Haendelse[]) => items.length > 0 && items[0].type === "mail_ind";

/** Et forslag fra Claude med Ja og Nej. Intet ændres, før du trykker Ja. */
export function ForslagRow({ f, onYes, onNo }: { f: ClaudeForslag; onYes: () => Promise<void>; onNo: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const go = (fn: () => Promise<void>) => async () => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  return (
    <div className="row static">
      <span className="who">{f.tekst}</span>
      <span className="side">
        <button type="button" className="btn primary" disabled={busy} onClick={go(onYes)}>Ja</button>
        <button type="button" className="btn" disabled={busy} onClick={go(onNo)}>Nej</button>
      </span>
    </div>
  );
}

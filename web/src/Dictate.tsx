import { useEffect, useRef, useState } from "react";
import { retNavne } from "./ordbog";

// Diktering: telefonens/browserens indbyggede talegenkendelse (Chrome, Edge og Safari). Ingen AI, ingen omkostning.
// Både den lille mikrofon (fx "Til mig selv") og den store mikrofonknap bruger useDiktat herunder,
// så de opfører sig ens.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRec: any = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

/** Kan denne browser lytte? Hvis ikke, viser vi slet ikke knappen. */
export const canDictate = !!SpeechRec;

/**
 * Lyt og skriv. `hent` giver den tekst, der står i feltet, når du trykker start.
 * `skriv` får hele teksten (færdige sætninger) og det, der lige nu bliver genkendt (live).
 *
 * Det vigtige her er, at der kun må være ÉN aktiv talegenkendelse ad gangen.
 * Især iPhone nægter at starte en ny, hvis en gammel stadig holder på mikrofonen.
 * Derfor bliver den gamle altid afbrudt (abort), før en ny starter.
 */
export function useDiktat({ hent, skriv }: { hent: () => string; skriv: (tekst: string, live: string) => void }) {
  const [lytter, setLytter] = useState(false);
  const [fejl, setFejl] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const wantRef = useRef(false);   // vil vi stadig lytte? (Safari stopper selv efter en pause)
  const baseRef = useRef("");      // tekst før den aktuelle lytte-runde
  const cb = useRef({ hent, skriv });
  cb.current = { hent, skriv };

  /** Slip mikrofonen helt. Den gamle genkendelse må ikke længere ændre noget. */
  function afbryd() {
    const r = recRef.current;
    recRef.current = null;
    if (!r) return;
    r.onresult = null; r.onerror = null; r.onend = null;
    try { r.abort(); } catch { /* var allerede stoppet */ }
  }

  function start() {
    if (!SpeechRec) return;
    afbryd();                      // ryd op efter sidst, før vi beder om mikrofonen igen
    setFejl("");
    const nu = cb.current.hent();
    baseRef.current = nu.trim() ? nu.trimEnd() + " " : "";
    wantRef.current = true;
    let tommeRunder = 0;           // runder i træk, hvor intet blev hørt

    const rec = new SpeechRec();
    rec.lang = "da-DK";
    rec.continuous = true;
    rec.interimResults = true;
    let finals = "";
    let hoerte = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      hoerte = true;
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += retNavne(r[0].transcript) + " ";
        else live += r[0].transcript;
      }
      cb.current.skriv((baseRef.current + finals).trimStart(), live);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantRef.current = false;
        setFejl("Ingen adgang til mikrofonen. Giv adgang i indstillingerne, eller brug mikrofonen på tastaturet.");
      } else if (e.error === "audio-capture") {
        wantRef.current = false;
        setFejl("Mikrofonen er optaget eller blev ikke fundet. Prøv igen om et øjeblik.");
      } else if (e.error === "network") {
        wantRef.current = false;
        setFejl("Talegenkendelsen kræver internet. Prøv igen.");
      }
      // "no-speech" og "aborted" er ikke rigtige fejl: onend kommer bagefter og tager sig af det.
    };
    rec.onend = () => {
      // Gem det hørte, og fjern den grå live-tekst.
      baseRef.current = (baseRef.current + finals).trimStart();
      if (baseRef.current && !baseRef.current.endsWith(" ")) baseRef.current += " ";
      finals = "";
      cb.current.skriv(baseRef.current, "");
      tommeRunder = hoerte ? 0 : tommeRunder + 1;
      hoerte = false;
      // Safari stopper efter en pause. Vi lytter videre, men giver op efter tre tomme runder,
      // så den ikke kører i ring og holder på mikrofonen.
      if (wantRef.current && tommeRunder < 3) {
        try { rec.start(); return; } catch { /* kunne ikke starte igen */ }
      }
      wantRef.current = false;
      if (recRef.current === rec) recRef.current = null;
      setLytter(false);
    };
    recRef.current = rec;
    try { rec.start(); setLytter(true); }
    catch { afbryd(); wantRef.current = false; setFejl("Mikrofonen kunne ikke starte. Prøv igen."); }
  }

  /** Stop pænt, så den sidste sætning når at komme med. Kommer der ikke et svar, slipper vi selv mikrofonen. */
  function stop() {
    wantRef.current = false;
    setLytter(false);
    const r = recRef.current;
    if (!r) return;
    try { r.stop(); } catch { /* var allerede stoppet */ }
    setTimeout(() => { if (recRef.current === r) afbryd(); }, 1500);
  }

  /** Stop med det samme og smid det, der ikke er nået frem (fx når teksten lige er gemt). */
  function slip() {
    wantRef.current = false;
    afbryd();
    setLytter(false);
  }

  // Luk mikrofonen, når komponenten forsvinder.
  useEffect(() => () => { wantRef.current = false; afbryd(); }, []);

  return { lytter, fejl, start, stop, slip };
}

/** compact = kun mikrofon-ikonet, til steder hvor der er trangt (fx "Til mig selv"). */
export function DictateButton({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const sidstRef = useRef(value);  // det, vi selv skrev i feltet sidst
  const valueRef = useRef(value);
  valueRef.current = value;
  const { lytter, fejl, start, stop, slip } = useDiktat({
    hent: () => valueRef.current,
    skriv: (tekst, live) => {
      const v = (tekst + live).trimStart();
      sidstRef.current = v;
      onChange(v);
    },
  });

  // Bliver feltet tømt udefra (fx når du trykker Tilføj, mens den lytter), så stopper vi.
  // Ellers ville den lytte videre og skrive den gamle tekst ind igen, og næste tryk ville ikke virke.
  useEffect(() => {
    if (lytter && value === "" && sidstRef.current !== "") slip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, lytter]);

  if (!canDictate) return null;

  return (
    <>
      <button type="button" className={`dictate${lytter ? " on" : ""}${compact ? " compact" : ""}`}
        onClick={() => { if (lytter) stop(); else { sidstRef.current = valueRef.current; start(); } }}
        aria-pressed={lytter} aria-label={lytter ? "Stop diktering" : "Indtal med mikrofonen"}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        {!compact && <span>{lytter ? "Stop" : "Indtal"}</span>}
      </button>
      {fejl && <span className="status err">{fejl}</span>}
    </>
  );
}

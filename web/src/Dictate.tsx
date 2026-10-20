import { useEffect, useRef, useState } from "react";
import { retNavne } from "./ordbog";
import { transcribe } from "./data";

// Diktering: både den lille mikrofon (fx "Til mig selv") og den store mikrofonknap bruger useDiktat herunder.
// Der er to måder at lytte på:
//   1. Optagelse (standard): appen optager lyden, og edge-funktionen "transskriber" lader OpenAI Whisper
//      skrive den om til tekst. Stabilt på iPhone, men teksten kommer først, når du trykker stop.
//   2. Browserens egen talegenkendelse (reserve): gratis og viser teksten live, men driller på iPhone.
//      Bruges kun, hvis optagelse ikke kan lade sig gøre, eller hvis Whisper ikke er sat op.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRec: any = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
const canRecord = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
/** Bliver sat til false, hvis Whisper ikke er sat op. Så bruger vi browserens talegenkendelse resten af tiden. */
let optagelseKlar = canRecord;

/** Kan denne browser lytte? Hvis ikke, viser vi slet ikke knappen. */
export const canDictate = !!SpeechRec || canRecord;

type Lyt = { hent: () => string; skriv: (tekst: string, live: string) => void };

// ---------- Én fælles talegenkendelse for hele appen ----------
// iPhone (især når Puls er lagt på hjemmeskærmen) kan finde på kun at lytte første gang,
// hvis vi laver en ny talegenkendelse hver gang. Derfor genbruger vi den samme, så længe den virker,
// og lader kun én knap "eje" den ad gangen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let delt: any = null;
let koerer = false;                                   // mellem onstart og onend
let ejer: { overtaget: () => void } | null = null;   // den knap, der bruger den lige nu

function hentRec() {
  if (!delt) {
    delt = new SpeechRec();
    delt.lang = "da-DK";
    delt.continuous = true;
    delt.interimResults = true;
  }
  return delt;
}

/** Browserens talegenkendelse (reserve). Teksten skrives live, mens du taler. */
function useTalegenkendelse({ hent, skriv }: Lyt) {
  const [lytter, setLytter] = useState(false);
  const [fejl, setFejl] = useState("");
  const wantRef = useRef(false);   // vil vi stadig lytte? (Safari stopper selv efter en pause)
  const baseRef = useRef("");      // tekst før den aktuelle lytte-runde
  const cb = useRef({ hent, skriv });
  cb.current = { hent, skriv };
  // Denne knaps "identitet" over for den fælles genkendelse.
  const mig = useRef({ overtaget: () => { wantRef.current = false; setLytter(false); } }).current;

  function start() {
    if (!SpeechRec) return;
    setFejl("");
    // En anden knap lytter? Så tager vi over.
    if (ejer && ejer !== mig) ejer.overtaget();
    ejer = mig;

    const nu = cb.current.hent();
    baseRef.current = nu.trim() ? nu.trimEnd() + " " : "";
    wantRef.current = true;
    let tommeRunder = 0;           // runder i træk, hvor intet blev hørt
    let finals = "";
    let hoerte = false;
    let ventStart = false;         // den gamle runde skal lige slutte, før vi starter igen

    const rec = hentRec();
    // Tegn på, at mikrofonen faktisk lytter. Så kan vagten nedenfor slappe af.
    const svarer = () => { koerer = true; clearTimeout(vagt); };
    rec.onstart = svarer;
    rec.onaudiostart = svarer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      if (ejer !== mig) return;
      svarer();
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
      if (ejer !== mig) return;
      const kode = String(e.error ?? "");
      // "no-speech" og "aborted" er ikke rigtige fejl: onend kommer bagefter og tager sig af det.
      if (kode === "no-speech" || kode === "aborted") return;
      wantRef.current = false;
      if (kode === "not-allowed" || kode === "service-not-allowed") {
        setFejl("Ingen adgang til mikrofonen. Giv adgang i indstillingerne, eller brug mikrofonen på tastaturet.");
      } else if (kode === "audio-capture") {
        setFejl("Mikrofonen er optaget. Prøv igen om et øjeblik.");
      } else if (kode === "network") {
        setFejl("Talegenkendelsen kræver internet. Prøv igen.");
      } else {
        setFejl(`Mikrofonen stoppede (${kode}). Prøv igen.`);
      }
    };
    rec.onend = () => {
      koerer = false;
      if (ventStart) { ventStart = false; begynd(); return; }
      if (ejer !== mig) return;
      // Gem det hørte, og fjern den grå live-tekst.
      baseRef.current = (baseRef.current + finals).trimStart();
      if (baseRef.current && !baseRef.current.endsWith(" ")) baseRef.current += " ";
      finals = "";
      cb.current.skriv(baseRef.current, "");
      tommeRunder = hoerte ? 0 : tommeRunder + 1;
      hoerte = false;
      // Safari stopper efter en pause. Vi lytter videre, men giver op efter tre tomme runder,
      // så den ikke kører i ring og holder på mikrofonen.
      if (wantRef.current && tommeRunder < 3) { begynd(); return; }
      wantRef.current = false;
      ejer = null;
      setLytter(false);
    };

    // Vagten: svarer mikrofonen ikke inden for 3 sekunder, smider vi genkendelsen ud,
    // så næste tryk starter med en frisk, og fortæller det.
    let vagt = 0;
    let foerste = true;            // første runde er den, du selv startede med et tryk
    function begynd() {
      clearTimeout(vagt);
      const sigDet = foerste;
      foerste = false;
      vagt = window.setTimeout(() => {
        if (koerer || ejer !== mig || !wantRef.current) return;
        try { rec.abort(); } catch { /* ingenting */ }
        if (delt === rec) delt = null;
        wantRef.current = false; ejer = null; setLytter(false);
        if (sigDet) setFejl("Mikrofonen svarede ikke. Tryk igen.");
      }, 3000);
      try { rec.start(); }
      catch {
        // Fx "already started": den gamle runde kører stadig. Afbryd og start, når den er slut.
        ventStart = true;
        try { rec.abort(); } catch { /* ingenting */ }
      }
    }

    if (koerer) {
      ventStart = true;
      try { rec.abort(); } catch { /* ingenting */ }
      // Kommer den gamle runde aldrig til ende, starter vi alligevel efter et sekund.
      setTimeout(() => { if (ventStart) { ventStart = false; koerer = false; begynd(); } }, 1000);
    } else begynd();
    setLytter(true);
  }

  /** Stop pænt, så den sidste sætning når at komme med. */
  function stop() {
    wantRef.current = false;
    setLytter(false);
    if (ejer !== mig || !delt) return;
    const r = delt;
    try { r.stop(); } catch { /* var allerede stoppet */ }
    // Kommer der ikke et svar, slipper vi selv mikrofonen.
    setTimeout(() => {
      if (!koerer || ejer !== mig) return;
      try { r.abort(); } catch { /* ingenting */ }
      koerer = false; ejer = null;
    }, 1500);
  }

  /** Stop med det samme (fx når teksten lige er gemt). */
  function slip() {
    wantRef.current = false;
    setLytter(false);
    if (ejer !== mig) return;
    ejer = null;
    try { delt?.abort(); } catch { /* ingenting */ }
  }

  // Luk mikrofonen, når komponenten forsvinder.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { wantRef.current = false; if (ejer === mig) { ejer = null; try { delt?.abort(); } catch { /* ingenting */ } } }, []);

  return { lytter, fejl, start, stop, slip };
}

/** Optagelse: lyden optages på telefonen og skrives om til tekst af Whisper, når du trykker stop. */
function useOptagelse({ hent, skriv }: Lyt) {
  const [lytter, setLytter] = useState(false);
  const [skriver, setSkriver] = useState(false);   // venter på teksten fra Whisper
  const [fejl, setFejl] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Hvert start-tryk får et nummer. Kommer telefonens svar på "må jeg bruge mikrofonen?" først,
  // efter at du har trykket igen eller lukket skærmen, bliver den gamle mikrofon slukket med det samme.
  const runde = useRef(0);
  const cb = useRef({ hent, skriv });
  cb.current = { hent, skriv };

  /** Sluk mikrofonen helt, så iPhone viser, at den ikke længere bruges, og kan starte den igen næste gang. */
  function slukMikrofon() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function start(): Promise<"ok" | "fejl"> {
    setFejl("");
    if (recRef.current) return "ok";             // optager allerede
    const min = ++runde.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (min !== runde.current) { stream.getTracks().forEach(t => t.stop()); return "fejl"; }
      slukMikrofon();                            // en evt. gammel strøm må ikke hænge ved
      streamRef.current = stream;
      // iPhone optager i mp4, Chrome i webm. Whisper forstår begge.
      const typer = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      const type = typer.find(t => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      recRef.current = rec;
      rec.start();
      setLytter(true);
      return "ok";
    } catch (e) {
      if (min !== runde.current) return "fejl";
      slukMikrofon();
      const navn = (e as Error)?.name;
      setFejl(navn === "NotAllowedError"
        ? "Ingen adgang til mikrofonen. Giv adgang i indstillingerne, eller brug mikrofonen på tastaturet."
        : "Mikrofonen kunne ikke starte. Prøv igen.");
      return "fejl";
    }
  }

  /** Stop, send lyden til Whisper og sæt teksten ind efter det, der allerede står. Giver hele teksten tilbage. */
  function stop(): Promise<{ tekst: string; ingenNoegle?: boolean }> {
    const rec = recRef.current;
    recRef.current = null;
    setLytter(false);
    if (!rec || rec.state === "inactive") { slukMikrofon(); return Promise.resolve({ tekst: cb.current.hent() }); }
    const stykker: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) stykker.push(e.data); };
    return new Promise(resolve => {
      rec.onstop = async () => {
        slukMikrofon();
        const lyd = new Blob(stykker, { type: rec.mimeType || "audio/mp4" });
        const filnavn = (rec.mimeType || "").includes("webm") ? "lyd.webm" : "lyd.mp4";
        setSkriver(true);
        try {
          const ny = retNavne(await transcribe(lyd, filnavn));
          const før = cb.current.hent();
          const tekst = ny ? (før.trim() ? før.trimEnd() + " " : "") + ny : før;
          cb.current.skriv(tekst, "");
          resolve({ tekst });
        } catch (e) {
          const ingenNoegle = (e as { kode?: string }).kode === "ingen_noegle";
          setFejl(ingenNoegle
            ? "Optagelse er ikke sat op endnu. Tryk på mikrofonen igen, så bruger jeg telefonens egen talegenkendelse."
            : (e as Error).message);
          resolve({ tekst: cb.current.hent(), ingenNoegle });
        } finally {
          setSkriver(false);
        }
      };
      rec.stop();
    });
  }

  /** Stop og smid optagelsen væk (fx når skærmen lukkes). */
  function slip() {
    runde.current++;                             // et svar, der stadig er på vej, skal smides væk
    const rec = recRef.current;
    recRef.current = null;
    setLytter(false);
    if (rec && rec.state !== "inactive") { rec.onstop = null; try { rec.stop(); } catch { /* ingenting */ } }
    slukMikrofon();
  }

  useEffect(() => () => slip(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { lytter, skriver, fejl, start, stop, slip };
}

/**
 * Lyt og skriv. `hent` giver den tekst, der står i feltet nu. `skriv` får hele teksten
 * og det, der lige nu bliver genkendt (live; kun ved browserens talegenkendelse).
 * `stop()` giver den færdige tekst tilbage, når den er klar.
 */
export function useDiktat(lyt: Lyt) {
  const optag = useOptagelse(lyt);
  const tale = useTalegenkendelse(lyt);
  const [fejl, setFejl] = useState("");
  // Hvilken måde lytter vi på lige nu?
  const modeRef = useRef<"optag" | "tale">(optagelseKlar ? "optag" : "tale");
  useEffect(() => { setFejl(optag.fejl || tale.fejl); }, [optag.fejl, tale.fejl]);

  function start() {
    setFejl("");
    if (optagelseKlar) { modeRef.current = "optag"; void optag.start(); }
    else if (SpeechRec) { modeRef.current = "tale"; tale.start(); }
  }

  async function stop(): Promise<string> {
    if (modeRef.current === "optag") {
      const r = await optag.stop();
      if (r.ingenNoegle) optagelseKlar = false;   // næste tryk bruger browserens talegenkendelse
      return r.tekst;
    }
    tale.stop();
    // Den sidste sætning kommer et øjeblik efter stop.
    await new Promise(r => setTimeout(r, 700));
    return lyt.hent();
  }

  function slip() { optag.slip(); tale.slip(); }

  return { lytter: optag.lytter || tale.lytter, skriver: optag.skriver, fejl, start, stop, slip };
}

/** compact = kun mikrofon-ikonet, til steder hvor der er trangt (fx "Til mig selv"). */
/** onTravl fortæller siden, når mikrofonen optager eller skriver ned, så den kan vente med at gemme. */
export function DictateButton({ value, onChange, compact, onTravl }: {
  value: string; onChange: (v: string) => void; compact?: boolean; onTravl?: (travl: boolean) => void;
}) {
  const sidstRef = useRef(value);  // det, vi selv skrev i feltet sidst
  const valueRef = useRef(value);
  valueRef.current = value;
  const { lytter, skriver, fejl, start, stop, slip } = useDiktat({
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

  useEffect(() => { onTravl?.(lytter || skriver); }, [lytter, skriver]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canDictate) return null;

  return (
    <>
      <button type="button" className={`dictate${lytter ? " on" : ""}${compact ? " compact" : ""}`}
        disabled={skriver}
        onClick={() => { if (lytter) void stop(); else { sidstRef.current = valueRef.current; start(); } }}
        aria-pressed={lytter} aria-label={skriver ? "Skriver det ned" : lytter ? "Stop diktering" : "Indtal med mikrofonen"}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        {!compact && <span>{skriver ? "Skriver …" : lytter ? "Stop" : "Indtal"}</span>}
        {compact && skriver && <span>…</span>}
      </button>
      {fejl && <span className="status err">{fejl}</span>}
    </>
  );
}

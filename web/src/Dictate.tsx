import { useEffect, useRef, useState } from "react";
import { retNavne } from "./ordbog";

// Diktering: en lille mikrofonknap, der skriver det, du siger, ind i et tekstfelt.
// Bruger browserens indbyggede talegenkendelse (Chrome, Edge og Safari). Ingen AI, ingen omkostning.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRec: any = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

/** Kan denne browser lytte? Hvis ikke, viser vi slet ikke knappen. */
export const canDictate = !!SpeechRec;

export function DictateButton({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const wantRef = useRef(false);
  const baseRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => () => { wantRef.current = false; recRef.current?.abort?.(); }, []);

  if (!canDictate) return null;

  function start() {
    setError("");
    const rec = new SpeechRec();
    rec.lang = "da-DK";
    rec.continuous = true;
    rec.interimResults = true;
    // Det du siger, lægges efter det, der allerede står i feltet.
    baseRef.current = valueRef.current ? valueRef.current.trimEnd() + " " : "";
    let finals = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += retNavne(r[0].transcript) + " ";
        else live += r[0].transcript;
      }
      onChange((baseRef.current + finals + live).trimStart());
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantRef.current = false;
        setError("Browseren har ikke adgang til mikrofonen. Tillad den i adresselinjen og prøv igen.");
      } else if (e.error === "audio-capture") {
        wantRef.current = false;
        setError("Der blev ikke fundet en mikrofon på computeren.");
      }
    };
    rec.onend = () => {
      if (wantRef.current) {
        // Nogle browsere stopper efter en pause. Vi fortsætter, hvor vi slap.
        baseRef.current = (baseRef.current + finals).trimEnd() + " ";
        finals = "";
        try { rec.start(); return; } catch { /* kunne ikke starte igen */ }
      }
      setListening(false);
    };
    recRef.current = rec;
    wantRef.current = true;
    try { rec.start(); setListening(true); } catch { setError("Mikrofonen kunne ikke starte. Prøv igen."); }
  }

  function stop() {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
  }

  return (
    <>
      <button type="button" className={`dictate${listening ? " on" : ""}`} onClick={listening ? stop : start}
        aria-pressed={listening} aria-label={listening ? "Stop diktering" : "Indtal med mikrofonen"}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        <span>{listening ? "Stop" : "Indtal"}</span>
      </button>
      {error && <span className="status err">{error}</span>}
    </>
  );
}

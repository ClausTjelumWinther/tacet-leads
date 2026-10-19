import { useState, type FormEvent } from "react";
import { supabase } from "./supabase";

// Sæt en ny adgangskode. Bruges to steder:
//   1. "Skift adgangskode" nederst i appen, mens du er logget ind.
//   2. Når du kommer tilbage fra "Glemt adgangskode?"-mailen. Linket logger dig ind
//      midlertidigt, og så skal du vælge en ny adgangskode, før du går videre.
// Adgangskoden sendes direkte til Supabase og gemmes aldrig i appen.
export default function NyAdgangskode({ titel, onFaerdig, onLuk }: {
  titel: string; onFaerdig: () => void; onLuk?: () => void;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [ok, setOk] = useState(false);

  async function gem(e: FormEvent) {
    e.preventDefault();
    if (a.length < 10) { setFejl("Brug mindst 10 tegn."); return; }
    if (a !== b) { setFejl("De to adgangskoder er ikke ens."); return; }
    setBusy(true); setFejl("");
    const { error } = await supabase.auth.updateUser({ password: a });
    setBusy(false);
    if (error) {
      setFejl(/same/i.test(error.message) ? "Vælg en anden end den nuværende adgangskode." : error.message);
      return;
    }
    setOk(true);
    setTimeout(onFaerdig, 1500);
  }

  return (
    <form onSubmit={gem} className="login-card">
      <h1>{titel}</h1>
      {ok ? (
        <p className="muted" role="status">Din nye adgangskode er gemt.</p>
      ) : (
        <>
          <p className="muted">Mindst 10 tegn. Brug gerne din adgangskode-manager til at lave en stærk.</p>
          <label htmlFor="ny1">Ny adgangskode</label>
          <input id="ny1" type="password" autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} required autoFocus />
          <label htmlFor="ny2">Gentag adgangskoden</label>
          <input id="ny2" type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} required />
          {fejl && <p className="error" role="alert">{fejl}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Gemmer…" : "Gem ny adgangskode"}</button>
          {onLuk && <button type="button" className="linkbtn" onClick={onLuk}>Fortryd</button>}
        </>
      )}
    </form>
  );
}

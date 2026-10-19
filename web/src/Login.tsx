import { useState, type FormEvent } from "react";
import { supabase } from "./supabase";

// Login med email og adgangskode.
// "Glemt adgangskode?" sender en mail med et link tilbage til Puls, hvor du vælger en ny.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [glemt, setGlemt] = useState(false);   // viser "send mig et link" i stedet for login
  const [sendt, setSendt] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Lykkes det, opdager App.tsx det selv og skifter visning.
    if (error) setError(error.message.includes("Invalid") ? "Forkert email eller adgangskode." : error.message);
    setBusy(false);
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    // Linket i mailen fører tilbage hertil. App.tsx ser, at du kommer fra mailen, og viser "Vælg ny adgangskode".
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setSendt(true);
  }

  if (glemt) return (
    <main className="login">
      <form onSubmit={sendLink} className="login-card">
        <h1>Glemt adgangskode</h1>
        {sendt ? (
          <p className="muted" role="status">Tjek din mail. Tryk på linket, så kan du vælge en ny adgangskode. Linket virker kun en kort tid.</p>
        ) : (
          <>
            <p className="muted">Skriv din email, så sender vi et link, hvor du kan vælge en ny adgangskode.</p>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
            {error && <p className="error">{error}</p>}
            <button className="btn primary" type="submit" disabled={busy}>{busy ? "Sender…" : "Send link"}</button>
          </>
        )}
        <button type="button" className="linkbtn" onClick={() => { setGlemt(false); setSendt(false); setError(""); }}>← Tilbage til login</button>
      </form>
    </main>
  );

  return (
    <main className="login">
      <form onSubmit={submit} className="login-card">
        <h1>Puls</h1>
        <p className="muted">Dine leads, dit netværk og dine løfter.</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
        <label htmlFor="password">Adgangskode</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Logger ind…" : "Log ind"}</button>
        <button type="button" className="linkbtn" onClick={() => { setGlemt(true); setError(""); }}>Glemt adgangskode?</button>
      </form>
    </main>
  );
}

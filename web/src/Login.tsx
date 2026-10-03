import { useState, type FormEvent } from "react";
import { supabase } from "./supabase";

// Login med den samme email og adgangskode som i det gamle leadsystem.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Lykkes det, opdager App.tsx det selv og skifter visning.
    if (error) setError(error.message.includes("Invalid") ? "Forkert email eller adgangskode." : error.message);
    setBusy(false);
  }

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
      </form>
    </main>
  );
}

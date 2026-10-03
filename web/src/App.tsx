import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { loadAll, errorText, type Data } from "./data";
import Login from "./Login";
import Header from "./Header";
import Lists, { type Tab, TABS } from "./Lists";
import Focus, { type FocusKey } from "./Focus";
import QuickNote from "./QuickNote";

// App styrer to ting: er du logget ind, og hvad kigger du på lige nu.
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <main className="center muted">Starter…</main>;
  if (!session) return <Login />;
  return <Shell />;
}

function readTab(): Tab {
  try {
    const t = localStorage.getItem("puls.tab");
    if (t && TABS.some(x => x.key === t)) return t as Tab;
  } catch { /* privat browservindue */ }
  return "idag";
}

function Shell() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [tab, setTab] = useState<Tab>(readTab);
  const [focus, setFocus] = useState<FocusKey | null>(null);
  const [quick, setQuick] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadAll());
      setLoadedAt(new Date());
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Hent nyt, når du vender tilbage til appen (fx efter et møde).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  // Fokuskortet lægges i browserens historik, så telefonens tilbage-swipe lukker det.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setFocus((e.state && e.state.focus) || null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openFocus = (key: FocusKey) => {
    if (focus) history.replaceState({ focus: key }, "");
    else history.pushState({ focus: key }, "");
    setFocus(key);
    window.scrollTo(0, 0);
  };
  const closeFocus = () => {
    if (history.state && history.state.focus) history.back();
    else setFocus(null);
  };
  const chooseTab = (t: Tab) => {
    setTab(t);
    try { localStorage.setItem("puls.tab", t); } catch { /* ignorer */ }
    if (focus) closeFocus();
  };

  return (
    <div className="wrap">
      <Header data={data} loading={loading} onRefresh={reload} />
      {error && <div className="banner">{error}</div>}
      {!data && !error && <div className="loading"><b>Henter dine leads</b>Et øjeblik.</div>}
      {data && (focus
        ? <Focus data={data} focusKey={focus} tabLabel={TABS.find(t => t.key === tab)!.label} onBack={closeFocus} onOpen={openFocus} onChanged={reload} />
        : <Lists data={data} tab={tab} onTab={chooseTab} onOpen={openFocus} onChanged={reload} />)}
      {loadedAt && (
        <footer className="foot">
          Hentet {loadedAt.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}
          <button type="button" className="linkbtn" onClick={() => supabase.auth.signOut()}>Log ud</button>
        </footer>
      )}
      {data && <button type="button" className="fab" aria-label="Hurtig note" onClick={() => setQuick(true)}>+ Note</button>}
      {quick && data && <QuickNote data={data} onClose={() => setQuick(false)} onSaved={reload} />}
    </div>
  );
}

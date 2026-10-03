// Den version, du kører lige nu (sat af vite.config.ts ved build).
declare const __VERSION__: string;
export const VERSION = __VERSION__;

/** Er der lagt en nyere version ud på puls.tacet.dk? */
export async function newerVersionExists(): Promise<boolean> {
  if (import.meta.env.DEV) return false;
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return false;
    const { version } = await r.json();
    return typeof version === "string" && version !== VERSION;
  } catch { return false; }
}

/** Kort visning i bunden, fx "3/10 15.24". */
export const versionLabel = () =>
  new Date(VERSION).toLocaleString("da-DK", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

/** Hent den nye version, men kun én gang pr. version, så vi aldrig ender i en genindlæsnings-løkke. */
export async function updateIfNewer(): Promise<void> {
  if (!(await newerVersionExists())) return;
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    const { version } = await r.json();
    if (sessionStorage.getItem("puls.reloaded") === version) return;
    sessionStorage.setItem("puls.reloaded", version);
  } catch { return; }
  location.reload();
}

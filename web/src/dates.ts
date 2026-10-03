// Små hjælpere til datoer. Alt regnes i dansk tid, og datoer gemmes som "YYYY-MM-DD".

const fmtDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" });

/** Dagens dato i dansk tid, fx "2026-10-03". */
export const today = (): string => fmtDay.format(new Date());

/** Læg et antal dage til en dato. */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Hvor mange dage der er fra i dag til datoen (negativ = overskredet). */
export const daysFromToday = (iso: string): number =>
  Math.round((new Date(iso + "T12:00:00Z").getTime() - new Date(today() + "T12:00:00Z").getTime()) / 864e5);

/** "2026-10-06" bliver til "6/10". */
export function short(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${+d}/${+m}`;
}

/** Datostempel til noter: "03/10/2026". */
export function stamp(): string {
  const [y, m, d] = today().split("-");
  return `${d}/${m}/${y}`;
}

/** Tekst til datochippen: "2 dage over", "i dag", "i morgen", "tor 9/10", "20/10". */
export function whenLabel(iso: string): { text: string; over: boolean } {
  const n = daysFromToday(iso);
  if (n < 0) return { text: `${-n} ${n === -1 ? "dag" : "dage"} over`, over: true };
  if (n === 0) return { text: "i dag", over: false };
  if (n === 1) return { text: "i morgen", over: false };
  if (n < 7) {
    const day = new Intl.DateTimeFormat("da-DK", { weekday: "short", timeZone: "UTC" })
      .format(new Date(iso + "T12:00:00Z")).replace(".", "");
    return { text: `${day} ${short(iso)}`, over: false };
  }
  return { text: short(iso), over: false };
}

export const kr = (n: number | null): string =>
  n == null ? "" : new Intl.NumberFormat("da-DK").format(n) + " kr.";

// Navne, som telefonens talegenkendelse ofte hører forkert.
// Vi retter dem, så snart en sætning er færdig, så noten står rigtigt med det samme.
// Tilføj gerne flere: venstre side er et mønster (regulært udtryk), højre side er det rigtige ord.

const RETTELSER: [RegExp, string][] = [
  // Tacet
  [/\b(tasset|taset|ta set|tacit|tazet|tasse|taccet|tarset|tace)\b/gi, "Tacet"],
  // Velatir
  [/\b(vela ?tir|vel ?atir|velatier|velatyr|velatire|velattir|fela ?tir|velatere|velater|vela tier|vella ?tir|valatir|velatih?r)\b/gi, "Velatir"],
  // Puls (appen)
  [/\bpulse\b/gi, "Puls"],
];

/** Ret kendte fejlhørte navne i en tekst. */
export function retNavne(tekst: string): string {
  let t = tekst;
  for (const [m, ord] of RETTELSER) t = t.replace(m, ord);
  return t;
}

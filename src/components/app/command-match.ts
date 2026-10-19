/**
 * How well a command matches what was typed in the command palette: every
 * word typed must appear in the label or its keywords. A label that starts
 * with the query ranks first, then words that start with it, then anything
 * containing it. Zero means no match.
 */
export function matchScore(query: string, label: string, keywords: readonly string[] = []): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const l = label.toLowerCase();
  const haystack = [l, ...keywords.map((k) => k.toLowerCase())].join(" ");
  const words = q.split(/\s+/);
  if (!words.every((w) => haystack.includes(w))) return 0;
  if (l.startsWith(q)) return 4;
  if (l.split(/[\s/:,.-]+/).some((part) => part.startsWith(words[0]!))) return 3;
  if (l.includes(q)) return 2;
  return 1;
}

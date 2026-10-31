/**
 * Picking an element in a running app (ADR 0149). The preview reports what
 * was clicked: its tag, its own words and its classes. That is matched to
 * the app's JSX by those same words and classes, not by source maps, so
 * the result is a list of candidates, best first, each saying why it
 * matched. Text or classes the app builds at run time match nothing, and
 * the editor says so.
 */
import type { JsxElement } from "./jsx-edit";

export interface Picked {
  tag: string;
  /** The element's own words when it has no child elements; "" otherwise. */
  text: string;
  classes: string[];
}

export interface PickCandidate {
  path: string;
  /** The element's place in its file's outline. */
  n: number;
  line: number;
  tag: string;
  why: string;
  score: number;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const classSet = (s: string) => [...new Set(s.split(/\s+/).filter(Boolean))].sort();

/** Checks what a preview sent; null for anything not in the expected shape. */
export function readPicked(data: unknown): Picked | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.type !== "farbaek:picked" || typeof d.tag !== "string" || typeof d.text !== "string" || !Array.isArray(d.classes)) return null;
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(d.tag) || d.text.length > 500 || d.classes.length > 60 || !d.classes.every((c) => typeof c === "string" && c.length <= 200)) return null;
  return { tag: d.tag, text: norm(d.text), classes: [...new Set(d.classes as string[])].sort() };
}

export function matchPicked(picked: Picked, files: readonly { path: string; elements: readonly JsxElement[] }[], max = 8): PickCandidate[] {
  const out: PickCandidate[] = [];
  const pickedClasses = picked.classes.join(" ");
  for (const file of files) {
    for (const el of file.elements) {
      // A component renders as other elements, so only built-in ones can be the element clicked.
      if (!el.builtin) continue;
      const words = Boolean(picked.text) && el.text !== null && norm(el.text.value) === picked.text;
      const own = el.className ? classSet(el.className.value) : [];
      const sameClasses = own.length > 0 && own.join(" ") === pickedClasses;
      const coveredClasses = !sameClasses && own.length >= 2 && own.every((c) => picked.classes.includes(c));
      if (!words && !sameClasses && !coveredClasses) continue;
      const sameTag = el.tag === picked.tag;
      const score = (words ? 4 : 0) + (sameClasses ? 3 : coveredClasses ? 1 : 0) + (sameTag ? 1 : 0);
      const why = [words ? "the same words" : "", sameClasses ? "the same classes" : coveredClasses ? "its classes" : "", sameTag ? "" : `a <${el.tag}>, not a <${picked.tag}>`]
        .filter(Boolean)
        .join(", ");
      out.push({ path: file.path, n: el.n, line: el.line, tag: el.tag, why: `Matched by ${why}`, score });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line).slice(0, max);
}

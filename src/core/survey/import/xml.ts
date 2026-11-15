/**
 * Just enough XML for point files (stage 194): elements found by name with
 * their attributes and text, comments and processing instructions dropped,
 * the five named entities and numeric references decoded. Not a general
 * parser: it reads the elements LandXML and JobXML points live in, and a
 * file it can't read that way is refused by the caller, never half-read.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/** The text without comments, processing instructions and CDATA markers (CDATA text kept). */
export function stripXml(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
}

/** Attributes of a start tag's inside ("name=\"1\" code='CP'"). */
export function attributesOf(inside: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of inside.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]!] = decodeXml(m[3] ?? m[4] ?? "");
  return out;
}

export interface XmlElement {
  attrs: Record<string, string>;
  /** Inner text and markup, undecoded; empty for a self-closing element. */
  inner: string;
  /** Where it starts in the text, for line numbers. */
  index: number;
}

/** Every element with this local name (any namespace prefix), in order. Elements of the same name nested inside each other aren't supported. */
export function elements(text: string, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(\\s[^>]*?)?(/?)>`, "g");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const attrs = attributesOf(m[1] ?? "");
    if (m[2] === "/") {
      out.push({ attrs, inner: "", index: m.index });
      continue;
    }
    const close = new RegExp(`</(?:[\\w.-]+:)?${name}\\s*>`, "g");
    close.lastIndex = re.lastIndex;
    const c = close.exec(text);
    if (!c) break;
    out.push({ attrs, inner: text.slice(re.lastIndex, c.index), index: m.index });
    re.lastIndex = close.lastIndex;
  }
  return out;
}

/** The decoded text of the first child element of this name, or null. */
export function childText(inner: string, name: string): string | null {
  const e = elements(inner, name)[0];
  return e ? decodeXml(e.inner.replace(/<[^>]*>/g, "")).trim() : null;
}

/** The 1-based line of a character index. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

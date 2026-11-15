/**
 * Just enough XML for point files (stage 194): elements found by name with
 * their attributes and text, comments and processing instructions dropped,
 * the five named entities and numeric references decoded. Not a general
 * parser: it reads the elements LandXML and JobXML points live in.
 *
 * Everything is scanned in one pass with indexOf, never with a backtracking
 * regular expression, so a 5 MB file with a tag, quote or comment left open
 * takes as long to read as a well-formed one (stage 194 review). A file that
 * is cut short or isn't well formed where Farbaek reads it raises
 * `XmlProblem`, and the reader refuses the whole file: nothing is half-read.
 */

/**
 * A file that isn't well-formed XML where Farbaek reads it. `at` is where, in the whole file's text (helpers reading an element's
 * inside are given its offset), and the reader turns it into one refusal whose message names the line.
 */
export class XmlProblem extends Error {
  constructor(
    readonly describe: (line: number | null) => string,
    readonly at: number | null,
  ) {
    super(describe(null));
  }
}

/** The refusal for a problem, with the line worked out from the text the offsets point into. */
export function xmlRefusal(e: XmlProblem, text: string): { line: number | null; message: string } {
  const line = e.at === null ? null : lineFinder(text)(e.at);
  return { line, message: e.describe(line) };
}

const onLine = (line: number | null) => (line === null ? "" : ` on line ${line}`);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** XML 1.0's Char production: what a numeric reference may name. */
const allowed = (c: number) => c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);

/** Decodes the five named entities and numeric references. A reference to a character XML doesn't allow (&#1;) is refused; `at` is where `s` starts. */
export function decodeXml(s: string, at: number | null = null): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,4});/g, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e] ?? m;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    if (!allowed(code)) throw new XmlProblem((line) => `The file refers to a character XML doesn't allow (${m})${onLine(line)}. Export it again from the instrument's software.`, at);
    return String.fromCodePoint(code);
  });
}

/** The 1-based line of any character index, from one pass over the text (binary search per lookup). */
export function lineFinder(text: string): (index: number) => number {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Spaces in place of every character but line breaks, so what's removed keeps the lines of what follows. */
const blank = (s: string) => s.replace(/[^\n]/g, " ");

const SPECIAL: [open: string, close: string, what: string][] = [
  ["<!--", "-->", "a comment"],
  ["<![CDATA[", "]]>", "a CDATA section"],
  ["<?", "?>", "a processing instruction"],
];

/**
 * The text without comments and processing instructions (blanked, so line numbers stay true) and with CDATA sections' text kept,
 * escaped. One that never ends means the file was cut short.
 */
export function stripXml(text: string): string {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      out.push(text.slice(i));
      return out.join("");
    }
    const special = SPECIAL.find(([open]) => text.startsWith(open, lt));
    if (!special) {
      out.push(text.slice(i, lt + 1));
      i = lt + 1;
      continue;
    }
    const [open, close, what] = special;
    const end = text.indexOf(close, lt + open.length);
    if (end === -1) throw new XmlProblem((line) => `The file is cut short: ${what} starting${onLine(line)} never ends.`, lt);
    out.push(text.slice(i, lt));
    out.push(open === "<![CDATA[" ? text.slice(lt + open.length, end).replace(/&/g, "&amp;").replace(/</g, "&lt;") : blank(text.slice(lt, end + close.length)));
    i = end + close.length;
  }
}

const isNameChar = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 46 || c === 58 || c === 45;
const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;

/** Where the name starting at `from` ends. */
function nameEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length && isNameChar(text.charCodeAt(i))) i++;
  return i;
}

/** "lx:CgPoint" is "CgPoint". */
const localName = (qname: string) => qname.slice(qname.lastIndexOf(":") + 1);

export interface XmlElement {
  attrs: Record<string, string>;
  /** Inner text and markup, undecoded; empty for a self-closing element. */
  inner: string;
  /** Where its start tag begins in the text, for line numbers. */
  index: number;
  /** Where its inner text begins. */
  innerStart: number;
}

/** Reads the attributes of a start tag whose name ends at `from`, to its ">" or "/>" (a ">" inside a quoted value is part of it). */
function startTag(text: string, lt: number, from: number, name: string, base: number): { attrs: Record<string, string>; selfClosing: boolean; end: number } {
  const attrs: Record<string, string> = {};
  const bad = (what: string) => new XmlProblem((line) => `The file ${what} in the ${name} element${onLine(line)}. Export it again from the instrument's software.`, base + lt);
  let i = from;
  for (;;) {
    while (i < text.length && isSpace(text.charCodeAt(i))) i++;
    if (i >= text.length) throw bad("is cut short");
    const c = text[i];
    if (c === ">") return { attrs, selfClosing: false, end: i + 1 };
    if (c === "/") {
      if (text[i + 1] === ">") return { attrs, selfClosing: true, end: i + 2 };
      throw bad("isn't well-formed XML");
    }
    const a = i;
    i = nameEnd(text, i);
    if (i === a) throw bad("isn't well-formed XML");
    const attr = text.slice(a, i);
    while (i < text.length && isSpace(text.charCodeAt(i))) i++;
    if (text[i] !== "=") throw bad("isn't well-formed XML");
    i++;
    while (i < text.length && isSpace(text.charCodeAt(i))) i++;
    const q = text[i];
    if (q !== '"' && q !== "'") throw bad(i >= text.length ? "is cut short" : "isn't well-formed XML");
    const close = text.indexOf(q, i + 1);
    if (close === -1) throw bad("is cut short");
    attrs[attr] = decodeXml(text.slice(i + 1, close), base + i + 1);
    i = close + 1;
  }
}

/** The end tag closing an element of this local name, from `from`: where it starts and ends, or null. */
function endTag(text: string, name: string, from: number): { at: number; end: number } | null {
  for (let at = text.indexOf("</", from); at !== -1; at = text.indexOf("</", at + 2)) {
    let k = nameEnd(text, at + 2);
    if (localName(text.slice(at + 2, k)) !== name) continue;
    while (k < text.length && isSpace(text.charCodeAt(k))) k++;
    if (text[k] === ">") return { at, end: k + 1 };
  }
  return null;
}

/**
 * Every element with this local name (any namespace prefix), in order. Elements of the same name nested inside each other aren't
 * supported. One whose start tag or end tag never comes means the file was cut short. `base` is where `text` starts in the file, for
 * the line of a problem; the elements' own offsets stay relative to `text`.
 */
export function elements(text: string, name: string, base = 0): XmlElement[] {
  const out: XmlElement[] = [];
  let i = 0;
  for (;;) {
    const lt = text.indexOf("<", i);
    if (lt === -1) return out;
    const end = nameEnd(text, lt + 1);
    if (end === lt + 1 || localName(text.slice(lt + 1, end)) !== name) {
      i = lt + 1;
      continue;
    }
    const tag = startTag(text, lt, end, name, base);
    if (tag.selfClosing) {
      out.push({ attrs: tag.attrs, inner: "", index: lt, innerStart: tag.end });
      i = tag.end;
      continue;
    }
    const close = endTag(text, name, tag.end);
    if (!close) throw new XmlProblem((line) => `The file is cut short: the ${name} element${onLine(line)} never closes.`, base + lt);
    out.push({ attrs: tag.attrs, inner: text.slice(tag.end, close.at), index: lt, innerStart: tag.end });
    i = close.end;
  }
}

/** The text of some markup with its tags removed (each replaced by `gap`), undecoded. `base` is where `inner` starts in the file. */
export function textOf(inner: string, gap = "", base = 0): string {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const lt = inner.indexOf("<", i);
    if (lt === -1) {
      out.push(inner.slice(i));
      return out.join("");
    }
    out.push(inner.slice(i, lt), gap);
    const gt = inner.indexOf(">", lt);
    if (gt === -1) throw new XmlProblem((line) => `The file is cut short inside an element${onLine(line)}.`, base + lt);
    i = gt + 1;
  }
}

/** The decoded text of the first child element of this name, or null. `base` is where `inner` starts in the file. */
export function childText(inner: string, name: string, base = 0): string | null {
  const e = elements(inner, name, base)[0];
  return e ? decodeXml(textOf(e.inner, "", base + e.innerStart), base + e.innerStart).trim() : null;
}

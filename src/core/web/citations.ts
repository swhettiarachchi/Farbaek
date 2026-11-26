/**
 * Checking an answer's citations against the pages it was given (stage 206, ADR 0223). Framework-free, no model call.
 *
 * An answer cites a source by its number in square brackets after the sentence it supports ([2], [1][4]); an older answer, or a
 * model that ignores the instruction, links to the source's address instead. Once the answer is written:
 *
 * - every citation is tied to a source Farbaek really retrieved. A number with no source behind it is counted as invalid and
 *   never drawn (the screen draws a citation only when its source exists);
 * - each cited sentence's names and numbers are looked for on the page it cites: figures, dates, and words in Latin letters
 *   (product, company and people's names survive translation, so this works for a Sinhala answer about an English page).
 *
 * The result is a hint for the reader, named for what it is: "names and numbers found on the page", never "verified". Matching
 * words can't tell whether a sentence is true, and published work puts word overlap well behind a trained checker at spotting
 * unsupported claims (TRUE, Honovich et al. 2022). A source read only as a search snippet is left unchecked when something is
 * missing: the snippet is too short to say.
 *
 * What a model writes isn't trusted to be reasonable: an answer can be 190,000 characters of anything. So the work is bounded
 * on every side (how much of the answer is read, how long a line, how many citations, how many facts a sentence gives, how much
 * of a page is searched), and no pattern here can take more than a pass over its input.
 */
import type { WebDoc } from "./context";
import { canonicalUrl, type Support, type WebSource } from "./sources";

export interface Citation {
  n: number;
  /** The sentence the citation follows, without citation marks. */
  claim: string;
}

/** The most of an answer that is read for citations, the longest line, the most citations and the most of a page. */
const LIMITS = { answer: 80_000, line: 6_000, citations: 300, facts: 10, page: 120_000 };

const MARK = /\[(\d{1,2}(?:\s{0,2},\s{0,2}\d{1,2}){0,8})\]/g;
const CLUSTER = /(?:\[\d{1,2}(?:\s{0,2},\s{0,2}\d{1,2}){0,8}\]\s{0,2})+/g;
const LINK = /\[([^\]\n]{0,300})\]\((https?:\/\/[^)\s]{1,700})\)/g;
const ENDER = /[.!?。！？।](?=\s|$)/gu;
const ENDS = new Set([".", "!", "?", "。", "！", "？", "।", " ", "\t"]);
/** A Markdown heading: where a roundup's story carries its citation (stage 278). */
const HEADING_LINE = /^ {0,3}#{1,6}\s/;

/** Code is never a claim, and a "[1]" inside it is an index, not a citation. */
function withoutCode(text: string): string {
  return text.replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, "\n").replace(/`[^`\n]{0,400}`/g, " ");
}

/** The last sentence of a piece of text. */
function lastSentence(text: string): string {
  let end = text.length;
  while (end > 0 && ENDS.has(text[end - 1]!)) end--;
  const body = text.slice(0, end);
  let cut = 0;
  for (const m of body.matchAll(ENDER)) cut = m.index + m[0].length;
  return body.slice(cut).trim();
}

/** The sentence around a position. */
function sentenceAround(line: string, start: number, end: number): string {
  let from = 0;
  for (const m of line.slice(0, start).matchAll(ENDER)) from = m.index + m[0].length;
  const after = line.slice(end).search(/[.!?。！？।](?=\s|$)/u);
  return line.slice(from, after < 0 ? line.length : end + after).trim();
}

/** A link to an address, tested once (no "g": it keeps no place between lines). */
const LINK_ONCE = /\[[^\]\n]{0,300}\]\(https?:\/\/[^)\s]{1,700}\)/;

const clean = (claim: string) => claim.replace(MARK, " ").replace(LINK, "$1").replace(/[*_#>|]+/g, " ").replace(/\s{2,}/g, " ").trim();

/**
 * Every citation in an answer: numbered marks, and links to a source's own address. `invalid` counts numbers with no source.
 * A mark with a zero in it is an interval or an index ("[0, 1]"), never a citation: sources are numbered from one.
 */
export function readCitations(answer: string, sources: readonly Pick<WebSource, "n" | "url">[]): { citations: Citation[]; invalid: number } {
  const known = new Set(sources.map((s) => s.n));
  const byUrl = new Map<string, number>();
  for (const s of sources) byUrl.set(canonicalUrl(s.url) ?? s.url, s.n);
  const citations: Citation[] = [];
  let invalid = 0;
  const lines = withoutCode(answer.slice(0, LIMITS.answer)).split(/\n+/);
  for (let at = 0; at < lines.length; at++) {
    if (citations.length >= LIMITS.citations) break;
    const line = lines[at]!.slice(0, LIMITS.line);
    // A story of a roundup (stage 278) cites its source on its heading, and says the day and the figures in the sentences under
    // it. Those sentences are part of what the heading's source is cited for, up to the next heading, unless a sentence cites a
    // source of its own. Without this, only the headline would be compared with the page.
    let under = "";
    if (HEADING_LINE.test(line)) {
      for (let j = at + 1; j < lines.length && under.length < LIMITS.line; j++) {
        const next = lines[j]!.slice(0, LIMITS.line);
        if (HEADING_LINE.test(next)) break;
        MARK.lastIndex = 0;
        if (!MARK.test(next) && !LINK_ONCE.test(next)) under += ` ${next}`;
      }
      MARK.lastIndex = 0;
      under = clean(under.slice(0, LIMITS.line));
    }
    let previousEnd = 0;
    let previousClaim = "";
    for (const cluster of line.matchAll(CLUSTER)) {
      const numbers: number[] = [];
      for (const mark of cluster[0].matchAll(MARK)) for (const part of mark[1]!.split(",")) numbers.push(Number(part.trim()));
      if (numbers.includes(0)) continue;
      const said = clean(lastSentence(line.slice(previousEnd, cluster.index))) || previousClaim;
      const claim = under ? `${said} ${under}`.trim() : said;
      previousClaim = said;
      previousEnd = cluster.index + cluster[0].length;
      for (const n of numbers) {
        if (!known.has(n)) invalid++;
        else if (citations.length < LIMITS.citations) citations.push({ n, claim });
      }
    }
    for (const link of line.matchAll(LINK)) {
      const n = byUrl.get(canonicalUrl(link[2]!) ?? link[2]!);
      if (n !== undefined && citations.length < LIMITS.citations) citations.push({ n, claim: clean(sentenceAround(line, link.index, link.index + link[0].length)) });
    }
  }
  return { citations, invalid };
}

const COMMON = new Set(
  "about after again also among another because before being between could during every first found from have however including into just like made make many more most much never only other over said same should since some such than that their them then there these they this those through under until very were what when where which while will with within without would year years today week month according says report reports reported".split(
    " ",
  ),
);

/** A number as written, without thousands separators or a trailing full stop: "1,250.5" gives "1250.5". */
const plainNumber = (raw: string) => raw.replace(/(?<=\d),(?=\d{3}\b)/g, "").replace(/[.,]+$/, "");

export interface Facts {
  /** Figures and dates: two digits or more, or a decimal. */
  numbers: string[];
  /** Words in Latin letters that name something: capitalised, acronyms, or any Latin word inside another script. */
  names: string[];
  /** Other longer words, when the sentence is in Latin letters: weaker evidence. */
  words: string[];
}

/** What can be looked for on a page from one sentence: at most ten of each kind. */
export function factsOf(claim: string): Facts {
  const text = claim.normalize("NFC").slice(0, LIMITS.line);
  const numbers = [...new Set((text.match(/\d[\d.,]{0,20}\d|\d/g) ?? []).map(plainNumber).filter((n) => n.replace(/\D/g, "").length >= 2 || n.includes(".")))];
  const latinLetters = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const otherLetters = (text.match(/\p{L}/gu)?.length ?? 0) - latinLetters;
  // Any real presence of another script: in such a sentence the words in Latin letters are the names and terms.
  const foreign = otherLetters >= 3;
  const names = new Set<string>();
  const words = new Set<string>();
  const tokens = [...text.matchAll(/\p{Script=Latin}[\p{Script=Latin}\p{N}'’.+#-]{0,40}/gu)];
  tokens.forEach((m, i) => {
    const raw = m[0].replace(/['’.+#-]+$/, "");
    const lower = raw.toLowerCase();
    if (raw.length < 2 || COMMON.has(lower)) return;
    const acronym = /^[\p{Lu}\d]{2,}$/u.test(raw);
    const capital = /^\p{Lu}/u.test(raw) && (i > 0 || foreign);
    const camel = /\p{Ll}\p{Lu}/u.test(raw);
    if (acronym || camel || (capital && raw.length >= 3) || (foreign && raw.length >= 3)) names.add(lower);
    else if (!foreign && raw.length >= 5) words.add(lower);
  });
  return { numbers: numbers.slice(0, LIMITS.facts), names: [...names].slice(0, LIMITS.facts), words: [...words].slice(0, LIMITS.facts) };
}

/** A page's text for looking facts up in: its beginning, lower-case, numbers without thousands separators. */
export function haystack(doc: Pick<WebDoc, "title" | "text">): string {
  return `${doc.title}\n${doc.text.slice(0, LIMITS.page)}`.normalize("NFC").toLowerCase().replace(/(?<=\d),(?=\d{3}\b)/g, "");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function has(page: string, fact: string, number: boolean): boolean {
  if (number) return new RegExp(`(?<![\\d.])${escape(fact)}(?![\\d]|\\.\\d)`).test(page);
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(fact)}`, "u").test(page);
}

/** How one cited sentence stands against the page it cites. */
export function supportOf(claim: string, page: string, read: boolean): Support {
  const facts = factsOf(claim);
  const strong = facts.numbers.length + facts.names.length;
  if (strong === 0) {
    // Only ordinary words to go on. A page can support a sentence in other words, so their absence says nothing; their
    // presence, in number, says a little.
    if (facts.words.length < 3) return "unchecked";
    const wordHits = facts.words.filter((w) => has(page, w, false)).length;
    return wordHits / facts.words.length >= 0.6 ? "matched" : "unchecked";
  }
  const numberHits = facts.numbers.filter((n) => has(page, n, true)).length;
  const nameHits = facts.names.filter((n) => has(page, n, false)).length;
  const share = (numberHits + nameHits) / strong;
  // Every figure must be there: a sentence whose names match but whose number doesn't is never "matched".
  if (share >= 0.6 && numberHits === facts.numbers.length) return "matched";
  // A snippet is a sentence or two of the page: what it lacks may well be on the page itself.
  if (!read) return "unchecked";
  return share < 0.25 ? "unmatched" : "partly";
}

/** One source's standing from the sentences that cite it. */
function combine(all: Support[]): Support {
  const judged = all.filter((s) => s !== "unchecked");
  if (judged.length === 0) return "unchecked";
  if (judged.every((s) => s === "matched")) return "matched";
  if (judged.every((s) => s === "unmatched")) return "unmatched";
  return "partly";
}

export interface CitationCheck {
  /** The sources with `cited` and `support` set. */
  sources: WebSource[];
  checks: { cited: number; matched: number; unmatched: number; invalid: number };
}

/**
 * Marks which sources an answer cites and how each stands. `docs` are the pages as the model read them. A cited source whose
 * page isn't here (an answer that was continued: its pages are gone) keeps the standing it was saved with, or is left unchecked.
 */
export function checkCitations(answer: string, sources: readonly WebSource[], docs: readonly WebDoc[]): CitationCheck {
  const { citations, invalid } = readCitations(answer, sources);
  const pages = new Map(docs.map((d) => [d.n, { page: haystack(d), read: d.read }]));
  const bySource = new Map<number, Support[]>();
  for (const c of citations) {
    const page = pages.get(c.n);
    if (!bySource.has(c.n)) bySource.set(c.n, []);
    if (page) bySource.get(c.n)!.push(supportOf(c.claim, page.page, page.read));
  }
  const marked = sources.map((s): WebSource => {
    const found = bySource.get(s.n);
    if (!found) {
      const uncited: WebSource = { ...s, cited: false };
      delete uncited.support;
      return uncited;
    }
    return { ...s, cited: true, support: pages.has(s.n) ? combine(found) : (s.support ?? "unchecked") };
  });
  const cited = marked.filter((s) => s.cited);
  return {
    sources: marked,
    checks: { cited: cited.length, matched: cited.filter((s) => s.support === "matched").length, unmatched: cited.filter((s) => s.support === "unmatched").length, invalid: Math.min(99, invalid) },
  };
}

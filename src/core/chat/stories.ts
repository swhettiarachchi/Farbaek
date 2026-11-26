/**
 * Stories in an answer (stage 278, ADR 0285). When Farbaek checked the web and the answer is a roundup, each item is written as a
 * heading that names it and ends with the number of the source it came from, with a few sentences under it:
 *
 *     ### A new model for phones [3]
 *     What happened, when, and why it matters.
 *
 * That is ordinary Markdown: copied somewhere else, read aloud or shared, it is a heading and a paragraph. On the screen the pair
 * is drawn as one story: the page's picture when it has one, the title as a link to the page, the sentences, then the day it was
 * published and where. This file only finds the pairs. It is framework-free and tested; the screen draws what it returns, and
 * only for an answer Farbaek asked for as a roundup: in an essay, a heading that happens to end with a citation stays a heading.
 *
 * A heading is a story only when it carries a citation itself. A heading over a section that merely cites sources in its
 * sentences ("How it works") stays a heading: a picture from some page beside it would say the section is that page's.
 */
import type { Block, Inline, SourceBlock } from "./markdown";

export interface Story {
  /** The heading's level, 2 to 6: the screen keeps it, so the outline a screen reader hears is the answer's own. */
  level: 2 | 3 | 4 | 5 | 6;
  /** The heading's words, without its citations, wherever in it they were written. */
  title: Inline[];
  /** The sources the heading names, in the order written, each once. */
  cites: number[];
  /** What is written under it: its first few blocks of text. */
  body: SourceBlock[];
  /** The source of the whole story, so the screen redraws it only when it changes. */
  src: string;
}

export type AnswerPiece = { kind: "block"; block: SourceBlock } | { kind: "story"; story: Story };

/** The most blocks one story holds. What is written after them under the same heading is drawn as it always was, below the story. */
export const STORY_BLOCKS = 4;

/** Blocks that belong to a story's text. A table, code or maths under a heading means it is not a story. */
const TEXT: ReadonlySet<Block["t"]> = new Set(["p", "list", "quote"]);

/** Text that is only the punctuation or space left where a citation stood: "[1] [3]", "[3].", "[2], [4]". */
const LEFTOVER = /^[\s.,;:·|–—-]*$/u;
/** A separator left hanging at the end of a title once its citation is gone: "A title: [3]", "A title - [3]". A full stop is the title's own ("the U.S."). */
const HANGING = /[\s,;:·|–—-]+$/u;

/**
 * A heading's words without its citations, at any depth: a citation inside emphasis is taken out like any other, so none is
 * ever left inside the title's link. The numbers are collected in the order written, each once.
 */
function withoutCites(nodes: Inline[], cites: number[]): Inline[] {
  const out: Inline[] = [];
  let afterCite = false;
  for (const node of nodes) {
    if (node.t === "cite") {
      for (const n of node.n) if (!cites.includes(n)) cites.push(n);
      afterCite = true;
      continue;
    }
    if (node.t === "strong" || node.t === "em" || node.t === "del" || node.t === "link") {
      const inner = withoutCites(node.c, cites);
      if (inner.length > 0) out.push({ ...node, c: inner });
      afterCite = false;
      continue;
    }
    // Only what stands right after a citation and is nothing but punctuation goes: "[3]." and the space between "[1] [3]".
    if (node.t === "text" && afterCite && LEFTOVER.test(node.v)) continue;
    out.push(node);
    afterCite = false;
  }
  return out;
}

/**
 * The sentence stop a heading was written with after its last citation ("### A title [3]."), or "". The parser moves such a
 * stop in front of the citation, where it would read as the title's own; the line as written is the only place that still
 * tells it from one that is ("### Tariffs hit the U.S. [4]").
 */
function movedStop(src: string): string {
  return /\][ \t]*([.,;:!?。！？।]+)[ \t#]*$/u.exec(src.trimEnd())?.[1] ?? "";
}

/**
 * Trims the space, and any separator left hanging, from the two ends of a title. A full stop goes only when it was written
 * after the citation (`moved`): one before it is the title's own.
 */
function tidy(nodes: Inline[], moved: string): Inline[] {
  const out = [...nodes];
  const end = out[out.length - 1];
  if (moved && end?.t === "text" && end.v.endsWith(moved)) out[out.length - 1] = { t: "text", v: end.v.slice(0, -moved.length) };
  while (out.length > 0) {
    const last = out[out.length - 1]!;
    if (last.t !== "text") break;
    const trimmed = last.v.replace(HANGING, "");
    if (trimmed) {
      out[out.length - 1] = { t: "text", v: trimmed };
      break;
    }
    out.pop();
  }
  while (out.length > 0) {
    const first = out[0]!;
    if (first.t !== "text") break;
    const trimmed = first.v.replace(/^\s+/u, "");
    if (trimmed) {
      out[0] = { t: "text", v: trimmed };
      break;
    }
    out.shift();
  }
  return out;
}

/** True when the nodes hold a citation, at any depth. */
function hasCite(nodes: Inline[]): boolean {
  return nodes.some((n) => n.t === "cite" || ((n.t === "strong" || n.t === "em" || n.t === "del" || n.t === "link") && hasCite(n.c)));
}

/** True when the nodes hold any words at all. */
function hasWords(nodes: Inline[]): boolean {
  return nodes.some((n) => (n.t === "text" || n.t === "code" || n.t === "math" ? n.v.trim().length > 0 : n.t === "br" || n.t === "cite" ? false : hasWords(n.c)));
}

/**
 * An answer's blocks with its stories found. Everything that is not part of a story comes back as it was, in order. The blocks
 * must have been read with citations on: without numbered sources "[3]" is only text, and nothing is a story.
 */
export function groupStories(blocks: SourceBlock[]): AnswerPiece[] {
  const out: AnswerPiece[] = [];
  let i = 0;
  while (i < blocks.length) {
    const at = blocks[i]!;
    const block = at.block;
    const keep = () => {
      out.push({ kind: "block", block: at });
      i += 1;
    };
    if (block.t !== "h" || block.level < 2 || !hasCite(block.c)) {
      keep();
      continue;
    }
    const cites: number[] = [];
    const title = tidy(withoutCites(block.c, cites), movedStop(at.src));
    // A heading that is nothing but a citation names nothing.
    if (!hasWords(title) || cites.length === 0) {
      keep();
      continue;
    }
    const body: SourceBlock[] = [];
    let j = i + 1;
    while (j < blocks.length && body.length < STORY_BLOCKS && TEXT.has(blocks[j]!.block.t)) {
      body.push(blocks[j]!);
      j += 1;
    }
    // A table, code or maths straight under its text: it heads a section, and stays a heading. More text than a story holds
    // is not that: the story keeps its first blocks, and the rest follows it as it was written, so a story never turns back
    // into a heading while it is still being written.
    const next = blocks[j]?.block;
    if (next !== undefined && !TEXT.has(next.t) && next.t !== "h" && next.t !== "hr") {
      keep();
      continue;
    }
    out.push({ kind: "story", story: { level: block.level as Story["level"], title, cites, body, src: [at.src, ...body.map((b) => b.src)].join("\n") } });
    i = j;
  }
  return out;
}

/** How many stories an answer holds. */
export function countStories(pieces: AnswerPiece[]): number {
  return pieces.filter((p) => p.kind === "story").length;
}

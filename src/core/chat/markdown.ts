/**
 * The Markdown the AI writes, read into a small tree that the screen draws as React elements (stage 199, ADR 0213). Never HTML:
 * whatever the model writes, including tags, is drawn as text, so an answer can't run anything on the page. It reads the
 * CommonMark and GitHub forms a chat answer uses (headings, paragraphs, emphasis, code, lists with tasks, quotes, tables, rules,
 * links, maths in $ and $$) and is forgiving while an answer streams: a code block or maths block that hasn't closed yet is
 * drawn as one that's still being written.
 *
 * Images in the model's Markdown are drawn as links, never loaded: loading a picture from an address the model wrote could send
 * what's on the page to someone else's server.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "del"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  /** Citations of an answer's numbered web sources ([2], [1][4], [1, 3]), stage 206. The screen draws them only when the sources exist. */
  | { t: "cite"; n: number[] }
  | { t: "math"; v: string }
  | { t: "br" };

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3 | 4 | 5 | 6; c: Inline[] }
  | { t: "code"; lang: string; v: string; open: boolean }
  | { t: "math"; v: string; open: boolean }
  | { t: "list"; ordered: boolean; start: number; tight: boolean; items: ListItem[] }
  | { t: "quote"; blocks: Block[] }
  | { t: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { t: "hr" };

export interface ListItem {
  checked: boolean | null;
  blocks: Block[];
}

/** A top-level block with the source it came from, so a screen can redraw only the blocks that changed while an answer streams. */
export interface SourceBlock {
  block: Block;
  src: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const BULLET = /^( {0,3})([-*+])([ \t]+)(.*)$/;
const ORDERED = /^( {0,3})(\d{1,9})([.)])([ \t]+)(.*)$/;
const EMPTY_ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])[ \t]*$/;
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const MATH_OPEN = /^ {0,3}(\$\$|\\\[)(.*)$/;

const blank = (line: string) => line.trim() === "";

/** Whether a line starts a block that ends a paragraph. */
function startsBlock(line: string): boolean {
  if (FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || MATH_OPEN.test(line)) return true;
  const bullet = BULLET.exec(line);
  if (bullet && bullet[4]!.trim() !== "") return true;
  const ordered = ORDERED.exec(line);
  // Only a list starting at 1 interrupts a paragraph, as in CommonMark, so "2019. A year" stays a sentence.
  return ordered !== null && ordered[2] === "1" && ordered[5]!.trim() !== "";
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\" && s[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (ch === "`") {
      code = !code;
      cell += ch;
    } else if (ch === "|" && !code) {
      cells.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function parseLines(lines: string[], depth: number): SourceBlock[] {
  const out: SourceBlock[] = [];
  let i = 0;
  const push = (block: Block, from: number, to: number) => out.push({ block, src: lines.slice(from, to).join("\n") });

  while (i < lines.length) {
    const line = lines[i]!;
    if (blank(line)) {
      i++;
      continue;
    }
    const from = i;

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      i++;
      let open = true;
      while (i < lines.length) {
        const l = lines[i]!;
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(l);
        if (close && close[1]![0] === marker[0] && close[1]!.length >= marker.length) {
          open = false;
          i++;
          break;
        }
        body.push(l);
        i++;
      }
      push({ t: "code", lang: (fence[2] ?? "").toLowerCase().slice(0, 24), v: body.join("\n"), open }, from, i);
      continue;
    }

    const math = MATH_OPEN.exec(line);
    if (math) {
      const closer = math[1] === "$$" ? "$$" : "\\]";
      const rest = math[2]!;
      // $$ x $$ on one line.
      const sameLine = rest.trimEnd().endsWith(closer) && rest.trim().length >= closer.length;
      if (sameLine) {
        push({ t: "math", v: rest.trimEnd().slice(0, -closer.length).trim(), open: false }, from, i + 1);
        i++;
        continue;
      }
      const body: string[] = rest.trim() ? [rest] : [];
      i++;
      let open = true;
      while (i < lines.length) {
        const l = lines[i]!;
        const at = l.indexOf(closer);
        if (at >= 0) {
          if (l.slice(0, at).trim()) body.push(l.slice(0, at));
          open = false;
          i++;
          break;
        }
        body.push(l);
        i++;
      }
      push({ t: "math", v: body.join("\n").trim(), open }, from, i);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      push({ t: "h", level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, c: parseInline(heading[2] ?? "") }, from, i + 1);
      i++;
      continue;
    }

    if (RULE.test(line)) {
      push({ t: "hr" }, from, i + 1);
      i++;
      continue;
    }

    if (QUOTE.test(line) && depth < 8) {
      const body: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i]!);
        if (q) body.push(q[1]!);
        else if (!blank(lines[i]!) && body.length > 0 && !blank(body[body.length - 1]!) && !startsBlock(lines[i]!)) body.push(lines[i]!);
        else break;
        i++;
      }
      push({ t: "quote", blocks: parseLines(body, depth + 1).map((b) => b.block) }, from, i);
      continue;
    }

    const list = listAt(lines, i, depth);
    if (list) {
      push(list.block, from, list.end);
      i = list.end;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_DELIMITER.test(lines[i + 1]!) && lines[i + 1]!.includes("-")) {
      const head = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]!).map((d) => (d.startsWith(":") && d.endsWith(":") ? "center" : d.endsWith(":") ? "right" : d.startsWith(":") ? "left" : null));
      if (align.length === head.length || align.length > 0) {
        i += 2;
        const rows: Inline[][][] = [];
        while (i < lines.length && !blank(lines[i]!) && lines[i]!.includes("|") && !startsBlock(lines[i]!)) {
          const cells = splitRow(lines[i]!);
          rows.push(head.map((_, c) => parseInline(cells[c] ?? "")));
          i++;
        }
        push({ t: "table", align: head.map((_, c) => align[c] ?? null), head: head.map((h) => parseInline(h)), rows }, from, i);
        continue;
      }
    }

    // A paragraph: lines until a blank one or the start of another block.
    const body: string[] = [line];
    i++;
    while (i < lines.length && !blank(lines[i]!) && !startsBlock(lines[i]!)) {
      // A table can start right under a paragraph line.
      if (lines[i]!.includes("|") && i + 1 < lines.length && TABLE_DELIMITER.test(lines[i + 1]!) && lines[i + 1]!.includes("-")) break;
      body.push(lines[i]!);
      i++;
    }
    push({ t: "p", c: parseInline(body.map((l) => l.replace(/^[ \t]+/, "")).join("\n")) }, from, i);
  }
  return out;
}

interface Marker {
  ordered: boolean;
  delimiter: string;
  number: number;
  /** Where the item's content starts. */
  column: number;
  indent: number;
  content: string;
}

function markerAt(line: string): Marker | null {
  const b = BULLET.exec(line);
  if (b) {
    const spaces = b[3]!.length > 4 ? 1 : b[3]!.length;
    return { ordered: false, delimiter: b[2]!, number: 1, indent: b[1]!.length, column: b[1]!.length + 1 + spaces, content: b[3]!.length > 4 ? b[3]!.slice(1) + b[4]! : b[4]! };
  }
  const o = ORDERED.exec(line);
  if (o) {
    const spaces = o[4]!.length > 4 ? 1 : o[4]!.length;
    return { ordered: true, delimiter: o[3]!, number: Number(o[2]), indent: o[1]!.length, column: o[1]!.length + o[2]!.length + 1 + spaces, content: o[4]!.length > 4 ? o[4]!.slice(1) + o[5]! : o[5]! };
  }
  const e = EMPTY_ITEM.exec(line);
  if (e) {
    const ordered = /\d/.test(e[2]!);
    return { ordered, delimiter: ordered ? e[2]!.slice(-1) : e[2]!, number: ordered ? Number(e[2]!.slice(0, -1)) : 1, indent: e[1]!.length, column: e[1]!.length + e[2]!.length + 1, content: "" };
  }
  return null;
}

function leading(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 4 - (n % 4);
    else break;
  }
  return n;
}

function dedent(line: string, by: number): string {
  let n = 0;
  let i = 0;
  while (i < line.length && n < by) {
    if (line[i] === " ") n++;
    else if (line[i] === "\t") n += 4 - (n % 4);
    else break;
    i++;
  }
  return line.slice(i);
}

function listAt(lines: string[], start: number, depth: number): { block: Block; end: number } | null {
  const first = markerAt(lines[start]!);
  if (!first || depth > 12) return null;
  const items: ListItem[] = [];
  let i = start;
  let tight = true;
  let sawBlank = false;
  while (i < lines.length) {
    const m = markerAt(lines[i]!);
    if (!m || m.ordered !== first.ordered || m.delimiter !== first.delimiter || m.indent >= first.column) break;
    if (sawBlank) tight = false;
    sawBlank = false;
    const body: string[] = [m.content];
    i++;
    while (i < lines.length) {
      const l = lines[i]!;
      if (blank(l)) {
        // A blank line inside an item only when what follows is still indented under it.
        let next = i + 1;
        while (next < lines.length && blank(lines[next]!)) next++;
        if (next < lines.length && leading(lines[next]!) >= m.column) {
          body.push("");
          i++;
          tight = false;
          continue;
        }
        sawBlank = true;
        i++;
        break;
      }
      if (leading(l) >= m.column) {
        body.push(dedent(l, m.column));
        i++;
        continue;
      }
      if (markerAt(l)) break;
      // A lazy continuation of the item's paragraph.
      if (!startsBlock(l) && body.length > 0 && !blank(body[body.length - 1]!)) {
        body.push(l.trimStart());
        i++;
        continue;
      }
      break;
    }
    let checked: boolean | null = null;
    const task = /^\[([ xX])\][ \t]+/.exec(body[0] ?? "");
    if (task) {
      checked = task[1] !== " ";
      body[0] = body[0]!.slice(task[0].length);
    }
    items.push({ checked, blocks: parseLines(body, depth + 1).map((b) => b.block) });
    if (sawBlank) {
      // The list carries on only if the next non-blank line is another item of it.
      let next = i;
      while (next < lines.length && blank(lines[next]!)) next++;
      const n = next < lines.length ? markerAt(lines[next]!) : null;
      if (!n || n.ordered !== first.ordered || n.delimiter !== first.delimiter || n.indent >= first.column) {
        i = next;
        break;
      }
      i = next;
    }
  }
  return { block: { t: "list", ordered: first.ordered, start: first.number, tight, items }, end: i };
}

/**
 * Whether "[2]" is being read as a citation (stage 206). Only an answer that has numbered web sources has citations: anywhere
 * else square brackets are the person's or the model's own ("Smith [1]", "the interval [0, 1]") and stay exactly as written.
 * Set for the length of one parse, which never waits on anything.
 */
let citing = false;

function whileCiting<T>(citations: boolean, read: () => T): T {
  const before = citing;
  citing = citations;
  try {
    return read();
  } finally {
    citing = before;
  }
}

/** Reads a whole answer into top-level blocks with their source. `citations`: the answer has numbered web sources. */
export function parseMarkdown(text: string, options: { citations?: boolean } = {}): SourceBlock[] {
  return whileCiting(options.citations ?? false, () => parseLines(text.replace(/\r\n?/g, "\n").split("\n"), 0));
}

// ---------------------------------------------------------------- inline

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const SAFE_LINK = /^(?:https?:\/\/|mailto:)/i;
const BARE_URL = /^https?:\/\/[^\s<>"'`]+/i;

/** A link the page may open: web and mail addresses only, never javascript: or data:. */
export function safeHref(raw: string): string | null {
  const href = raw.trim().replace(/^<|>$/g, "");
  if (!SAFE_LINK.test(href)) return null;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function trimUrl(url: string): string {
  // A URL at the end of a sentence doesn't take the full stop, and a closing bracket only if it opened one.
  let u = url.replace(/[.,:;!?*_~]+$/, "");
  while (u.endsWith(")") && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1);
  return u;
}

function closing(text: string, from: number, open: string, close: string): number {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > 0) i = end;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i;
  }
  return -1;
}

function findDelimiter(text: string, from: number, delim: string): number {
  for (let i = from; i <= text.length - delim.length; i++) {
    const ch = text[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "`") {
      const run = /^`+/.exec(text.slice(i))![0];
      const end = text.indexOf(run, i + run.length);
      if (end > 0) i = end + run.length - 1;
      continue;
    }
    if (text.startsWith(delim, i) && !/\s/.test(text[i - 1] ?? " ")) {
      // A single * isn't closed by the first half of **.
      if (delim.length === 1 && text[i + 1] === delim) {
        i++;
        continue;
      }
      if (delim === "_" && /[\p{L}\p{N}]/u.test(text[i + 1] ?? "")) continue;
      return i;
    }
  }
  return -1;
}

function pushText(out: Inline[], v: string) {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.t === "text") last.v += v;
  else out.push({ t: "text", v });
}

/** Reads one paragraph's text into inline pieces. `citations` reads "[2]" as a citation, for a caller outside a whole parse. */
export function parseInline(text: string, depth = 0, citations?: boolean): Inline[] {
  if (citations !== undefined) return whileCiting(citations, () => parseInline(text, depth));
  const out: Inline[] = [];
  if (depth > 8) {
    pushText(out, text);
    return out;
  }
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const rest = text.slice(i);

    if (ch === "\\") {
      const next = text[i + 1];
      if (next === "\n") {
        out.push({ t: "br" });
        i += 2;
        continue;
      }
      if (next === "(") {
        const end = text.indexOf("\\)", i + 2);
        if (end > 0) {
          out.push({ t: "math", v: text.slice(i + 2, end).trim() });
          i = end + 2;
          continue;
        }
      }
      if (next !== undefined && PUNCTUATION.test(next)) {
        pushText(out, next);
        i += 2;
        continue;
      }
      pushText(out, ch);
      i++;
      continue;
    }

    if (ch === "\n") {
      // A line break inside a paragraph stays a line break, as people expect in a chat.
      const prev = out[out.length - 1];
      if (prev && prev.t === "text") prev.v = prev.v.replace(/[ \t]+$/, "");
      out.push({ t: "br" });
      i++;
      continue;
    }

    if (ch === "`") {
      const run = /^`+/.exec(rest)![0];
      const end = text.indexOf(run, i + run.length);
      // The closing run must be exactly as long as the opening one.
      if (end > 0 && text[end + run.length] !== "`") {
        let code = text.slice(i + run.length, end).replace(/\n/g, " ");
        if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
        out.push({ t: "code", v: code });
        i = end + run.length;
        continue;
      }
      pushText(out, run);
      i += run.length;
      continue;
    }

    if (ch === "$" && text[i + 1] !== "$" && text[i + 1] !== undefined && !/\s/.test(text[i + 1]!)) {
      // Inline maths: $x^2$. Money ("$5 and $10") isn't: the closing $ must follow a non-space and not come before a digit.
      let end = -1;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === "\\") {
          j++;
          continue;
        }
        if (text[j] === "\n") break;
        if (text[j] === "$") {
          if (!/\s/.test(text[j - 1]!) && !/\d/.test(text[j + 1] ?? "")) end = j;
          break;
        }
      }
      if (end > i + 1 && !/^\d+(?:[.,]\d+)?$/.test(text.slice(i + 1, end))) {
        out.push({ t: "math", v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "!" && text[i + 1] === "[") {
      // A picture the model linked to: drawn as a link to it, never loaded.
      const close = closing(text, i + 2, "[", "]");
      if (close > 0 && text[close + 1] === "(") {
        const end = closing(text, close + 2, "(", ")");
        if (end > 0) {
          const target = text.slice(close + 2, end).trim().split(/\s+/)[0] ?? "";
          const href = safeHref(target);
          const label = text.slice(i + 2, close) || "Image";
          if (href) out.push({ t: "link", href, c: [{ t: "text", v: label }] });
          else pushText(out, label);
          i = end + 1;
          continue;
        }
      }
    }

    if (ch === "[") {
      // A citation of a numbered source: [2], [1, 3], in an answer that has sources. Not an index after a name, a number or
      // another bracket (items[0], x[1], m[0][1]), not a link label, and never with a zero: sources are numbered from one.
      const cite = citing ? /^\[(\d{1,2}(?:\s{0,2},\s{0,2}\d{1,2}){0,8})\](?!\()/.exec(rest) : null;
      const numbers = cite ? cite[1]!.split(",").map((part) => Number(part.trim())) : [];
      const last = out[out.length - 1];
      if (cite && !numbers.includes(0) && (last?.t === "cite" || !/[\p{Script=Latin}\p{N}_\]]/u.test(text[i - 1] ?? " "))) {
        const before = out[out.length - 2];
        // Marks side by side, or a space apart, are one group.
        if (last?.t === "cite") last.n.push(...numbers);
        else if (last?.t === "text" && last.v === " " && before?.t === "cite") {
          out.pop();
          before.n.push(...numbers);
        } else out.push({ t: "cite", n: numbers });
        i += cite[0].length;
        continue;
      }
      const close = closing(text, i + 1, "[", "]");
      if (close > 0 && text[close + 1] === "(") {
        const end = closing(text, close + 2, "(", ")");
        if (end > 0) {
          const target = text.slice(close + 2, end).trim().split(/\s+/)[0] ?? "";
          const href = safeHref(target);
          const label = parseInline(text.slice(i + 1, close), depth + 1);
          if (href) out.push({ t: "link", href, c: label });
          else out.push(...label);
          i = end + 1;
          continue;
        }
      }
    }

    if (ch === "<") {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(rest);
      if (auto) {
        const href = safeHref(auto[1]!);
        if (href) {
          out.push({ t: "link", href, c: [{ t: "text", v: auto[1]! }] });
          i += auto[0].length;
          continue;
        }
      }
    }

    if ((ch === "h" || ch === "H") && /[\s(]/.test(text[i - 1] ?? " ")) {
      const bare = BARE_URL.exec(rest);
      if (bare) {
        const url = trimUrl(bare[0]);
        const href = safeHref(url);
        if (href) {
          out.push({ t: "link", href, c: [{ t: "text", v: url }] });
          i += url.length;
          continue;
        }
      }
    }

    if (ch === "~" && text[i + 1] === "~" && text[i + 2] && !/\s/.test(text[i + 2]!)) {
      const end = findDelimiter(text, i + 2, "~~");
      if (end > i + 2) {
        out.push({ t: "del", c: parseInline(text.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }

    if (ch === "*" || ch === "_") {
      const double = text[i + 1] === ch;
      const delim = double ? ch + ch : ch;
      const after = text[i + delim.length];
      const intraword = ch === "_" && /[\p{L}\p{N}]/u.test(text[i - 1] ?? "");
      if (after && !/\s/.test(after) && !intraword) {
        const end = findDelimiter(text, i + delim.length, delim);
        if (end > i + delim.length) {
          const inner = parseInline(text.slice(i + delim.length, end), depth + 1);
          out.push(double ? { t: "strong", c: inner } : { t: "em", c: inner });
          i = end + delim.length;
          continue;
        }
      }
      pushText(out, delim);
      i += delim.length;
      continue;
    }

    // Plain text up to the next character that might start something.
    const next = rest.slice(1).search(/[\\\n`$!\[<hH~*_]/);
    const take = next < 0 ? rest.length : next + 1;
    pushText(out, rest.slice(0, take));
    i += take;
  }
  return tidyCitations(out);
}

/**
 * A citation sits after its sentence's full stop, with no space before it: "rain fell today [1]." is drawn as "rain fell
 * today." and then the citation, whichever side of the full stop the model put it.
 */
function tidyCitations(nodes: Inline[]): Inline[] {
  for (let k = 0; k < nodes.length; k++) {
    if (nodes[k]!.t !== "cite") continue;
    const before = nodes[k - 1];
    const after = nodes[k + 1];
    const stop = after?.t === "text" ? /^[.,;:!?。！？।]+/u.exec(after.v)?.[0] : undefined;
    if (before?.t === "text") before.v = before.v.replace(/ $/, "");
    if (stop && after?.t === "text") {
      after.v = after.v.slice(stop.length);
      if (before?.t === "text") before.v += stop;
      else {
        nodes.splice(k, 0, { t: "text", v: stop });
        k++;
      }
    }
  }
  return nodes.filter((n) => n.t !== "text" || n.v !== "");
}

/** The plain words of an answer, for reading aloud and copying as text: no code fences, no Markdown marks. */
export function plainText(text: string): string {
  const words = (inl: Inline[]): string => inl.map((n) => (n.t === "text" ? n.v : n.t === "code" ? n.v : n.t === "math" ? n.v : n.t === "br" ? "\n" : n.t === "cite" ? "" : words(n.c))).join("");
  const block = (b: Block): string => {
    switch (b.t) {
      case "p":
      case "h":
        return words(b.c);
      case "code":
        return b.v;
      case "math":
        return b.v;
      case "list":
        return b.items.map((it) => it.blocks.map(block).join("\n")).join("\n");
      case "quote":
        return b.blocks.map(block).join("\n");
      case "table":
        return [b.head.map(words).join(", "), ...b.rows.map((r) => r.map(words).join(", "))].join("\n");
      case "hr":
        return "";
    }
  };
  return parseMarkdown(text)
    .map((b) => block(b.block))
    .filter(Boolean)
    .join("\n\n");
}

/** Sentences to speak, without code blocks or tables (a person doesn't want either read out). */
export function speakable(text: string): string[] {
  const words = (inl: Inline[]): string => inl.map((n) => (n.t === "text" ? n.v : n.t === "code" ? n.v : n.t === "math" ? "" : n.t === "br" ? " " : n.t === "cite" ? "" : words(n.c))).join("");
  const parts: string[] = [];
  const walk = (b: Block) => {
    if (b.t === "p" || b.t === "h") parts.push(words(b.c));
    else if (b.t === "list") b.items.forEach((it) => it.blocks.forEach(walk));
    else if (b.t === "quote") b.blocks.forEach(walk);
  };
  // Citation marks are never read aloud.
  parseMarkdown(text, { citations: true }).forEach((b) => walk(b.block));
  return parts
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
}


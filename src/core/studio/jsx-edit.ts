/**
 * The component editor (ADR 0129): visual edits to React and Next.js
 * components, made in their JSX. A component file is read with the TSX
 * parser Farbaek already ships for its code editor, and an edit replaces
 * only the bytes it means to: an element's words, or the classes in its
 * className string. Anything written as code (a className expression, words
 * mixed with {values}) is left to the code editor, never rewritten.
 */
import { tsxLanguage } from "@codemirror/lang-javascript";

export const MAX_COMPONENT_BYTES = 300 * 1024;
const MAX_TEXT = 500;
const MAX_CLASSES = 60;
const CLASS_TOKEN = /^[A-Za-z0-9_:/.[\]#%()!-]+$/;

export interface JsxElement {
  /** Its place in source order: the editor's handle on it. */
  n: number;
  tag: string;
  /** A built-in element (div, h1, button), not a component. */
  builtin: boolean;
  depth: number;
  line: number;
  /** Where the open tag's name ends, for adding a className. */
  nameEnd: number;
  /** The className when it's a plain string, with the range of its contents. */
  className: { value: string; from: number; to: number } | null;
  /** True when className is written as code, which only the code editor changes. */
  classNameInCode: boolean;
  /** The element's words when its only children are text, with their range. */
  text: { value: string; from: number; to: number } | null;
}

export type JsxScan = { ok: true; elements: JsxElement[] } | { ok: false; reason: string };

type Node = ReturnType<ReturnType<typeof tsxLanguage.parser.parse>["topNode"]["getChildren"]>[number];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** JSX text as people read it: entities decoded, runs of spaces as they render. */
export function decodeJsxText(raw: string): string {
  // Spaces collapse as JSX renders them, before entities: a written &nbsp; stays.
  return raw.replace(/\s+/g, " ").replace(/&(?:#(\d{1,6})|#x([0-9a-f]{1,6})|([a-z]{2,8}));/gi, (m, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : null;
    if (code !== null) return code <= 0x10ffff ? String.fromCodePoint(code) : m;
    return ENTITIES[name!.toLowerCase()] ?? m;
  });
}

/** Words written back as JSX text: the characters JSX gives meaning to become entities. */
export function encodeJsxText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/{/g, "&#123;").replace(/}/g, "&#125;");
}

function tagName(source: string, tag: Node): { name: string; builtin: boolean; end: number } | null {
  for (const child of tag.getChildren("JSXBuiltin").concat(tag.getChildren("JSXIdentifier"), tag.getChildren("JSXMemberExpression"), tag.getChildren("JSXNamespacedName"))) {
    return { name: source.slice(child.from, child.to), builtin: child.name === "JSXBuiltin", end: child.to };
  }
  return null;
}

/**
 * Every JSX element in a component file, in source order. Null text and
 * className mean "edit this in code"; a file that doesn't parse cleanly
 * isn't offered at all, so an edit never lands in broken source.
 */
export function scanJsx(source: string): JsxScan {
  if (source.length > MAX_COMPONENT_BYTES) return { ok: false, reason: "This file is over 300 KB, more than the component editor reads. Change it in code." };
  const tree = tsxLanguage.parser.parse(source);
  let broken = false;
  tree.iterate({
    enter: (n) => {
      if (n.type.isError) broken = true;
    },
  });
  if (broken) return { ok: false, reason: "This file has a syntax error, so the component editor won't change it. Fix it in code first." };

  const elements: JsxElement[] = [];
  const visit = (node: Node, depth: number) => {
    let childDepth = depth;
    if (node.name === "JSXElement") {
      const tag = node.getChild("JSXOpenTag") ?? node.getChild("JSXSelfClosingTag");
      const name = tag ? tagName(source, tag) : null;
      if (tag && name) {
        let className: JsxElement["className"] = null;
        let classNameInCode = false;
        for (const attr of tag.getChildren("JSXAttribute")) {
          const key = attr.getChild("JSXIdentifier");
          if (!key || source.slice(key.from, key.to) !== "className") continue;
          const value = attr.getChild("JSXAttributeValue");
          const raw = value ? source.slice(value.from, value.to) : "";
          if (value && /^(["']).*\1$/s.test(raw)) className = { value: raw.slice(1, -1), from: value.from + 1, to: value.to - 1 };
          else classNameInCode = true;
        }
        // Words: only when every child is text, and some of it isn't space.
        let text: JsxElement["text"] = null;
        if (tag.name === "JSXOpenTag") {
          const kids: Node[] = [];
          for (let c = tag.nextSibling; c && c.name !== "JSXCloseTag"; c = c.nextSibling) kids.push(c);
          if (kids.length > 0 && kids.every((k) => k.name === "JSXText")) {
            const from = kids[0]!.from;
            const to = kids.at(-1)!.to;
            const raw = source.slice(from, to);
            const lead = raw.length - raw.trimStart().length;
            const trail = raw.length - raw.trimEnd().length;
            if (raw.trim()) text = { value: decodeJsxText(raw.trim()), from: from + lead, to: to - trail };
          }
        }
        elements.push({
          n: elements.length,
          tag: name.name,
          builtin: name.builtin,
          depth,
          line: source.slice(0, node.from).split("\n").length,
          nameEnd: name.end,
          className,
          classNameInCode,
          text,
        });
        childDepth = depth + 1;
      }
    }
    for (let c = node.firstChild; c; c = c.nextSibling) visit(c, childDepth);
  };
  visit(tree.topNode, 0);
  if (elements.length === 0) return { ok: false, reason: "This file has no JSX to edit." };
  return { ok: true, elements };
}

export type EditResult = { ok: true; source: string } | { ok: false; reason: string };

/** Changes an element's words. Only for an element whose children are all text. */
export function setJsxText(source: string, el: JsxElement, text: string): EditResult {
  if (!el.text) return { ok: false, reason: "This element's words are mixed with code, so change them in the code editor." };
  const clean = text.trim();
  if (/[\r\n]/.test(clean)) return { ok: false, reason: "Keep the words on one line." };
  if (clean.length < 1 || clean.length > MAX_TEXT) return { ok: false, reason: `Write between 1 and ${MAX_TEXT} characters.` };
  return { ok: true, source: source.slice(0, el.text.from) + encodeJsxText(clean) + source.slice(el.text.to) };
}

/** Splits and checks a class list: plain tokens only, never quotes or code. */
export function parseClasses(input: string): { ok: true; classes: string[] } | { ok: false; reason: string } {
  const classes = input.split(/\s+/).filter(Boolean);
  if (classes.length > MAX_CLASSES) return { ok: false, reason: `Use at most ${MAX_CLASSES} classes.` };
  const bad = classes.find((c) => !CLASS_TOKEN.test(c));
  if (bad) return { ok: false, reason: `"${bad.slice(0, 40)}" isn't a class name Farbaek can write. Use letters, numbers and - _ : / . [ ] # % ( ) ! only.` };
  return { ok: true, classes };
}

/** Changes an element's classes: in its className string, or a new one on a built-in element. */
export function setJsxClasses(source: string, el: JsxElement, input: string): EditResult {
  const parsed = parseClasses(input);
  if (!parsed.ok) return parsed;
  const value = parsed.classes.join(" ");
  if (el.className) return { ok: true, source: source.slice(0, el.className.from) + value + source.slice(el.className.to) };
  if (el.classNameInCode) return { ok: false, reason: "This element's className is written as code, so change it in the code editor." };
  if (!el.builtin) return { ok: false, reason: `<${el.tag}> is a component, so its styles are set inside it. Open its own file.` };
  if (!value) return { ok: true, source };
  return { ok: true, source: `${source.slice(0, el.nameEnd)} className="${value}"${source.slice(el.nameEnd)}` };
}

// ------------------------------------------------------------- Tailwind

export const CLASS_GROUPS = {
  size: { label: "Text size", values: ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl"] },
  weight: { label: "Weight", values: ["font-normal", "font-medium", "font-semibold", "font-bold"] },
  align: { label: "Alignment", values: ["text-left", "text-center", "text-right"] },
  padding: { label: "Padding", values: ["p-0", "p-1", "p-2", "p-3", "p-4", "p-5", "p-6", "p-8", "p-10", "p-12", "p-16"] },
  margin: { label: "Margin", values: ["m-0", "m-1", "m-2", "m-3", "m-4", "m-5", "m-6", "m-8", "m-10", "m-12", "m-16"] },
  corners: { label: "Corners", values: ["rounded-none", "rounded-sm", "rounded", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-full"] },
} as const;
export type ClassGroup = keyof typeof CLASS_GROUPS;

/** The group's class on the element itself, without variants like sm: or hover:. */
export function classGroup(classes: readonly string[], group: ClassGroup): string | null {
  const values: readonly string[] = CLASS_GROUPS[group].values;
  return classes.find((c) => values.includes(c)) ?? null;
}

/** Sets or clears one group's class, keeping every other class (variants too) where it was. */
export function withClassGroup(classes: readonly string[], group: ClassGroup, value: string | null): string[] {
  const values: readonly string[] = CLASS_GROUPS[group].values;
  if (value !== null && !values.includes(value)) return [...classes];
  const at = classes.findIndex((c) => values.includes(c));
  const rest = classes.filter((c) => !values.includes(c));
  if (value === null) return rest;
  if (at < 0) return [...rest, value];
  return [...rest.slice(0, at), value, ...rest.slice(at)];
}

/** Whether the project styles with Tailwind, so the style controls mean something. */
export function isTailwindProject(files: Record<string, string>): boolean {
  const pkg = files["package.json"];
  if (pkg && /"tailwindcss"\s*:/.test(pkg)) return true;
  if (Object.keys(files).some((p) => /(^|\/)tailwind\.config\.(js|cjs|mjs|ts)$/.test(p))) return true;
  return Object.entries(files).some(([p, c]) => /\.css$/.test(p) && /@import\s+["']tailwindcss["']|@tailwind\s+(base|components|utilities)/.test(c));
}

const COMPONENT_ROOTS = /^(?:src\/)?(?:app|pages|components|ui|src)\//;

/** The project's component files, pages and layouts first. */
export function componentFiles(paths: readonly string[]): string[] {
  const rank = (p: string) => (/(^|\/)(page|layout)\.(tsx|jsx)$/.test(p) ? 0 : /(^|\/)(app|pages)\//.test(p) ? 1 : 2);
  return paths
    .filter((p) => /\.(tsx|jsx)$/.test(p) && (COMPONENT_ROOTS.test(p) || !p.includes("/")) && !/(^|\/)node_modules\//.test(p) && !/\.(test|spec|stories)\.(tsx|jsx)$/.test(p))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, 200);
}

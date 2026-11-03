/**
 * The visual editor (ADR 0118, spec §6): a person picks an element in a
 * static page's preview and changes its text, link, image text or style. Each
 * change becomes a targeted edit to the project's own HTML and CSS, the same
 * source the code editor shows, and is reviewed as a diff before it's saved.
 *
 * The scanner keeps every element's position in the source, so an edit
 * replaces only the bytes it means to and the rest of the file stays as the
 * person wrote it. The preview numbers each element in source order
 * (`data-fbk`); the browser may reshape the tree, but the number still points
 * at the source. Styles go into a CSS rule for the element (its id, or a new
 * class), never into a style attribute, so the result stays maintainable.
 *
 * Framework-free: shared by the web app and tests.
 */

import { SCENE_NAMES, isLibraryUrl } from "@/core/media/library";
import { isPhotoUrl } from "@/core/media/photos";
import { resolveSitePath } from "@/core/workspace/static-preview";

export interface SourceAttr {
  name: string;
  value: string | null;
  /** The whole attribute's span in the source, `name="value"`. */
  start: number;
  end: number;
}

export interface SourceElement {
  /** Order in the source, from 0. */
  n: number;
  tag: string;
  /** Index of the start tag's `<`. */
  start: number;
  /** Index just after the start tag's `>`. */
  openEnd: number;
  attrs: SourceAttr[];
  /** The end tag's span, or null for void elements and ones the source never closes. */
  close: { start: number; end: number } | null;
  parent: number | null;
  /** Child elements, by `n`. */
  children: number[];
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const BLOCK = new Set(["address", "article", "aside", "blockquote", "div", "dl", "fieldset", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre", "section", "table", "ul"]);
/** Tags an open element ends by itself when one of these starts. */
const ENDS_ON: Record<string, (next: string) => boolean> = {
  p: (t) => BLOCK.has(t),
  li: (t) => t === "li",
  dt: (t) => t === "dt" || t === "dd",
  dd: (t) => t === "dt" || t === "dd",
  option: (t) => t === "option" || t === "optgroup",
  tr: (t) => t === "tr",
  td: (t) => t === "td" || t === "th" || t === "tr",
  th: (t) => t === "td" || t === "th" || t === "tr",
};

const NAME = /[A-Za-z][A-Za-z0-9-]*/y;

/** Every element in the source, with positions. Lenient, like a browser: unclosed tags close at their parent's end. */
export function scanElements(html: string): SourceElement[] {
  const out: SourceElement[] = [];
  const stack: number[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    if (html[lt + 1] === "/") {
      NAME.lastIndex = lt + 2;
      const m = NAME.exec(html);
      const end = html.indexOf(">", lt);
      if (!m || end < 0) {
        i = lt + 1;
        continue;
      }
      const tag = m[0].toLowerCase();
      const at = stack.findLastIndex((n) => out[n]!.tag === tag);
      if (at >= 0) {
        out[stack[at]!]!.close = { start: lt, end: end + 1 };
        stack.length = at;
      }
      i = end + 1;
      continue;
    }
    NAME.lastIndex = lt + 1;
    const m = NAME.exec(html);
    if (!m) {
      i = lt + 1;
      continue;
    }
    const tag = m[0].toLowerCase();
    const parsed = readAttributes(html, lt + 1 + m[0].length);
    if (!parsed) break;
    while (stack.length && ENDS_ON[out[stack.at(-1)!]!.tag]?.(tag)) stack.pop();
    const parent = stack.at(-1) ?? null;
    const el: SourceElement = { n: out.length, tag, start: lt, openEnd: parsed.end, attrs: parsed.attrs, close: null, parent, children: [] };
    out.push(el);
    if (parent !== null) out[parent]!.children.push(el.n);
    i = parsed.end;
    if (VOID.has(tag) || parsed.selfClosing) continue;
    if (RAW_TEXT.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, i);
      if (close < 0) break;
      const end = html.indexOf(">", close);
      el.close = { start: close, end: end < 0 ? html.length : end + 1 };
      i = el.close.end;
      continue;
    }
    stack.push(el.n);
  }
  return out;
}

function readAttributes(html: string, from: number): { attrs: SourceAttr[]; end: number; selfClosing: boolean } | null {
  const attrs: SourceAttr[] = [];
  let i = from;
  for (;;) {
    while (i < html.length && /\s/.test(html[i]!)) i++;
    if (i >= html.length) return null;
    if (html[i] === ">") return { attrs, end: i + 1, selfClosing: false };
    if (html.startsWith("/>", i)) return { attrs, end: i + 2, selfClosing: true };
    if (html[i] === "/") {
      i++;
      continue;
    }
    const start = i;
    while (i < html.length && !/[\s=>]/.test(html[i]!) && !html.startsWith("/>", i)) i++;
    const name = html.slice(start, i).toLowerCase();
    let j = i;
    while (j < html.length && /\s/.test(html[j]!)) j++;
    if (html[j] !== "=") {
      attrs.push({ name, value: null, start, end: i });
      continue;
    }
    j++;
    while (j < html.length && /\s/.test(html[j]!)) j++;
    const q = html[j];
    if (q === '"' || q === "'") {
      const close = html.indexOf(q, j + 1);
      if (close < 0) return null;
      attrs.push({ name, value: decodeEntities(html.slice(j + 1, close)), start, end: close + 1 });
      i = close + 1;
    } else {
      let k = j;
      while (k < html.length && !/[\s>]/.test(html[k]!)) k++;
      attrs.push({ name, value: decodeEntities(html.slice(j, k)), start, end: k });
      i = k;
    }
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** The attribute the preview numbers elements with. Only in the preview, never saved. */
export const DESIGN_ATTR = "data-fbk";

/** Numbers every element in source order, for the preview to report which one was picked. */
export function annotateForDesign(html: string, elements: SourceElement[] = scanElements(html)): string {
  let out = html;
  for (let k = elements.length - 1; k >= 0; k--) {
    const el = elements[k]!;
    const at = el.start + 1 + el.tag.length;
    out = `${out.slice(0, at)} ${DESIGN_ATTR}="${el.n}"${out.slice(at)}`;
  }
  return out;
}

/** The element's text when it holds only text, decoded; null when it holds other elements or never closes. */
export function editableText(html: string, el: SourceElement): string | null {
  if (!el.close || el.children.length > 0 || RAW_TEXT.has(el.tag) || VOID.has(el.tag)) return null;
  return decodeEntities(html.slice(el.openEnd, el.close.start));
}

export const attrValue = (el: SourceElement, name: string): string | null => el.attrs.find((a) => a.name === name)?.value ?? null;
/** Whether the element has the attribute at all, with a value or without (data-farbaek-placeholder has none). */
export const hasAttr = (el: SourceElement, name: string): boolean => el.attrs.some((a) => a.name === name);

/** An image, a video or a Farbaek Scenes box on the page (ADR 0156), as Studio's media list shows it. */
export interface MediaSlot {
  n: number;
  kind: "image" | "video" | "scene";
  /** The slot's name (data-farbaek-media), or null when the build didn't name it. */
  slot: string | null;
  /** Still a stand-in for the person's own (data-farbaek-placeholder). */
  placeholder: boolean;
  /** The image or video address, or the scene's name. */
  source: string | null;
}

export function mediaSlots(elements: readonly SourceElement[]): MediaSlot[] {
  return elements.flatMap((el): MediaSlot[] => {
    const scene = attrValue(el, "data-farbaek-scene");
    const kind = el.tag === "img" ? "image" : el.tag === "video" ? "video" : scene !== null ? "scene" : null;
    if (!kind) return [];
    const firstSource = kind === "video" ? el.children.map((c) => elements[c]!).find((c) => c.tag === "source" && attrValue(c, "src")) : undefined;
    const source = kind === "scene" ? scene : (attrValue(el, "src") ?? (firstSource ? attrValue(firstSource, "src") : null));
    return [{ n: el.n, kind, slot: attrValue(el, "data-farbaek-media"), placeholder: hasAttr(el, "data-farbaek-placeholder"), source }];
  });
}

/** What a person can pick, as the page's outline: headings, text, links, buttons, images and list items inside the body. */
export const PICKABLE = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "button", "img", "li", "blockquote", "figcaption", "label", "span", "small", "strong", "em", "section", "header", "footer", "nav", "main", "article"]);

export function outline(html: string, elements: SourceElement[] = scanElements(html)): { n: number; tag: string; label: string; depth: number }[] {
  const body = elements.find((e) => e.tag === "body");
  const inside = (el: SourceElement): number => {
    let depth = 0;
    for (let p = el.parent; p !== null; p = elements[p]!.parent) {
      if (body && p === body.n) return depth;
      depth++;
    }
    return body ? -1 : depth;
  };
  return elements.flatMap((el) => {
    const scene = attrValue(el, "data-farbaek-scene");
    if (!PICKABLE.has(el.tag) && el.tag !== "video" && scene === null) return [];
    const depth = inside(el);
    if (depth < 0) return [];
    const text =
      scene !== null
        ? `3D scene: ${scene}`
        : el.tag === "img"
          ? (attrValue(el, "alt") ?? attrValue(el, "src") ?? "")
          : el.tag === "video"
            ? (attrValue(el, "aria-label") ?? attrValue(el, "data-farbaek-media") ?? "Video")
            : visibleText(html, el, elements);
    if (!text && !["section", "header", "footer", "nav", "main", "article"].includes(el.tag)) return [];
    return [{ n: el.n, tag: el.tag, label: text.slice(0, 80), depth }];
  });
}

/** Where an element's content ends: its end tag, or for one the source never closes, where the next element outside it starts. */
function contentEnd(html: string, el: SourceElement, elements: SourceElement[]): number {
  if (el.close) return el.close.start;
  const within = (e: SourceElement) => {
    for (let p = e.parent; p !== null; p = elements[p]!.parent) if (p === el.n) return true;
    return false;
  };
  const next = elements.find((e) => e.n > el.n && !within(e));
  if (next) return next.start;
  const parent = el.parent === null ? null : elements[el.parent]!;
  return parent?.close?.start ?? html.length;
}

function visibleText(html: string, el: SourceElement, elements: SourceElement[]): string {
  const end = contentEnd(html, el, elements);
  return decodeEntities(
    html
      .slice(el.openEnd, end)
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The same element in a later version of the page. Visual edits never add or
 * remove elements except a style block in the head, so the element keeps its
 * place among elements with its tag.
 */
export function relocate(before: string, n: number, after: string): number | null {
  const old = scanElements(before);
  const el = old[n];
  if (!el) return null;
  const k = old.filter((e) => e.tag === el.tag && e.n < n).length;
  return scanElements(after).filter((e) => e.tag === el.tag)[k]?.n ?? null;
}

// ---- Edits -------------------------------------------------------------------

export const STYLE_PROPS = ["color", "background-color", "font-size", "font-weight", "text-align", "padding", "border-radius"] as const;
export type StyleProp = (typeof STYLE_PROPS)[number];

export type VisualEdit =
  | { kind: "text"; text: string }
  | { kind: "link"; href: string }
  | { kind: "image"; alt: string }
  /**
   * A new image or video (ADR 0156): an https address, or a project image's
   * path from the project's root. A video can also get a new poster. The
   * placeholder mark comes off for the person's own image or link, and stays
   * for a Farbaek library file or a stand-in photo.
   */
  | { kind: "media"; src: string; poster?: string | null }
  /** Another scene in a Farbaek Scenes box. */
  | { kind: "scene"; scene: string }
  /** A value per property; null removes the property from the element's rule. */
  | { kind: "style"; props: Partial<Record<StyleProp, string | null>> };

export type EditResult = { ok: true; files: Record<string, string>; changed: string[]; note: string | null } | { ok: false; reason: string };

const MAX_TEXT = 5_000;

/** A style value Farbaek writes, or null when it isn't one of the values the editor offers. Nothing else reaches the CSS. */
export function checkStyleValue(prop: StyleProp, value: string): string | null {
  const v = value.trim().toLowerCase();
  switch (prop) {
    case "color":
    case "background-color":
      return /^#[0-9a-f]{6}$/.test(v) ? v : null;
    case "font-size":
      return /^\d{1,3}px$/.test(v) && Number.parseInt(v, 10) >= 8 && Number.parseInt(v, 10) <= 160 ? v : null;
    case "font-weight":
      return ["300", "400", "500", "600", "700", "800"].includes(v) ? v : null;
    case "text-align":
      return ["left", "center", "right"].includes(v) ? v : null;
    case "padding":
    case "border-radius":
      return /^\d{1,3}px$/.test(v) && Number.parseInt(v, 10) <= 200 ? v : null;
  }
}

/** Links a visual edit may set: a page or file in the site, an anchor, or https, mailto and tel addresses. */
export function checkHref(href: string): string | null {
  const h = href.trim();
  if (!h || h.length > 2_000 || /[\s<>"]/.test(h)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return /^(https?:\/\/|mailto:|tel:)/i.test(h) ? h : null;
  if (h.startsWith("//")) return null;
  return h;
}

/** A path from `page` to the project file `target`, as an href written in that page. */
export function relativeHref(page: string, target: string): string {
  const from = page.split("/").slice(0, -1);
  const to = target.split("/");
  let k = 0;
  while (k < from.length && k < to.length - 1 && from[k] === to[k]) k++;
  return [...Array(from.length - k).fill(".."), ...to.slice(k)].join("/");
}

/**
 * Where a replaced image or video may point, written for `page`, or null:
 * an https address, or (for images) a project image's path from the root,
 * which must be one of `assets`. Projects can't hold video yet (ADR 0108).
 */
export function mediaRef(page: string, src: string, kind: "image" | "video", assets: ReadonlySet<string>): string | null {
  const s = src.trim();
  if (!s || s.length > 2_000 || /[\s<>"'`]/.test(s)) return null;
  // Farbaek's own library files are always allowed, wherever the library is served from (a local build serves it over http).
  if (isLibraryUrl(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return /^https:\/\/[^/]/i.test(s) ? s : null;
  if (kind === "video" || s.startsWith("//") || s.split("/").includes("..")) return null;
  const path = s.replace(/^\/+/, "");
  return assets.has(path) ? relativeHref(page, path) : null;
}

function removeAttribute(html: string, el: SourceElement, name: string): string {
  const attr = el.attrs.find((a) => a.name === name);
  if (!attr) return html;
  const from = /\s/.test(html[attr.start - 1] ?? "") ? attr.start - 1 : attr.start;
  return html.slice(0, from) + html.slice(attr.end);
}

function replaceMedia(html: string, n: number, src: string, poster: string | null): string {
  let out = html;
  const at = (k: number) => scanElements(out)[k]!;
  const el = at(n);
  if (el.tag === "img") {
    out = setAttribute(out, el, "src", src);
    out = removeAttribute(out, at(n), "srcset");
  } else {
    // A video's address is its own src, else its first <source>; the type follows the file.
    const source = el.children.map((c) => scanElements(out)[c]!).find((c) => c.tag === "source" && attrValue(c, "src") !== null);
    if (attrValue(el, "src") !== null || !source) out = setAttribute(out, el, "src", src);
    else {
      out = setAttribute(out, source, "src", src);
      const type = /\.webm(?:[?#]|$)/i.test(src) ? "video/webm" : /\.mp4(?:[?#]|$)/i.test(src) ? "video/mp4" : null;
      out = type ? setAttribute(out, at(source.n), "type", type) : removeAttribute(out, at(source.n), "type");
    }
    if (poster) out = setAttribute(out, at(n), "poster", poster);
  }
  // A library file or a stand-in photo is still a placeholder; the person's own image or link isn't.
  const standIn = isLibraryUrl(src) || isPhotoUrl(src);
  if (standIn) return hasAttr(at(n), "data-farbaek-placeholder") ? out : setAttribute(out, at(n), "data-farbaek-placeholder", "");
  return removeAttribute(out, at(n), "data-farbaek-placeholder");
}

/**
 * Applies one visual edit to the page's element `n` and returns the files it
 * changed. Text and links change the HTML in place; styles go into a CSS rule
 * for the element: the page's own stylesheet when it links one in the
 * project, otherwise a style block in its head. `assets` are the project's
 * image paths, which a replaced image may point at.
 */
export function applyVisualEdit(files: Readonly<Record<string, string>>, page: string, n: number, edit: VisualEdit, assets: ReadonlySet<string> = new Set()): EditResult {
  const html = files[page];
  if (html === undefined) return { ok: false, reason: `There's no ${page} in this project.` };
  const elements = scanElements(html);
  const el = elements[n];
  if (!el) return { ok: false, reason: "That element isn't in the page anymore. Pick it again." };

  if (edit.kind === "text") {
    if (editableText(html, el) === null) return { ok: false, reason: "This element holds other elements. Pick the text inside it, or edit it in code." };
    const text = edit.text.replace(/\r\n?/g, "\n");
    if (text.length > MAX_TEXT) return { ok: false, reason: `Text can be up to ${MAX_TEXT.toLocaleString("en-US")} characters.` };
    return changed(files, { [page]: html.slice(0, el.openEnd) + escapeText(text) + html.slice(el.close!.start) });
  }
  if (edit.kind === "link") {
    if (el.tag !== "a") return { ok: false, reason: "Only links have an address." };
    const href = checkHref(edit.href);
    if (href === null) return { ok: false, reason: "Use a page in this site, an anchor such as #contact, or an https, mailto or tel address." };
    return changed(files, { [page]: setAttribute(html, el, "href", href) });
  }
  if (edit.kind === "image") {
    if (el.tag !== "img") return { ok: false, reason: "Only images have a description." };
    if (edit.alt.length > 500) return { ok: false, reason: "Keep the description under 500 characters." };
    return changed(files, { [page]: setAttribute(html, el, "alt", edit.alt.replace(/\s+/g, " ").trim()) });
  }
  if (edit.kind === "media") {
    if (el.tag !== "img" && el.tag !== "video") return { ok: false, reason: "Only images and videos can be replaced." };
    const kind = el.tag === "img" ? "image" : "video";
    const src = mediaRef(page, edit.src, kind, assets);
    if (src === null) {
      return {
        ok: false,
        reason: kind === "image" ? "Use an image in this project or an https address." : "Use a Farbaek library video or an https address. Projects can't hold video files yet.",
      };
    }
    const poster = edit.poster ? mediaRef(page, edit.poster, "image", assets) : null;
    if (edit.poster && poster === null) return { ok: false, reason: "Use an image in this project or an https address for the poster." };
    return changed(files, { [page]: replaceMedia(html, n, src, poster) });
  }
  if (edit.kind === "scene") {
    if (attrValue(el, "data-farbaek-scene") === null) return { ok: false, reason: "Only a 3D scene box has a scene." };
    if (!(SCENE_NAMES as readonly string[]).includes(edit.scene)) return { ok: false, reason: "That isn't one of the Farbaek scenes." };
    return changed(files, { [page]: setAttribute(html, el, "data-farbaek-scene", edit.scene) });
  }

  const decls: [StyleProp, string | null][] = [];
  for (const prop of STYLE_PROPS) {
    if (!(prop in edit.props)) continue;
    const raw = edit.props[prop];
    if (raw === null || raw === undefined) {
      decls.push([prop, null]);
      continue;
    }
    const value = checkStyleValue(prop, raw);
    if (value === null) return { ok: false, reason: `That ${prop.replace("-", " ")} isn't one the editor offers.` };
    decls.push([prop, value]);
  }
  if (decls.length === 0) return { ok: false, reason: "Change a style first." };

  // The rule's selector: the element's id when it has a usable one, else a new class.
  let page2 = html;
  let selector: string;
  const id = attrValue(el, "id");
  if (id && /^[A-Za-z][\w-]*$/.test(id)) {
    selector = `#${id}`;
  } else {
    const existing = (attrValue(el, "class") ?? "").split(/\s+/).find((c) => /^vb-[a-z0-9]+-\d+$/.test(c));
    if (existing) {
      selector = `.${existing}`;
    } else {
      const used = new Set([...Object.values(files).join("\n").matchAll(/vb-[a-z0-9]+-(\d+)/g)].map((m) => m[0]));
      let k = 1;
      while (used.has(`vb-${el.tag}-${k}`)) k++;
      const cls = `vb-${el.tag}-${k}`;
      selector = `.${cls}`;
      const classes = attrValue(el, "class");
      page2 = setAttribute(html, el, "class", classes && classes.trim() ? `${classes.trim()} ${cls}` : cls);
    }
  }

  // Where the rule goes: the first stylesheet the page links in the project, else a style block in the page.
  const sheet = elements
    .filter((e) => e.tag === "link" && /(^|\s)stylesheet(\s|$)/i.test(attrValue(e, "rel") ?? ""))
    .map((e) => resolveSitePath(page, attrValue(e, "href") ?? ""))
    .find((p): p is string => p !== null && files[p] !== undefined);
  if (sheet) {
    return changed(files, { [sheet]: upsertRule(files[sheet]!, selector, decls), ...(page2 !== html ? { [page]: page2 } : {}) }, null);
  }
  return changed(files, { [page]: upsertStyleBlock(page2, selector, decls) }, "This page links no stylesheet in the project, so the style went into a style block in its head.");
}

function changed(files: Readonly<Record<string, string>>, next: Record<string, string>, note: string | null = null): EditResult {
  const paths = Object.keys(next).filter((p) => next[p] !== files[p]);
  if (paths.length === 0) return { ok: false, reason: "That's how it already is." };
  return { ok: true, files: { ...files, ...next }, changed: paths, note };
}

function setAttribute(html: string, el: SourceElement, name: string, value: string): string {
  const attr = el.attrs.find((a) => a.name === name);
  const text = `${name}="${escapeAttr(value)}"`;
  if (attr) return html.slice(0, attr.start) + text + html.slice(attr.end);
  const at = el.start + 1 + el.tag.length;
  return `${html.slice(0, at)} ${text}${html.slice(at)}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Sets declarations in the top-level rule for `selector`, adding the rule at the end when there isn't one. */
export function upsertRule(css: string, selector: string, decls: readonly [string, string | null][]): string {
  // Only a rule whose whole selector is this one: it starts the file or follows a rule, a statement or a comment.
  const re = new RegExp(`(?<=^|[};]|\\*/)(\\s*)${escapeRe(selector)}\\s*\\{([^{}]*)\\}`, "g");
  let match: RegExpExecArray | null = null;
  for (let m = re.exec(css); m; m = re.exec(css)) if (depthAt(css, m.index + m[1]!.length) === 0) match = m;
  if (!match) {
    const set = decls.filter(([, v]) => v !== null);
    if (set.length === 0) return css;
    const block = `${selector} {\n${set.map(([p, v]) => `  ${p}: ${v};`).join("\n")}\n}\n`;
    return `${css}${css.length === 0 || css.endsWith("\n\n") ? "" : css.endsWith("\n") ? "\n" : "\n\n"}${block}`;
  }
  const existing = match[2]!
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const at = d.indexOf(":");
      return at < 0 ? ([d, ""] as [string, string]) : ([d.slice(0, at).trim(), d.slice(at + 1).trim()] as [string, string]);
    });
  const next = new Map(existing);
  for (const [p, v] of decls) {
    if (v === null) next.delete(p);
    else next.set(p, v);
  }
  const start = match.index + match[1]!.length;
  const end = match.index + match[0].length;
  const body = [...next].map(([p, v]) => `  ${p}: ${v};`).join("\n");
  return `${css.slice(0, start)}${selector} {\n${body}${body ? "\n" : ""}}${css.slice(end)}`;
}

/** Whether a position sits inside braces, such as an @media block. Rules the editor writes stay at the top level. */
function depthAt(css: string, at: number): number {
  let depth = 0;
  for (let i = 0; i < at; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth = Math.max(0, depth - 1);
  }
  return depth;
}

const STYLE_MARK = "data-visual-edits";

function upsertStyleBlock(html: string, selector: string, decls: readonly [string, string | null][]): string {
  const elements = scanElements(html);
  const block = elements.find((e) => e.tag === "style" && e.attrs.some((a) => a.name === STYLE_MARK) && e.close);
  if (block) {
    const css = html.slice(block.openEnd, block.close!.start);
    const inner = upsertRule(css.replace(/^\n/, ""), selector, decls);
    return `${html.slice(0, block.openEnd)}\n${inner}${html.slice(block.close!.start)}`;
  }
  const rule = upsertRule("", selector, decls);
  const tag = `<style ${STYLE_MARK}>\n${rule}</style>\n`;
  const head = elements.find((e) => e.tag === "head");
  if (head?.close) return `${html.slice(0, head.close.start)}${tag}${html.slice(head.close.start)}`;
  const body = elements.find((e) => e.tag === "body");
  if (body) return `${html.slice(0, body.start)}${tag}${html.slice(body.start)}`;
  return `${tag}${html}`;
}

// ---- The preview's side ------------------------------------------------------

export const DESIGN_PICK_MESSAGE = "farbaek-design-pick";
export const DESIGN_SELECT_MESSAGE = "farbaek-design-select";

/** What the preview reports about the picked element, as the browser computed it. */
export interface PickedStyle {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  textAlign: string;
  padding: string;
  borderRadius: string;
}

/**
 * Runs inside the locked-down preview frame in design mode: outlines the
 * element under the pointer, and on a click or tap reports the numbered
 * element instead of following links or submitting forms. The parent can ask
 * it to select an element by number. It reaches nothing but its parent.
 */
export const DESIGN_SCRIPT = `<style>[${DESIGN_ATTR}-hover]{outline:2px dashed rgba(37,99,235,.7)!important;outline-offset:2px!important;cursor:pointer!important}[${DESIGN_ATTR}-picked]{outline:2px solid rgb(37,99,235)!important;outline-offset:2px!important}</style><script>(function(){var A="${DESIGN_ATTR}",hover=null,picked=null;function el(t){return t&&t.closest?t.closest("body ["+A+"]"):null}function report(e){if(picked)picked.removeAttribute(A+"-picked");picked=e;e.setAttribute(A+"-picked","");var s=getComputedStyle(e),p=s.paddingTop===s.paddingRight&&s.paddingTop===s.paddingBottom&&s.paddingTop===s.paddingLeft?s.paddingTop:"";parent.postMessage({type:"${DESIGN_PICK_MESSAGE}",n:Number(e.getAttribute(A)),style:{color:s.color,backgroundColor:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,textAlign:s.textAlign,padding:p,borderRadius:s.borderTopLeftRadius}},"*")}window.addEventListener("mouseover",function(ev){var e=el(ev.target);if(hover&&hover!==e)hover.removeAttribute(A+"-hover");hover=e;if(e)e.setAttribute(A+"-hover","")},true);window.addEventListener("click",function(ev){var e=el(ev.target);ev.preventDefault();ev.stopImmediatePropagation();if(e)report(e)},true);window.addEventListener("submit",function(ev){ev.preventDefault();ev.stopImmediatePropagation()},true);window.addEventListener("message",function(ev){if(ev.source!==parent)return;var d=ev.data;if(!d||d.type!=="${DESIGN_SELECT_MESSAGE}"||typeof d.n!=="number")return;var e=document.querySelector("["+A+'="'+d.n+'"]');if(e){report(e);if(e.scrollIntoView)e.scrollIntoView({block:"nearest"})}})})();</script>`;

/** "rgb(17, 24, 39)" as "#111827"; null for transparent or anything else. */
export function cssColorToHex(value: string): string | null {
  const m = value.trim().match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (!m) return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
  if (m[4] !== undefined && Number.parseFloat(m[4]) === 0) return null;
  return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("")}`;
}

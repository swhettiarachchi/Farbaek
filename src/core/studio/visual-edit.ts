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
import { DARK_LOOKS, LIGHT_LOOKS, STUDIO_KIT_PRO_CSS, STUDIO_KIT_PRO_JS, usesStudioKit } from "@/core/media/studio-kit";
import { CORNERS, FONT_PAIRS, TEXT_SIZE_VALUES, THEME_TOKENS, fontStack, fontsHref, type CornerId, type FontPairId, type ThemeToken } from "@/core/studio/site-theme";
import { SNIPPETS, isSnippetId } from "@/core/studio/snippets";
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
  | { kind: "style"; props: Partial<Record<StyleProp, string | null>> }
  /** The leading text of a button or link whose only other content is an empty decoration, such as the kit's arrow (ADR 0159). */
  | { kind: "label"; text: string }
  /** Moves a section before another of its siblings, or to the end when `before` is null (ADR 0159). */
  | { kind: "move"; before: number | null }
  /** Adds a copy of a section right after it, with its ids made unique. */
  | { kind: "duplicate" }
  /** Takes a section out of the page. */
  | { kind: "remove" }
  /** Adds one of Farbaek's own sections after this one, or at the end when this is main. Never HTML from the client. */
  | { kind: "insert"; snippet: string }
  /** The site's look, colours, fonts or corners, across every page, for a site on the Studio kit. */
  | { kind: "theme"; look?: string; tokens?: Partial<Record<ThemeToken, string>>; fonts?: string; corners?: string };

/** `select` is the edited element's number afterwards, when a structural edit moved or added it. */
export type EditResult = { ok: true; files: Record<string, string>; changed: string[]; note: string | null; select?: number } | { ok: false; reason: string };

const MAX_TEXT = 5_000;

/** A style value Farbaek writes, or null when it isn't one of the values the editor offers. Nothing else reaches the CSS. */
export function checkStyleValue(prop: StyleProp, value: string): string | null {
  const v = value.trim().toLowerCase();
  switch (prop) {
    case "color":
    case "background-color":
      return /^#[0-9a-f]{6}$/.test(v) ? v : null;
    case "font-size":
      // A size that scales with the screen, from Studio's presets, or an exact px.
      if (TEXT_SIZE_VALUES.includes(v)) return v;
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
    // In a <picture>, the browser takes a <source> before the <img>: each source now offers the new image too.
    const parent = el.parent === null ? null : at(el.parent);
    if (parent?.tag === "picture") {
      for (const k of parent.children.filter((c) => at(c).tag === "source")) {
        out = setAttribute(out, at(k), "srcset", src);
        for (const name of ["type", "sizes", "media"]) out = removeAttribute(out, at(k), name);
      }
    }
  } else {
    // A video's address is its own src, else its <source> elements: every one of them, or a browser that
    // can't play the first would fall back to the old file. The type follows the new file.
    const sources = el.children.filter((c) => at(c).tag === "source");
    if (attrValue(el, "src") !== null || sources.length === 0) out = setAttribute(out, el, "src", src);
    const type = /\.webm(?:[?#]|$)/i.test(src) ? "video/webm" : /\.mp4(?:[?#]|$)/i.test(src) ? "video/mp4" : null;
    for (const k of sources) {
      out = setAttribute(out, at(k), "src", src);
      out = type ? setAttribute(out, at(k), "type", type) : removeAttribute(out, at(k), "type");
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

  if (edit.kind === "label") {
    if (labelText(html, el, elements) === null) return { ok: false, reason: "Only a button or link with a label beside an icon has a label to change." };
    const text = edit.text.replace(/\s+/g, " ").trim();
    if (!text || text.length > 200) return { ok: false, reason: "Write a label of up to 200 characters." };
    const first = elements[el.children[0]!]!;
    return changed(files, { [page]: html.slice(0, el.openEnd) + escapeText(text) + " " + html.slice(first.start) });
  }
  if (edit.kind === "move" || edit.kind === "duplicate" || edit.kind === "remove" || edit.kind === "insert") return structuralEdit(files, page, html, elements, el, edit);
  if (edit.kind === "theme") return themeEdit(files, edit);

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
    // The person chose this for this one element, so it wins over the site's own rules however specific they are:
    // a site's ".section h2" or ".hero .fs-display" would otherwise beat the editor's class and the change wouldn't show.
    decls.push([prop, `${value} !important`]);
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

function changed(files: Readonly<Record<string, string>>, next: Record<string, string>, note: string | null = null, select?: number): EditResult {
  const paths = Object.keys(next).filter((p) => next[p] !== files[p]);
  if (paths.length === 0) return { ok: false, reason: "That's how it already is." };
  return { ok: true, files: { ...files, ...next }, changed: paths, note, ...(select === undefined ? {} : { select }) };
}

// ---- Sections, labels and the theme (ADR 0159) -------------------------------

const SECTION_TAGS = new Set(["section", "header", "footer", "nav", "article", "aside", "div", "figure", "form"]);

/** A block of the page a person can move, duplicate or remove: what Studio's Sections panel lists. */
export interface SectionInfo {
  n: number;
  tag: string;
  label: string;
}

/** The page's sections: main's children, or the body's block children when there's no main. */
export function sections(html: string, elements: SourceElement[] = scanElements(html)): SectionInfo[] {
  const main = elements.find((e) => e.tag === "main");
  const body = elements.find((e) => e.tag === "body");
  const parent = main ?? body;
  if (!parent) return [];
  return parent.children
    .map((c) => elements[c]!)
    .filter((e) => SECTION_TAGS.has(e.tag) && e.close !== null && !(main === undefined && e.tag === "nav"))
    .map((e) => ({ n: e.n, tag: e.tag, label: sectionLabel(html, e, elements) }));
}

function sectionLabel(html: string, el: SourceElement, elements: SourceElement[]): string {
  const within = (e: SourceElement) => {
    for (let p = e.parent; p !== null; p = elements[p]!.parent) if (p === el.n) return true;
    return false;
  };
  const heading = elements.find((e) => e.n > el.n && /^h[1-4]$/.test(e.tag) && within(e));
  const text = heading ? visibleText(html, heading, elements) : "";
  if (text) return text.slice(0, 60);
  // No heading: the name it gives itself ("In numbers"), else its first line of text, such as a quote.
  const label = attrValue(el, "aria-label");
  if (label) return label.slice(0, 60);
  const line = elements.find((e) => e.n > el.n && ["blockquote", "p", "summary", "figcaption", "li", "span"].includes(e.tag) && within(e) && visibleText(html, e, elements));
  if (line) return visibleText(html, line, elements).slice(0, 60);
  const id = attrValue(el, "id");
  if (id) return id.slice(0, 60);
  const cls = (attrValue(el, "class") ?? "").split(/\s+/).find((c) => c && !c.startsWith("vb-"));
  return cls ? cls.replace(/^fs-/, "").replace(/[-_]+/g, " ") : el.tag;
}

/** A button's or link's leading text when its only other content is empty, hidden decoration (the kit's arrow); else null. */
export function labelText(html: string, el: SourceElement, elements: SourceElement[] = scanElements(html)): string | null {
  if (!el.close || el.children.length === 0 || !["a", "button", "summary", "label"].includes(el.tag)) return null;
  const decorative = el.children.every((c) => {
    const k = elements[c]!;
    return attrValue(k, "aria-hidden") === "true" && k.children.length === 0 && (!k.close || html.slice(k.openEnd, k.close.start).trim() === "");
  });
  if (!decorative) return null;
  const text = decodeEntities(html.slice(el.openEnd, elements[el.children[0]!]!.start)).replace(/\s+/g, " ").trim();
  return text || null;
}

/** Where an element's source begins, with the whitespace before it on its line, and where it ends. */
function spanOf(html: string, el: SourceElement): { from: number; to: number } {
  let from = el.start;
  while (from > 0 && /[ \t]/.test(html[from - 1]!)) from--;
  if (from > 0 && html[from - 1] === "\n") from--;
  if (from > 0 && html[from - 1] === "\r") from--;
  return { from, to: el.close ? el.close.end : el.openEnd };
}

/** Ids in a block of HTML renamed so none clashes with `taken`, with the labels and anchors inside it following. */
function uniqueIds(block: string, taken: Set<string>): string {
  const ids = [...block.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
  let out = block;
  for (const id of ids) {
    let k = 2;
    while (taken.has(`${id}-${k}`)) k++;
    const next = `${id}-${k}`;
    taken.add(next);
    out = out
      .replace(new RegExp(`(\\s(?:id|for|aria-labelledby|aria-describedby|aria-controls)="(?:[^"]*\\s)?)${escapeRe(id)}(?=["\\s])`, "g"), `$1${next}`)
      .replace(new RegExp(`href="#${escapeRe(id)}"`, "g"), `href="#${next}"`);
  }
  return out;
}

function structuralEdit(
  files: Readonly<Record<string, string>>,
  page: string,
  html: string,
  elements: SourceElement[],
  el: SourceElement,
  edit: Extract<VisualEdit, { kind: "move" | "duplicate" | "remove" | "insert" }>,
): EditResult {
  const listed = sections(html, elements);
  const isSection = listed.some((s) => s.n === el.n);
  const findAt = (out: string, start: number) => scanElements(out).find((e) => e.start === start)?.n;

  if (edit.kind === "insert") {
    if (!isSnippetId(edit.snippet)) return { ok: false, reason: "That isn't one of the sections Studio offers." };
    const snippet = SNIPPETS[edit.snippet];
    const main = elements.find((e) => e.tag === "main");
    const intoContainer = el.tag === "main" || el.tag === "body";
    if (!intoContainer && !isSection) return { ok: false, reason: "Pick a section to add the new one after." };
    const taken = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
    // After the chosen section, or at the end of main (or the body).
    const container = intoContainer ? (main ?? el) : null;
    const anchor = container ? (listed.at(-1) ? elements[listed.at(-1)!.n]! : null) : el;
    const at = anchor ? spanOf(html, anchor).to : container!.close ? container!.close.start : container!.openEnd;
    const indent = anchor ? html.slice(spanOf(html, anchor).from, anchor.start).replace(/^[\r\n]+/, "") : "      ";
    const block = uniqueIds(snippet.html, taken).replace(/\n {4}/g, `\n${indent}`);
    let out = `${html.slice(0, at)}\n${indent}${block}${html.slice(at)}`;
    if (snippet.pro && !out.includes(STUDIO_KIT_PRO_CSS)) out = withProKit(out);
    const start = at + 1 + indent.length;
    // The Pro links go in the head, before the new section, so its start moves by their length.
    const shift = out.indexOf(block) - start;
    return changed(files, { [page]: out }, snippet.pro ? "This section uses Studio kit Pro." : null, findAt(out, start + Math.max(0, shift)));
  }

  if (!isSection) return { ok: false, reason: "Pick a whole section first: choose it in the Sections list or use Select section." };
  const { from, to } = spanOf(html, el);
  const block = html.slice(from, to);

  if (edit.kind === "remove") {
    if (listed.length <= 1) return { ok: false, reason: "A page needs at least one section." };
    return changed(files, { [page]: html.slice(0, from) + html.slice(to) });
  }
  if (edit.kind === "duplicate") {
    const taken = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
    const copy = uniqueIds(block, taken);
    const out = html.slice(0, to) + copy + html.slice(to);
    return changed(files, { [page]: out }, null, findAt(out, to + (el.start - from)));
  }

  // Move: only among the sections beside it.
  const siblings = listed.filter((s) => elements[s.n]!.parent === el.parent);
  if (edit.before !== null && !siblings.some((s) => s.n === edit.before)) return { ok: false, reason: "A section can only move among the sections around it." };
  if (edit.before === el.n) return { ok: false, reason: "That's how it already is." };
  const rest = html.slice(0, from) + html.slice(to);
  const shift = (pos: number) => (pos > from ? pos - (to - from) : pos);
  let at: number;
  if (edit.before !== null) at = shift(spanOf(html, elements[edit.before]!).from);
  else {
    const last = siblings.filter((s) => s.n !== el.n).at(-1);
    if (!last) return { ok: false, reason: "That's how it already is." };
    at = shift(spanOf(html, elements[last.n]!).to);
  }
  const out = rest.slice(0, at) + block + rest.slice(at);
  return changed(files, { [page]: out }, null, findAt(out, at + (el.start - from)));
}

/** Adds Studio kit Pro's stylesheet and script beside the core kit's, for a Pro section. */
function withProKit(html: string): string {
  let out = html.replace(/(<link[^>]*kit\/studio\/v\d+\/studio\.css[^>]*>)/, `$1\n    <link rel="stylesheet" href="${STUDIO_KIT_PRO_CSS}" />`);
  out = out.replace(/(<script[^>]*kit\/studio\/v\d+\/studio\.js[^>]*><\/script>)/, `$1\n    <script type="module" src="${STUDIO_KIT_PRO_JS}"></script>`);
  return out;
}

const LOOK_IDS: readonly string[] = [...LIGHT_LOOKS, ...DARK_LOOKS];

/** Sets custom properties in a stylesheet's top-level :root rule, leaving its comments and other declarations as they are. */
export function upsertCustomProps(css: string, props: readonly [string, string][]): string {
  const re = /(?<=^|[};]|\*\/)(\s*):root\s*\{/g;
  let open = -1;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (depthAt(css, m.index + m[1]!.length) === 0) {
      open = m.index + m[0].length;
      break;
    }
  }
  if (open < 0) {
    const block = `:root {\n${props.map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}\n`;
    return `${css}${css.length === 0 || css.endsWith("\n\n") ? "" : css.endsWith("\n") ? "\n" : "\n\n"}${block}`;
  }
  const close = css.indexOf("}", open);
  let body = css.slice(open, close);
  for (const [k, v] of props) {
    const decl = new RegExp(`(^|[;{\\s])(${escapeRe(k)}\\s*:\\s*)([^;]*)(;?)`, "m");
    if (decl.test(body)) body = body.replace(decl, (_m, pre: string, name: string, _old: string, semi: string) => `${pre}${name}${v}${semi || ";"}`);
    else body = `${body.replace(/\s*$/, "")}\n  ${k}: ${v};\n`;
  }
  return css.slice(0, open) + body + css.slice(close);
}

/** The colour tokens a kit look sets; a site's own values for these hide the look. */
const LOOK_COLOURS = ["--accent", "--accent-2", "--on-accent", "--ink", "--ink-2", "--paper", "--paper-2", "--line"] as const;

/** Takes custom properties out of a stylesheet's top-level :root rule, leaving its comments and other declarations. */
export function removeCustomProps(css: string, keys: readonly string[]): string {
  const m = /(?<=^|[};]|\*\/)(\s*):root\s*\{/.exec(css);
  if (!m || depthAt(css, m.index + m[1]!.length) !== 0) return css;
  const open = m.index + m[0].length;
  const close = css.indexOf("}", open);
  let body = css.slice(open, close);
  for (const k of keys) body = body.replace(new RegExp(`\\n?[ \\t]*${escapeRe(k)}\\s*:[^;{}]*;?`, "g"), "");
  return css.slice(0, open) + body + css.slice(close);
}

function themeEdit(files: Readonly<Record<string, string>>, edit: Extract<VisualEdit, { kind: "theme" }>): EditResult {
  const pages = Object.keys(files).filter((p) => /\.html?$/i.test(p));
  if (!usesStudioKit(pages.map((p) => ({ path: p, content: files[p]! })))) {
    return { ok: false, reason: "Theme controls work on sites built on the Farbaek Studio kit. Upgrade its design first." };
  }
  if (edit.look !== undefined && !LOOK_IDS.includes(edit.look)) return { ok: false, reason: "That isn't one of the kit's looks." };
  const props: [string, string][] = [];
  for (const [token, value] of Object.entries(edit.tokens ?? {})) {
    if (!Object.hasOwn(THEME_TOKENS, token)) return { ok: false, reason: "That isn't one of the colours Studio can set." };
    const v = String(value).trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(v)) return { ok: false, reason: "Colours are written as six-digit hex, such as #1f4bff." };
    props.push([`--${token}`, v]);
  }
  let fontsLink: string | null = null;
  if (edit.fonts !== undefined) {
    if (!Object.hasOwn(FONT_PAIRS, edit.fonts)) return { ok: false, reason: "That isn't one of the font pairings Studio offers." };
    const pair = FONT_PAIRS[edit.fonts as FontPairId];
    props.push(["--font-display", fontStack(pair.display, pair.serif)], ["--font-body", fontStack(pair.body, false)]);
    fontsLink = fontsHref(edit.fonts as FontPairId);
  }
  if (edit.corners !== undefined) {
    if (!Object.hasOwn(CORNERS, edit.corners)) return { ok: false, reason: "That isn't one of the corner styles." };
    const c = CORNERS[edit.corners as CornerId];
    props.push(["--radius", c.radius], ["--radius-lg", c.large]);
  }
  if (edit.look === undefined && props.length === 0) return { ok: false, reason: "Choose a look, a colour, fonts or corners first." };

  const next: Record<string, string> = {};
  let sheet: string | null = null;
  for (const page of pages) {
    let out = files[page]!;
    const root = scanElements(out).find((e) => e.tag === "html");
    if (edit.look !== undefined && root) out = setAttribute(out, root, "data-fs-look", edit.look);
    if (fontsLink) {
      const link = scanElements(out).find((e) => e.tag === "link" && /^https:\/\/fonts\.googleapis\.com\/css2?\?/.test(attrValue(e, "href") ?? ""));
      if (link) out = setAttribute(out, link, "href", fontsLink);
      else {
        const kit = scanElements(out).find((e) => e.tag === "link" && /kit\/studio\/v\d+\/studio\.css/.test(attrValue(e, "href") ?? ""));
        const at = kit ? kit.start : (scanElements(out).find((e) => e.tag === "head")?.close?.start ?? 0);
        out = `${out.slice(0, at)}<link rel="stylesheet" href="${escapeAttr(fontsLink)}" />\n    ${out.slice(at)}`;
      }
    }
    sheet ??=
      scanElements(out)
        .filter((e) => e.tag === "link" && /(^|\s)stylesheet(\s|$)/i.test(attrValue(e, "rel") ?? ""))
        .map((e) => resolveSitePath(page, attrValue(e, "href") ?? ""))
        .find((p): p is string => p !== null && files[p] !== undefined) ?? null;
    if (out !== files[page]) next[page] = out;
  }
  // A new look brings its own colours: the site's own colour overrides in :root would hide it, so they go (Undo brings them back).
  if (edit.look !== undefined && edit.tokens === undefined && sheet) next[sheet] = removeCustomProps(next[sheet] ?? files[sheet]!, LOOK_COLOURS);
  if (props.length > 0) {
    if (sheet) next[sheet] = upsertCustomProps(next[sheet] ?? files[sheet]!, props);
    else {
      const index = pages.includes("index.html") ? "index.html" : pages[0]!;
      next[index] = upsertStyleBlock(next[index] ?? files[index]!, ":root", props);
    }
  }
  return changed(files, next);
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
/** From the editor: the page's sections in order, with their names, so the preview can draw the section toolbar (ADR 0159). */
export const DESIGN_SECTIONS_MESSAGE = "farbaek-design-sections";
/** From the editor: a look and colours to show live, before they're applied. An empty one clears the preview. */
export const DESIGN_THEME_MESSAGE = "farbaek-design-theme";
/** From the preview: a section toolbar action (move, duplicate, remove). The editor turns it into an edit; the frame edits nothing. */
export const DESIGN_ACTION_MESSAGE = "farbaek-design-action";

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

const svg = (d: string) => `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TOOL_ICONS = {
  drag: svg('<circle cx="6.5" cy="4.5" r=".9"/><circle cx="11.5" cy="4.5" r=".9"/><circle cx="6.5" cy="9" r=".9"/><circle cx="11.5" cy="9" r=".9"/><circle cx="6.5" cy="13.5" r=".9"/><circle cx="11.5" cy="13.5" r=".9"/>'),
  up: svg('<path d="M9 14.5v-11M4.5 8 9 3.5 13.5 8"/>'),
  down: svg('<path d="M9 3.5v11M4.5 10 9 14.5 13.5 10"/>'),
  duplicate: svg('<rect x="6" y="6" width="9" height="9" rx="2"/><path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-6A1.5 1.5 0 0 0 3 4.5v6A1.5 1.5 0 0 0 4.5 12H6"/>'),
  remove: svg('<path d="M3.5 5h11M7 5V3.5h4V5M5 5l.7 9.5h6.6L13 5M7.5 8v4M10.5 8v4"/>'),
};
const tool = (a: keyof typeof TOOL_ICONS, label: string) => `<button type="button" data-a="${a}" aria-label="${label}" title="${label}">${TOOL_ICONS[a]}</button>`;
const TOOLBAR = `${tool("drag", "Drag to move this section")}<span></span>${tool("up", "Move up")}${tool("down", "Move down")}${tool("duplicate", "Duplicate")}${tool("remove", "Delete")}`;

/**
 * Runs inside the locked-down preview frame in design mode. It outlines the
 * element under the pointer, and on a click or tap reports the numbered
 * element instead of following links or submitting forms (Alt+click picks the
 * whole section). Over the picked element's section it draws a toolbar to
 * drag, move, duplicate or delete the section, which only reports the action:
 * the editor turns it into an edit of the source. The editor can select an
 * element, tell it the sections, and preview a look and colours live. It
 * reaches nothing but its parent.
 */
export const DESIGN_SCRIPT = `<style>[${DESIGN_ATTR}-hover]{outline:2px dashed rgba(37,99,235,.7)!important;outline-offset:2px!important;cursor:pointer!important}[${DESIGN_ATTR}-picked]{outline:2px solid rgb(37,99,235)!important;outline-offset:2px!important}[${DESIGN_ATTR}-section]{outline:2px solid rgba(37,99,235,.55)!important;outline-offset:-2px!important}[data-fbk-ui]{position:fixed;z-index:2147483646;display:none;align-items:center;gap:2px;padding:4px;border-radius:999px;background:#111318;color:#fff;box-shadow:0 12px 32px -12px rgba(0,0,0,.5);font:500 13px/1 system-ui,-apple-system,sans-serif;max-width:calc(100vw - 16px)}[data-fbk-ui] button{display:grid;place-items:center;width:44px;height:44px;margin:0;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}[data-fbk-ui] button:hover,[data-fbk-ui] button:focus-visible{background:rgba(255,255,255,.16);outline:none}[data-fbk-ui] [data-a=drag]{cursor:grab;touch-action:none}[data-fbk-ui] span{max-width:150px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 8px 0 2px;opacity:.85}[data-fbk-line]{position:fixed;z-index:2147483645;height:4px;border-radius:4px;background:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.22);pointer-events:none;display:none}</style><script>(function(){var A="${DESIGN_ATTR}",hover=null,picked=null,names={},order=[],bar=null,nameEl=null,line=null,target=null,drag=null,themed=[];function el(t){return t&&t.closest?t.closest("body ["+A+"]"):null}function inUi(t){return!!(t&&t.closest&&t.closest("[data-fbk-ui]"))}function num(e){return Number(e.getAttribute(A))}function node(n){return document.querySelector("["+A+'="'+n+'"]')}function sectionOf(e){for(var x=e;x&&x.nodeType===1;x=x.parentElement){if(x.hasAttribute(A)&&names.hasOwnProperty(num(x)))return x}return null}function send(m){parent.postMessage(m,"*")}function report(e){if(picked)picked.removeAttribute(A+"-picked");picked=e;e.setAttribute(A+"-picked","");var s=getComputedStyle(e),p=s.paddingTop===s.paddingRight&&s.paddingTop===s.paddingBottom&&s.paddingTop===s.paddingLeft?s.paddingTop:"";send({type:"${DESIGN_PICK_MESSAGE}",n:num(e),style:{color:s.color,backgroundColor:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,textAlign:s.textAlign,padding:p,borderRadius:s.borderTopLeftRadius}});show(sectionOf(e))}function make(){bar=document.createElement("div");bar.setAttribute("data-fbk-ui","");bar.setAttribute("role","toolbar");bar.setAttribute("aria-label","Section");bar.innerHTML=${JSON.stringify(TOOLBAR)};nameEl=bar.querySelector("span");document.body.appendChild(bar);line=document.createElement("div");line.setAttribute("data-fbk-line","");document.body.appendChild(line);bar.addEventListener("click",function(ev){var b=ev.target.closest("button");ev.preventDefault();ev.stopPropagation();if(!b||!target)return;var a=b.getAttribute("data-a"),n=num(target),i=order.indexOf(n);if(a==="drag"||i<0)return;if(a==="up"){if(i>0)send({type:"${DESIGN_ACTION_MESSAGE}",action:"move",n:n,before:order[i-1]});return}if(a==="down"){if(i<order.length-1)send({type:"${DESIGN_ACTION_MESSAGE}",action:"move",n:n,before:i+2<order.length?order[i+2]:null});return}send({type:"${DESIGN_ACTION_MESSAGE}",action:a,n:n})});bar.querySelector('[data-a="drag"]').addEventListener("pointerdown",start)}function show(s){if(target)target.removeAttribute(A+"-section");target=s;if(!bar)make();if(!s){bar.style.display="none";return}if(s!==picked)s.setAttribute(A+"-section","");nameEl.textContent=names[num(s)]||"Section";bar.style.display="flex";place()}function place(){if(!target||!bar||bar.style.display==="none")return;var r=target.getBoundingClientRect(),h=bar.offsetHeight,w=bar.offsetWidth,top=Math.min(Math.max(r.top+10,8),r.bottom-h-10);bar.style.visibility=r.bottom<h+16||r.top>innerHeight-h?"hidden":"visible";bar.style.top=Math.max(8,Math.min(top,innerHeight-h-8))+"px";bar.style.left=Math.max(8,Math.min(r.left+10,innerWidth-w-8))+"px"}function start(ev){if(!target)return;ev.preventDefault();drag={n:num(target),before:undefined};try{ev.currentTarget.setPointerCapture(ev.pointerId)}catch(x){}document.addEventListener("pointermove",dragMove);document.addEventListener("pointerup",dragEnd);document.addEventListener("pointercancel",dragEnd)}function dragMove(ev){if(!drag)return;var y=ev.clientY;if(y<56)scrollBy(0,-16);else if(y>innerHeight-56)scrollBy(0,16);var best=null,dist=1e9,before=null,box=null;for(var i=0;i<=order.length;i++){var e=node(order[Math.min(i,order.length-1)]);if(!e)continue;var r=e.getBoundingClientRect();box=box||r;var g=i<order.length?r.top:r.bottom,d=Math.abs(g-y);if(d<dist){dist=d;best=g;before=i<order.length?order[i]:null}}if(best===null)return;drag.before=before;line.style.display="block";line.style.top=best-2+"px";line.style.left=box.left+"px";line.style.width=box.width+"px"}function dragEnd(){document.removeEventListener("pointermove",dragMove);document.removeEventListener("pointerup",dragEnd);document.removeEventListener("pointercancel",dragEnd);if(line)line.style.display="none";var d=drag;drag=null;if(!d||d.before===undefined||d.before===d.n)return;var i=order.indexOf(d.n),j=d.before===null?order.length:order.indexOf(d.before);if(i<0||j<0||j===i||j===i+1)return;send({type:"${DESIGN_ACTION_MESSAGE}",action:"move",n:d.n,before:d.before})}window.addEventListener("mouseover",function(ev){if(inUi(ev.target))return;var e=el(ev.target);if(hover&&hover!==e)hover.removeAttribute(A+"-hover");hover=e;if(e)e.setAttribute(A+"-hover","")},true);window.addEventListener("click",function(ev){if(inUi(ev.target))return;var e=el(ev.target);ev.preventDefault();ev.stopImmediatePropagation();if(e&&ev.altKey){var s=sectionOf(e);if(s)e=s}if(e)report(e)},true);window.addEventListener("submit",function(ev){ev.preventDefault();ev.stopImmediatePropagation()},true);addEventListener("scroll",place,{passive:true});addEventListener("resize",place);window.addEventListener("message",function(ev){if(ev.source!==parent)return;var d=ev.data;if(!d||typeof d.type!=="string")return;if(d.type==="${DESIGN_SELECT_MESSAGE}"&&typeof d.n==="number"){var e=node(d.n);if(e){report(e);if(e.scrollIntoView)e.scrollIntoView({block:"nearest"})}}else if(d.type==="${DESIGN_SECTIONS_MESSAGE}"&&Array.isArray(d.items)){names={};order=[];d.items.forEach(function(it){if(Array.isArray(it)&&typeof it[0]==="number"&&typeof it[1]==="string"){names[it[0]]=it[1].slice(0,80);order.push(it[0])}});if(picked)show(sectionOf(picked))}else if(d.type==="${DESIGN_THEME_MESSAGE}"){var root=document.documentElement;themed.forEach(function(k){root.style.removeProperty(k)});themed=[];if(typeof d.look==="string"&&/^[a-z]{2,20}$/.test(d.look))root.setAttribute("data-fs-look",d.look);var v=d.vars||{};Object.keys(v).forEach(function(k){if(/^--[a-z0-9-]{2,30}$/.test(k)&&typeof v[k]==="string"&&/^(#[0-9a-f]{6}|\\d{1,3}px)$/i.test(v[k])){root.style.setProperty(k,v[k]);themed.push(k)}});place()}})})();</script>`;

/** "rgb(17, 24, 39)" as "#111827"; null for transparent or anything else. */
export function cssColorToHex(value: string): string | null {
  const m = value.trim().match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (!m) return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
  if (m[4] !== undefined && Number.parseFloat(m[4]) === 0) return null;
  return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("")}`;
}

/** The site's current theme as Studio's Theme panel shows it: the look on index.html and the :root values in its stylesheet. */
export function readTheme(files: Readonly<Record<string, string>>): { look: string | null; tokens: Partial<Record<ThemeToken, string>>; fonts: FontPairId | null; corners: CornerId | null } {
  const pages = Object.keys(files).filter((p) => /\.html?$/i.test(p));
  const page = pages.includes("index.html") ? "index.html" : pages[0];
  if (!page) return { look: null, tokens: {}, fonts: null, corners: null };
  const els = scanElements(files[page]!);
  const look = attrValue(els.find((e) => e.tag === "html") ?? ({ attrs: [] } as unknown as SourceElement), "data-fs-look");
  const sheet = els
    .filter((e) => e.tag === "link" && /(^|\s)stylesheet(\s|$)/i.test(attrValue(e, "rel") ?? ""))
    .map((e) => resolveSitePath(page, attrValue(e, "href") ?? ""))
    .find((p): p is string => p !== null && files[p] !== undefined);
  const css = (sheet ? files[sheet]! : "").replace(/\/\*[\s\S]*?\*\//g, "");
  const root = /(?:^|[};])\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const prop = (k: string) => new RegExp(`--${escapeRe(k)}\s*:\s*([^;]+);?`).exec(root)?.[1]?.trim() ?? null;
  const tokens: Partial<Record<ThemeToken, string>> = {};
  for (const t of Object.keys(THEME_TOKENS) as ThemeToken[]) {
    const v = prop(t)?.toLowerCase();
    if (v && /^#[0-9a-f]{6}$/.test(v)) tokens[t] = v;
  }
  const display = prop("font-display") ?? "";
  const fonts = (Object.keys(FONT_PAIRS) as FontPairId[]).find((id) => display.startsWith(`"${FONT_PAIRS[id].display}"`) && (prop("font-body") ?? "").startsWith(`"${FONT_PAIRS[id].body}"`)) ?? null;
  const corners = (Object.keys(CORNERS) as CornerId[]).find((id) => prop("radius") === CORNERS[id].radius) ?? null;
  return { look, tokens, fonts, corners };
}

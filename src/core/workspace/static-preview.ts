/**
 * Instant previews of static sites without a preview domain (ADR 0027).
 * A page and the stylesheets and scripts it links are folded into one
 * document for an `<iframe sandbox="allow-scripts" srcdoc>`. Without
 * allow-same-origin the frame has an opaque origin, so its code can't reach
 * Farbaek's cookies, storage or pages, and the CSP below blocks every
 * network request it might make (connect, forms, frames). Links to the
 * site's other pages are passed to the parent, which switches the page.
 */

import { MEDIA_ORIGIN } from "@/core/media/library";

export const PREVIEW_NAV_MESSAGE = "farbaek-preview-nav";

/** Where Farbaek Scenes (Farbaek's own 3D kit) and the media library are served (ADR 0156). */
const KIT_ORIGIN = MEDIA_ORIGIN;

/** The policy every static preview runs under: in the document's meta tag, and as the header of the preview frame (ADR 0169). */
export const STATIC_PREVIEW_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https:",
  // Inline code, pinned libraries (three.js, animation libraries) from the CDNs the Studio standard names (ADR 0030), and Farbaek Scenes (ADR 0156).
  `script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com ${KIT_ORIGIN}`,
  `img-src data: blob: https: ${KIT_ORIGIN}`,
  "font-src data: https:",
  `media-src data: https: ${KIT_ORIGIN}`,
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

// Runs inside the preview: same-site page links switch pages through the parent; nothing navigates away.
// A link within the page scrolls here. Left to the browser, it resolves against the frame's own address, because a
// srcdoc document has no address of its own, and that navigation is refused and blanks the preview (ADR 0178).
const NAV_SCRIPT = `<script>(function(){document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;var h=a.getAttribute("href")||"";e.preventDefault();if(h.charAt(0)==="#"){var id=h.slice(1);try{id=decodeURIComponent(id);}catch(x){}var t=id?document.getElementById(id)||document.getElementsByName(id)[0]:null;if(t)t.scrollIntoView();else if(!id||id.toLowerCase()==="top")scrollTo(0,0);return;}if(!/^[a-z][a-z0-9+.-]*:/i.test(h)&&!h.startsWith("//")){parent.postMessage({type:"${PREVIEW_NAV_MESSAGE}",href:h},"*");}},true);document.addEventListener("submit",function(e){e.preventDefault();},true);})();</script>`;

/** A link from `fromPage` to `href`, as a project path, or null when it leaves the project. */
export function resolveSitePath(fromPage: string, href: string): string | null {
  const clean = href.split(/[?#]/)[0]!.trim();
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//")) return null;
  const base = clean.startsWith("/") ? [] : fromPage.split("/").slice(0, -1);
  const parts = [...base];
  for (const seg of clean.replace(/^\/+/, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  const path = parts.join("/");
  return path === "" ? "index.html" : path.endsWith("/") ? `${path}index.html` : path;
}

/** The site's pages, index first. */
export function sitePages(files: Readonly<Record<string, string>>): string[] {
  return Object.keys(files)
    .filter((p) => /\.html?$/i.test(p))
    .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
}

const escapeClosing = (code: string, tag: "style" | "script") => code.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);

/** CSS `url(...)` references to the project's images, as data URLs, resolved from the stylesheet's own path (ADR 0108). */
function inlineCssImages(css: string, fromPath: string, images: Readonly<Record<string, string>>): string {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, quote: string, ref: string) => {
    const target = resolveSitePath(fromPath, ref);
    return target && images[target] ? `url(${quote}${images[target]}${quote})` : whole;
  });
}

/** HTML attributes that point at the project's images (src, href, poster, srcset), as data URLs (ADR 0108). */
function inlineHtmlImages(html: string, page: string, images: Readonly<Record<string, string>>): string {
  const one = (ref: string) => {
    const target = resolveSitePath(page, ref);
    return target && images[target] ? images[target] : null;
  };
  let out = html.replace(/(\s(?:src|href|poster)\s*=\s*)(["'])([^"']+)\2/gi, (whole, attr: string, quote: string, ref: string) => {
    const data = one(ref);
    return data ? `${attr}${quote}${data}${quote}` : whole;
  });
  out = out.replace(/(\ssrcset\s*=\s*)(["'])([^"']+)\2/gi, (whole, attr: string, quote: string, value: string) => {
    const parts = value.split(",").map((part) => {
      const [ref = "", ...rest] = part.trim().split(/\s+/);
      const data = one(ref);
      return data ? [data, ...rest].join(" ") : part.trim();
    });
    return `${attr}${quote}${parts.join(", ")}${quote}`;
  });
  return inlineCssImages(out, page, images);
}

/**
 * One self-contained document for `page`, or null when the page doesn't
 * exist. `images` maps the project's image paths to data URLs, so pictures
 * the site links by path show in the frame, which has no network (ADR 0108).
 */
export function buildStaticSrcdoc(files: Readonly<Record<string, string>>, page = "index.html", images: Readonly<Record<string, string>> = {}): string | null {
  const html = files[page];
  if (html === undefined) return null;
  const hasImages = Object.keys(images).length > 0;

  let doc = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const target = href ? resolveSitePath(page, href) : null;
    if (target && files[target] !== undefined) return `<style>${escapeClosing(hasImages ? inlineCssImages(files[target]!, target, images) : files[target]!, "style")}</style>`;
    return tag;
  });
  doc = doc.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (whole, before: string, src: string, after: string) => {
    const target = resolveSitePath(page, src);
    if (target && files[target] !== undefined) return `<script${before}${after}>${escapeClosing(files[target]!, "script")}</script>`;
    return whole;
  });

  if (hasImages) doc = inlineHtmlImages(doc, page, images);

  const head = `<meta http-equiv="Content-Security-Policy" content="${STATIC_PREVIEW_CSP}"><meta name="referrer" content="no-referrer">${NAV_SCRIPT}`;
  // The policy goes first, right after the doctype, before anything the page itself says: a "<head>" inside a
  // comment, or a script before the head, can't come ahead of it. The parser puts it in the head it opens,
  // and the page's own <html> and <head> tags merge into those.
  const doctype = /^﻿?\s*(?:<!--[\s\S]*?-->\s*)*<!doctype\b[^>]*>/i.exec(doc);
  if (doctype) return `${doctype[0]}${head}${doc.slice(doctype[0].length)}`;
  return `<!doctype html>${head}${doc}`;
}

/** The project's files with a proposal's changes laid over them: what the site looks like if the change is applied. */
/**
 * A folded document for a picture (project cards, template thumbnails), with
 * its scripts taken out. The picture's frame runs no scripts anyway
 * (`sandbox=""` is the boundary); without them the browser has nothing to
 * refuse, so the console stays quiet.
 */
export function pictureSrcdoc(srcdoc: string): string {
  return srcdoc.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "").replace(/<script\b[^>]*\/>/gi, "");
}

export function overlayChanges(files: Readonly<Record<string, string>>, changes: readonly { path: string; content: string | null }[]): Record<string, string> {
  const out: Record<string, string> = { ...files };
  for (const c of changes) {
    if (c.content === null) delete out[c.path];
    else out[c.path] = c.content;
  }
  return out;
}

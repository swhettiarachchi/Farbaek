/**
 * Instant previews of static sites without a preview domain (ADR 0027).
 * A page and the stylesheets and scripts it links are folded into one
 * document for an `<iframe sandbox="allow-scripts" srcdoc>`. Without
 * allow-same-origin the frame has an opaque origin, so its code can't reach
 * Farbaek's cookies, storage or pages, and the CSP below blocks every
 * network request it might make (connect, forms, frames). Links to the
 * site's other pages are passed to the parent, which switches the page.
 */

export const PREVIEW_NAV_MESSAGE = "farbaek-preview-nav";

const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https:",
  "script-src 'unsafe-inline'",
  "img-src data: https:",
  "font-src data: https:",
  "media-src data: https:",
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

// Runs inside the preview: same-site page links switch pages through the parent; nothing navigates away.
const NAV_SCRIPT = `<script>(function(){document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;var h=a.getAttribute("href")||"";if(h.charAt(0)==="#")return;e.preventDefault();if(!/^[a-z][a-z0-9+.-]*:/i.test(h)&&!h.startsWith("//")){parent.postMessage({type:"${PREVIEW_NAV_MESSAGE}",href:h},"*");}},true);document.addEventListener("submit",function(e){e.preventDefault();},true);})();</script>`;

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

/** One self-contained document for `page`, or null when the page doesn't exist. */
export function buildStaticSrcdoc(files: Readonly<Record<string, string>>, page = "index.html"): string | null {
  const html = files[page];
  if (html === undefined) return null;

  let doc = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const target = href ? resolveSitePath(page, href) : null;
    if (target && files[target] !== undefined) return `<style>${escapeClosing(files[target]!, "style")}</style>`;
    return tag;
  });
  doc = doc.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (whole, before: string, src: string, after: string) => {
    const target = resolveSitePath(page, src);
    if (target && files[target] !== undefined) return `<script${before}${after}>${escapeClosing(files[target]!, "script")}</script>`;
    return whole;
  });

  const head = `<meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="referrer" content="no-referrer">${NAV_SCRIPT}`;
  if (/<head\b[^>]*>/i.test(doc)) return doc.replace(/<head\b[^>]*>/i, (m) => `${m}${head}`);
  if (/<html\b[^>]*>/i.test(doc)) return doc.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${doc}</body></html>`;
}

/** The project's files with a proposal's changes laid over them: what the site looks like if the change is applied. */
export function overlayChanges(files: Readonly<Record<string, string>>, changes: readonly { path: string; content: string | null }[]): Record<string, string> {
  const out: Record<string, string> = { ...files };
  for (const c of changes) {
    if (c.content === null) delete out[c.path];
    else out[c.path] = c.content;
  }
  return out;
}

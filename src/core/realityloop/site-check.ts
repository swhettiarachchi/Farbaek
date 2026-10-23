/**
 * Farbaek's site check (ADR 0054): the check a static site can list in its
 * plan as `farbaek check-site`. A plain HTML site usually has no tests, so its
 * plan listed no checks and its change could never be verified. This one
 * looks at what a visitor would hit:
 *   - an index.html;
 *   - on every page: a doctype, a language, a title and a mobile viewport;
 *   - every local link, script, stylesheet, image and CSS url() resolving to
 *     a file in the project, by the same rules Farbaek Sites serves them;
 *   - alt text on images;
 *   - no insecure http:// scripts, styles or images.
 *
 * It runs in the sandbox like any other check, against exactly the applied
 * files. `checkSite` is self-contained (no imports or outer references):
 * scripts/site-check-script.mjs turns its own source into the script the
 * sandbox runs (site-check-script.ts), and a test keeps the two in step.
 */

/** What a person sees and approves in the plan. */
export const SITE_CHECK_COMMAND = "farbaek check-site";
/** Where the script is written in the sandbox: outside the project's own folders. */
export const SITE_CHECK_PATH = ".farbaek-checks/check-site.mjs";

export interface SiteCheckResult {
  pages: number;
  problems: string[];
}

/** Checks a static site. `paths` is every file in the project; `read` returns a text file's content. */
export function checkSite(paths: readonly string[], read: (path: string) => string | null): SiteCheckResult {
  const files = new Set(paths);
  const problems: string[] = [];
  const pages = paths.filter((p) => /\.html?$/i.test(p) && !p.split("/").some((s) => s.startsWith(".") || s === "node_modules")).sort();

  /** A reference from `from` as the project paths that could serve it, or null when it leaves the site. */
  function candidates(from: string, ref: string): string[] | null {
    const clean = ref.trim().split("#")[0]!.split("?")[0]!;
    if (clean === "") return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//")) return null;
    let decoded = clean;
    try {
      decoded = decodeURIComponent(clean);
    } catch {
      return [];
    }
    const parts = decoded.startsWith("/") ? [] : from.split("/").slice(0, -1);
    for (const seg of decoded.replace(/^\/+/, "").split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") {
        if (parts.length === 0) return [];
        parts.pop();
      } else parts.push(seg);
    }
    const p = parts.join("/");
    if (p === "" || decoded.endsWith("/")) return [p === "" ? "index.html" : `${p}/index.html`];
    const last = parts[parts.length - 1] ?? "";
    return last.includes(".") ? [p] : [p, `${p}.html`, `${p}/index.html`];
  }

  function checkRef(from: string, ref: string, what: string) {
    const c = candidates(from, ref);
    if (c === null) return;
    if (!c.some((x) => files.has(x))) problems.push(`${from}: ${what} "${ref}" isn't in the project.`);
  }

  if (!files.has("index.html")) problems.push("There's no index.html, the page people see first.");

  for (const page of pages) {
    const html = read(page) ?? "";
    if (!/^\s*(<!--[\s\S]*?-->\s*)*<!doctype html/i.test(html)) problems.push(`${page}: it doesn't start with <!doctype html>.`);
    if (!/<html\b[^>]*\blang\s*=\s*["']?[a-z]/i.test(html)) problems.push(`${page}: <html> has no lang, so screen readers can't tell the language.`);
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (!title || title[1]!.trim() === "") problems.push(`${page}: it has no title.`);
    if (!/<meta\b[^>]*name\s*=\s*["']?viewport/i.test(html)) problems.push(`${page}: it has no viewport tag, so phones show it zoomed out.`);

    // Comments and inline scripts aren't markup to check.
    const markup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (m) => m.replace(/>[\s\S]*<\/script/i, "></script"));
    for (const tag of markup.match(/<(a|link|script|img|source|iframe|video|audio)\b[^>]*>/gi) ?? []) {
      const name = /^<([a-z]+)/i.exec(tag)![1]!.toLowerCase();
      const attr = (n: string) => {
        const m = new RegExp(`\\s${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
        return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
      };
      if (name === "a") {
        const href = attr("href");
        if (href !== null && !href.startsWith("#")) checkRef(page, href, "the link to");
        continue;
      }
      if (name === "link") {
        const rel = (attr("rel") ?? "").toLowerCase();
        const href = attr("href");
        if (href === null || !/\b(stylesheet|icon|preload|manifest|apple-touch-icon)\b/.test(rel)) continue;
        if (/^http:\/\//i.test(href)) problems.push(`${page}: "${href}" loads over insecure http.`);
        else checkRef(page, href, rel.includes("stylesheet") ? "the stylesheet" : "the file");
        continue;
      }
      const src = attr("src");
      if (name === "img" && attr("alt") === null) problems.push(`${page}: an image${src ? ` ("${src}")` : ""} has no alt text.`);
      if (src === null || src.startsWith("data:")) continue;
      if (/^http:\/\//i.test(src)) problems.push(`${page}: "${src}" loads over insecure http.`);
      else checkRef(page, src, name === "script" ? "the script" : "the file");
    }
  }

  // Stylesheets: url(...) references to fonts and images.
  for (const sheet of paths.filter((p) => /\.css$/i.test(p) && !p.split("/").some((s) => s.startsWith(".") || s === "node_modules")).sort()) {
    const css = (read(sheet) ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
      const ref = m[1] ?? m[2] ?? m[3] ?? "";
      if (ref === "" || ref.startsWith("data:") || ref.startsWith("#")) continue;
      if (/^http:\/\//i.test(ref)) problems.push(`${sheet}: "${ref}" loads over insecure http.`);
      else checkRef(sheet, ref, "the file");
    }
  }

  return { pages: pages.length, problems };
}

/** A static site: an index.html and nothing to install or run. The site check fits it. */
export function isStaticSite(paths: readonly string[]): boolean {
  return paths.includes("index.html") && !paths.includes("package.json") && !paths.includes("requirements.txt") && !paths.includes("pyproject.toml");
}

/**
 * The checks a verification runs: the plan's own, or, when it lists none and
 * the project is a static site, Farbaek's site check, so a plain site's change
 * can still be verified. Anything else with no checks has none to run.
 */
export function checksToRun(planChecks: readonly string[], paths: readonly string[]): string[] {
  if (planChecks.length > 0) return [...planChecks];
  return isStaticSite(paths) ? [SITE_CHECK_COMMAND] : [];
}

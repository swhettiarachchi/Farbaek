/**
 * The agent's self-check before it finishes a site (ADR 0030, the Studio
 * standard's "check before you finish"): mechanical checks over the
 * project's HTML, CSS and JavaScript that catch what a careful reviewer
 * would. Broken links, missing basics, motion without a reduced-motion
 * fallback, invisible focus, em dashes and leftover placeholders. It reads
 * files only; it never runs the site.
 */

export interface SiteFinding {
  severity: "fix" | "consider";
  file: string;
  message: string;
}

export interface SiteReview {
  pages: number;
  findings: SiteFinding[];
}

const MAX_FINDINGS = 60;

/** Visible text: tags, scripts, styles and comments removed. */
function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function resolve(from: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return null;
  const clean = href.split("#")[0]!.split("?")[0]!;
  if (!clean) return null;
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const parts: string[] = [];
  for (const seg of (clean.startsWith("/") ? clean.slice(1) : base + clean).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Whether a link to `target` lands on a file, as a static host would serve it. */
function exists(files: ReadonlyMap<string, string>, target: string): boolean {
  if (target === "") return files.has("index.html");
  return [target, `${target}.html`, `${target}/index.html`, target.endsWith("/") ? `${target}index.html` : ""].some((p) => p && files.has(p));
}

export function reviewSite(input: Record<string, string> | ReadonlyMap<string, string>): SiteReview {
  const files = input instanceof Map ? (input as ReadonlyMap<string, string>) : new Map(Object.entries(input));
  const findings: SiteFinding[] = [];
  const add = (severity: SiteFinding["severity"], file: string, message: string) => {
    if (findings.length < MAX_FINDINGS) findings.push({ severity, file, message });
  };
  const pages = [...files.keys()].filter((p) => /\.html?$/i.test(p));
  const css = [...files].filter(([p]) => p.endsWith(".css"));
  const js = [...files].filter(([p]) => /\.m?js$/.test(p));
  const allStyles = [...css.map(([, c]) => c), ...pages.map((p) => [...files.get(p)!.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n"))].join("\n");
  const allScripts = [...js.map(([, c]) => c), ...pages.map((p) => [...files.get(p)!.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n"))].join("\n");

  for (const page of pages) {
    const html = files.get(page)!;
    if (!/<html\b[^>]*\slang\s*=\s*["']?[a-z]/i.test(html)) add("fix", page, "The <html> element has no lang attribute.");
    if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html)) add("fix", page, "There's no viewport meta tag, so phones will show a zoomed-out page.");
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
    if (!title) add("fix", page, "The page has no <title>.");
    if (!/<meta\b[^>]*name\s*=\s*["']description["']/i.test(html)) add("consider", page, "There's no meta description for search results and link previews.");

    const ids = new Set([...html.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!));
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      if (attr(m[0], "alt") === null) add("fix", page, `An image has no alt text: ${m[0].slice(0, 80)}`);
    }
    for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = attr(m[0], "href");
      const label = m[1]!.replace(/<[^>]+>/g, "").trim() || attr(m[0], "aria-label") || (/<img\b[^>]*alt\s*=\s*["'][^"']+/i.test(m[1]!) ? "img" : "");
      if (!label) add("fix", page, `A link has no text or aria-label${href ? ` (href="${href}")` : ""}.`);
      if (!href) continue;
      if (href.startsWith("#")) {
        if (href.length > 1 && !ids.has(decodeURIComponent(href.slice(1)))) add("fix", page, `The link to ${href} has no matching id on the page.`);
        continue;
      }
      const target = resolve(page, href);
      if (target !== null && !exists(files, target)) add("fix", page, `The link to ${href} points at a file that isn't in the project.`);
    }
    for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)) {
      if (!m[1]!.replace(/<[^>]+>/g, "").trim() && !attr(m[0], "aria-label")) add("fix", page, "A button has no text or aria-label.");
    }
    for (const m of html.matchAll(/<(?:link|script)\b[^>]*>/gi)) {
      const ref = attr(m[0], "href") ?? attr(m[0], "src");
      if (!ref) continue;
      const target = resolve(page, ref);
      if (target !== null && !files.has(target)) add("fix", page, `${ref} is referenced but isn't in the project.`);
    }
    for (const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
      if (/type\s*=\s*["']?(hidden|submit|button|reset)/i.test(m[0])) continue;
      const id = attr(m[0], "id");
      // A control inside an open <label> is labelled by it.
      const before = html.slice(0, m.index);
      const wrapped = before.toLowerCase().lastIndexOf("<label") > before.toLowerCase().lastIndexOf("</label");
      const labelled = wrapped || attr(m[0], "aria-label") || attr(m[0], "aria-labelledby") || (id && new RegExp(`<label\\b[^>]*for\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html));
      if (!labelled) add("consider", page, `A form ${m[1]} has no label: ${m[0].slice(0, 80)}`);
    }

    const text = visibleText(html);
    if (/[—–]/.test(text)) add("fix", page, "Visible text uses an em or en dash. Use a comma, a colon, a full stop or a hyphen.");
    if (/lorem ipsum/i.test(text)) add("fix", page, "Lorem ipsum is still on the page.");
    const placeholder = /\[(?:your|add|insert|todo|placeholder)[^\]]{0,40}\]/i.exec(text);
    if (placeholder) add("fix", page, `A placeholder is still in the copy: ${placeholder[0]}`);
  }

  const animates = /@keyframes|\banimation\s*:|\btransition\s*:/.test(allStyles) || /\.animate\(|requestAnimationFrame|gsap\.|IntersectionObserver/.test(allScripts);
  if (animates && !/prefers-reduced-motion/.test(allStyles + allScripts)) {
    add("fix", css[0]?.[0] ?? pages[0] ?? "(site)", "There's motion but no prefers-reduced-motion fallback. Turn it off under reduce so the still page is complete.");
  }
  if (/outline\s*:\s*(?:none|0)\b/.test(allStyles) && !/:focus-visible/.test(allStyles)) {
    add("fix", css[0]?.[0] ?? "(styles)", "Focus outlines are removed without a :focus-visible style, so keyboard users can't see where they are.");
  }
  for (const [path, code] of js) {
    if (/addEventListener\(\s*["']scroll["']/.test(code)) add("consider", path, "A scroll event listener drives effects. IntersectionObserver or CSS scroll-driven animations are smoother.");
  }
  if (pages.length > 0 && !/@media\b[^{]*\((?:min|max)-width/.test(allStyles) && !/\b(?:clamp|min|max)\(/.test(allStyles) && !/grid-template-columns\s*:\s*repeat\(\s*auto-(?:fit|fill)/.test(allStyles)) {
    add("consider", css[0]?.[0] ?? pages[0]!, "No responsive rules found (media queries, clamp() or auto-fit grids). Check the layout at 375 px.");
  }
  return { pages: pages.length, findings };
}

/** The review as the tool's reply to the agent. */
export function formatSiteReview(review: SiteReview): string {
  if (review.pages === 0) return "There are no HTML pages in the project to review.";
  const fix = review.findings.filter((f) => f.severity === "fix");
  const consider = review.findings.filter((f) => f.severity === "consider");
  if (review.findings.length === 0) return `Reviewed ${review.pages} ${review.pages === 1 ? "page" : "pages"}: nothing to fix. Mention in finish what you checked.`;
  const lines = [`Reviewed ${review.pages} ${review.pages === 1 ? "page" : "pages"}: ${fix.length} to fix, ${consider.length} to consider. Fix the first group before you finish.`];
  for (const f of [...fix, ...consider]) lines.push(`- [${f.severity}] ${f.file}: ${f.message}`);
  return lines.join("\n");
}

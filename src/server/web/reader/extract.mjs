// Turning a fetched page into readable text for the model (stage 205, ADR 0222): the article itself (Mozilla's Readability,
// on linkedom's DOM; no page script ever runs), its title and site, its own dates, and whether it asks not to be used. Dates
// come from what the page says about itself (JSON-LD, meta tags, <time>), never from Last-Modified, which on dynamic pages is
// usually "now" and would make old news look fresh.
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { cleanDate } from "./dates.mjs";

export { cleanDate };

const MAX_TEXT = 30_000;
const BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,dt,dd,figcaption,td,th";

function jsonLdDates(document) {
  const found = { published: null, updated: null };
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    found.published ??= cleanDate(node.datePublished) ?? cleanDate(node.dateCreated);
    found.updated ??= cleanDate(node.dateModified);
    if (node["@graph"]) visit(node["@graph"]);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(script.textContent ?? ""));
    } catch {
      // A broken block says nothing.
    }
  }
  return found;
}

function metaContent(document, selectors) {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content");
    if (value) return value;
  }
  return null;
}

/** The page's own published and updated dates. */
export function pageDates(document, hinted = null) {
  const ld = jsonLdDates(document);
  const published =
    ld.published ??
    cleanDate(metaContent(document, ['meta[property="article:published_time"]', 'meta[name="article:published_time"]', 'meta[itemprop="datePublished"]', 'meta[name="pubdate"]', 'meta[name="publishdate"]', 'meta[name="date"]', 'meta[name="DC.date.issued"]', 'meta[name="dc.date"]'])) ??
    cleanDate(document.querySelector("article time[datetime], time[pubdate][datetime], main time[datetime]")?.getAttribute("datetime") ?? null) ??
    cleanDate(hinted);
  const updated = ld.updated ?? cleanDate(metaContent(document, ['meta[property="article:modified_time"]', 'meta[itemprop="dateModified"]', 'meta[property="og:updated_time"]']));
  return { published, updated };
}

/** True when the page or its headers ask not to be used: noai, nosnippet, none, or a text-and-data-mining reservation. */
export function optsOut(document, { robotsTag = "", tdm = "" } = {}) {
  const directives = [robotsTag, metaContent(document, ['meta[name="robots"]']) ?? "", metaContent(document, ['meta[name="farbaekbot"]']) ?? ""]
    .join(",")
    .toLowerCase()
    // "otherbot: noindex" in a header is for another crawler.
    .split(",")
    .map((d) => d.trim())
    .filter((d) => !/^[a-z0-9_-]+bot\s*:/.test(d) || d.startsWith("farbaekbot:"))
    .map((d) => d.replace(/^farbaekbot\s*:\s*/, ""));
  if (directives.some((d) => d === "noai" || d === "nosnippet" || d === "none")) return true;
  const reservation = (tdm || metaContent(document, ['meta[name="tdm-reservation"]']) || "").trim();
  return reservation === "1";
}

/**
 * The picture a page names for previews of itself (stage 278, ADR 0285): its og:image, or the one it names for cards. An https
 * address, made whole against the page's own, or null. A page that asks for no picture preview ("max-image-preview:none", the
 * instruction search engines follow) gets none, whoever the instruction is addressed to among all crawlers or Farbaek's.
 */
export function pagePicture(document, url, { robotsTag = "" } = {}) {
  return refusesPicture(document, { robotsTag }) ? null : namedPicture(document, url);
}

/** True when the page asks for no picture preview of itself. Research then shows none for it, not the search's either. */
export function refusesPicture(document, { robotsTag = "" } = {}) {
  const directives = [robotsTag, metaContent(document, ['meta[name="robots"]']) ?? "", metaContent(document, ['meta[name="farbaekbot"]']) ?? ""]
    .join(",")
    .toLowerCase()
    .split(",")
    .map((d) => d.trim())
    .filter((d) => !/^[a-z0-9_-]+bot\s*:/.test(d) || d.startsWith("farbaekbot:"))
    .map((d) => d.replace(/^farbaekbot\s*:\s*/, "").replace(/\s+/g, ""));
  return directives.some((d) => d === "max-image-preview:none" || d === "noimageindex");
}

function namedPicture(document, url) {
  const raw = metaContent(document, ['meta[property="og:image:secure_url"]', 'meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]']);
  if (!raw || raw.length > 2_000 || /^data:/i.test(raw.trim())) return null;
  try {
    const picture = new URL(raw.trim(), url);
    if (picture.protocol !== "https:" || picture.username || picture.password) return null;
    picture.hash = "";
    const out = picture.toString();
    return Buffer.byteLength(out) <= 400 ? out : null;
  } catch {
    return null;
  }
}

function tidy(text) {
  return text
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Paragraphs of an article's HTML, as plain text. */
function paragraphs(html) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const parts = [];
  for (const el of document.querySelectorAll(BLOCKS)) {
    // Text of nested blocks is taken once, from the innermost block.
    if (el.querySelector(BLOCKS)) continue;
    const t = (el.textContent ?? "").trim();
    if (t) parts.push(t);
  }
  return parts.length > 0 ? parts.join("\n\n") : (document.body?.textContent ?? "");
}

/**
 * Reads a page: { title, site, text, published, updated, lang, optOut, image }. When the page opts out, only its title and
 * site are kept, and no picture. Text is capped at 30,000 characters.
 */
export function extractPage(html, url, { robotsTag = "", tdm = "", hintedDate = null, plain = false } = {}) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (plain) return { title: host, site: host, text: tidy(String(html)).slice(0, MAX_TEXT), published: cleanDate(hintedDate), updated: null, lang: null, optOut: false, image: null, noPicture: false };
  const { document } = parseHTML(String(html));
  const optOut = optsOut(document, { robotsTag, tdm });
  const dates = pageDates(document, hintedDate);
  const titleTag = (document.querySelector("title")?.textContent ?? "").trim();
  const siteName = (metaContent(document, ['meta[property="og:site_name"]']) ?? "").trim();
  const lang = document.documentElement?.getAttribute("lang") ?? null;
  if (optOut) return { title: titleTag || host, site: siteName || host, text: "", ...dates, lang, optOut: true, image: null, noPicture: true };
  // Read before Readability, which rewrites the document as it works.
  const noPicture = refusesPicture(document, { robotsTag });
  const image = noPicture ? null : namedPicture(document, url);
  let article = null;
  try {
    article = new Readability(document, { maxElemsToParse: 20_000, charThreshold: 250, keepClasses: false }).parse();
  } catch {
    article = null;
  }
  const text = tidy(article?.content ? paragraphs(article.content) : (document.body?.textContent ?? "")).slice(0, MAX_TEXT);
  return {
    title: (article?.title || titleTag || host).trim().slice(0, 300),
    site: (article?.siteName || siteName || host).trim().slice(0, 120),
    text,
    published: dates.published ?? cleanDate(article?.publishedTime ?? null),
    updated: dates.updated,
    lang,
    optOut: false,
    image,
    noPicture,
  };
}

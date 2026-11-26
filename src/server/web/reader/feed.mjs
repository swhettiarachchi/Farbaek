// Reading a newsroom's own feed (stage 280, ADR 0288): RSS 2.0, RSS 1.0 (RDF) and Atom, turned into a short list of dated
// stories with a summary and, when the feed gives one, a picture. A feed is what a newsroom publishes for exactly this: to be
// read by a program and shown with a link back.
//
// Nothing here is an XML parser. A feed is cut into its items by plain searches for their tags and each field is read as text,
// so no entity is ever expanded beyond the five XML ones and numbered characters, no document type is read, and nothing a feed
// says can make the reader fetch anything. Whatever is in a field is shown as text; markup inside it is taken out.
//
// The reader is one thread, so a feed must cost time in proportion to its length and no more. An item, a field and a block of
// script are each found with one search for where they open and one for where they close; the only patterns left are ones that
// can't be made to look twice at the same text (a tag is "<", then anything but "<" or ">", then ">").
import { cleanDate } from "./dates.mjs";

/** The most a feed gives: its newest items only. */
export const FEED_ITEMS = 25;
const SUMMARY_CHARS = 600;
const TITLE_CHARS = 300;
/** An item longer than this is not a story's entry: it is left out unread. */
const PIECE_CHARS = 200_000;
const FIELD_CHARS = 60_000;

/** True when the character after a tag's name ends the name: "<item>" and "<item rdf:about" are items, "<items>" is not. */
const endsName = (c) => c === ">" || c === "/" || c === " " || c === "\n" || c === "\r" || c === "\t" || c === undefined;

/** Text without its script and style blocks, each found by one search for its end. One with no end takes the rest with it. */
function withoutBlocks(text) {
  const lower = text.toLowerCase();
  let out = "";
  let at = 0;
  for (;;) {
    const s = lower.indexOf("<script", at);
    const y = lower.indexOf("<style", at);
    const open = s < 0 ? y : y < 0 ? s : Math.min(s, y);
    if (open < 0) return out + text.slice(at);
    const name = open === s ? "script" : "style";
    out += `${text.slice(at, open)} `;
    const close = lower.indexOf(`</${name}`, open);
    if (close < 0) return out;
    const end = lower.indexOf(">", close);
    if (end < 0) return out;
    at = end + 1;
  }
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

/** Text as written, with the handful of entities a feed uses turned back into characters. Unknown ones are left as they are. */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Never a control character, and never past the end of Unicode.
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : " ";
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** Text with its CDATA sections opened, each found by one search for its end. An opening with no end loses its mark and keeps its words. */
function unwrap(text) {
  let out = "";
  let at = 0;
  for (;;) {
    const open = text.indexOf("<![CDATA[", at);
    if (open < 0) return out + text.slice(at);
    const close = text.indexOf("]]>", open + 9);
    if (close < 0) return out + text.slice(at).split("<![CDATA[").join("");
    out += text.slice(at, open) + text.slice(open + 9, close);
    at = close + 3;
  }
}

/** A field's words: CDATA unwrapped, entities decoded, markup taken out, on one line. */
function plain(raw, max) {
  if (!raw) return "";
  // Decoded once, tags removed, then decoded again: a feed often escapes the HTML inside a description.
  const once = decodeEntities(unwrap(raw));
  const text = decodeEntities(withoutBlocks(once).replace(/<[^<>]{0,2000}>/g, " "))
    .replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 80))}…`;
}

/** The inside of the first `<name>…</name>` in a piece of a feed, or "". The name may carry a prefix ("dc:date"). */
function field(piece, name) {
  const lower = piece.toLowerCase();
  const tag = `<${name.toLowerCase()}`;
  for (let at = 0; ; ) {
    const open = lower.indexOf(tag, at);
    if (open < 0) return "";
    at = open + tag.length;
    // "<link" is not "<linkset": the name must end there.
    if (!endsName(lower[at])) continue;
    const start = lower.indexOf(">", at);
    if (start < 0 || start - at > 500) return "";
    // An empty tag ("<link href=… />") has nothing inside it: the next one of the name may.
    if (lower[start - 1] === "/") {
      at = start + 1;
      continue;
    }
    const close = lower.indexOf(`</${name.toLowerCase()}>`, start);
    return close < 0 || close - start > FIELD_CHARS ? "" : piece.slice(start + 1, close);
  }
}

/** An attribute's value from a tag as written. */
function attribute(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]{0,2000})"|'([^']{0,2000})')`, "i").exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? "") : "";
}

/** An https address made whole against the feed's own, or null. */
function address(raw, base, { https = false } = {}) {
  const text = decodeEntities(unwrap(raw ?? "")).trim();
  if (!text || text.length > 2_000) return null;
  try {
    const url = new URL(text, base);
    if (url.protocol !== "https:" && (https || url.protocol !== "http:")) return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    url.hash = "";
    const out = url.toString();
    return Buffer.byteLength(out) <= (https ? 400 : 600) ? out : null;
  } catch {
    return null;
  }
}

const IMAGE_END = /\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i;

/** The picture a feed gives with an item: its media thumbnail or content, an image enclosure, or the first picture in its text. */
function picture(piece, base) {
  const candidates = [];
  for (const m of piece.matchAll(/<media:thumbnail\b[^<>]{0,2000}>/gi)) candidates.push(attribute(m[0], "url"));
  for (const m of piece.matchAll(/<media:content\b[^<>]{0,2000}>/gi)) {
    const type = attribute(m[0], "type");
    const medium = attribute(m[0], "medium");
    const url = attribute(m[0], "url");
    if (medium === "image" || type.startsWith("image/") || (!type && !medium && IMAGE_END.test(url))) candidates.push(url);
  }
  for (const m of piece.matchAll(/<enclosure\b[^<>]{0,2000}>/gi)) if (attribute(m[0], "type").startsWith("image/")) candidates.push(attribute(m[0], "url"));
  const body = decodeEntities(unwrap(field(piece, "content:encoded") || field(piece, "description") || field(piece, "content") || field(piece, "summary")));
  const img = /<img\b[^<>]{0,2000}>/i.exec(body);
  if (img) candidates.push(attribute(img[0], "src"));
  for (const c of candidates) {
    const url = address(c, base, { https: true });
    if (url) return url;
  }
  return null;
}

/** Where an item leads: RSS writes it between tags, Atom as an attribute of the link marked "alternate" (or unmarked). */
function link(piece, base) {
  const links = [...piece.matchAll(/<link\b[^<>]{0,2000}>/gi)].map((m) => m[0]);
  const atom = links.find((l) => /\shref\s*=/.test(l) && (!/\srel\s*=/.test(l) || /\srel\s*=\s*["']alternate["']/i.test(l)));
  if (atom) return address(attribute(atom, "href"), base);
  return address(field(piece, "link"), base) ?? address(field(piece, "guid"), base);
}

/**
 * The items of a feed, newest first as the feed gives them: { title, url, published, summary, image }. An item with no title or
 * no usable address is left out. `now` bounds dates, as for pages. Returns [] for anything that isn't a feed.
 */
export function parseFeed(xml, feedUrl, now = Date.now()) {
  const text = String(xml ?? "");
  if (!/<(?:rss|feed|rdf:RDF)\b/i.test(text.slice(0, 4_000))) return [];
  // Each item is found by one search for where it opens and one for where it closes: a feed that opens ten thousand and
  // closes none costs one pass, not ten thousand.
  const lower = text.toLowerCase();
  const pieces = [];
  for (let at = 0; pieces.length < FEED_ITEMS * 2; ) {
    const i = lower.indexOf("<item", at);
    const e = lower.indexOf("<entry", at);
    const open = i < 0 ? e : e < 0 ? i : Math.min(i, e);
    if (open < 0) break;
    const name = open === i ? "item" : "entry";
    if (!endsName(lower[open + 1 + name.length])) {
      at = open + 1 + name.length;
      continue;
    }
    const close = lower.indexOf(`</${name}>`, open);
    if (close < 0) break;
    at = close + name.length + 3;
    if (at - open <= PIECE_CHARS) pieces.push(text.slice(open, at));
  }
  const out = [];
  const seen = new Set();
  for (const piece of pieces) {
    if (out.length >= FEED_ITEMS) break;
    const title = plain(field(piece, "title"), TITLE_CHARS);
    const url = link(piece, feedUrl);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      title,
      url,
      published: cleanDate(plain(field(piece, "pubDate") || field(piece, "published") || field(piece, "dc:date") || field(piece, "updated"), 80) || null, now),
      summary: plain(field(piece, "description") || field(piece, "summary") || field(piece, "content:encoded") || field(piece, "content"), SUMMARY_CHARS),
      image: picture(piece, feedUrl),
    });
  }
  return out;
}

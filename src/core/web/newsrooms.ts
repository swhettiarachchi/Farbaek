/**
 * Newsrooms, for a roundup of news (stage 278, ADR 0285). Framework-free.
 *
 * ADR 0223 ranks results with no list of trusted names, because a well-known site isn't right about everything. That still
 * holds for a question with an answer: the subject's own site, the freshest page and the best match decide. A roundup is a
 * different request. "Today's tech news" has no subject of its own, so nothing ranks a newsroom that reported a story above a
 * site that rewrote it, and an answer made from rewrites reads like one. For a roundup only, a result from an established
 * newsroom counts for a little more. It is a weight, never a filter: a small site with the one page on the subject still wins,
 * and nothing here says a newsroom is right.
 *
 * The list is of organisations that report first-hand, publish corrections and name their writers. Keep it short and plain:
 * wire services and papers of record, the technology and science press, and Sri Lanka's daily news, since that is where
 * Farbaek is tested. An addition needs a case in `eval/` like any other word list.
 */

const NEWSROOMS = [
  // Wire services and papers of record.
  "reuters.com apnews.com afp.com bbc.com bbc.co.uk theguardian.com nytimes.com wsj.com ft.com bloomberg.com economist.com washingtonpost.com",
  "npr.org pbs.org cnbc.com cnn.com nbcnews.com cbsnews.com abcnews.go.com aljazeera.com dw.com france24.com abc.net.au cbc.ca axios.com semafor.com",
  "nikkei.com scmp.com straitstimes.com thehindu.com indianexpress.com hindustantimes.com japantimes.co.jp",
  // Technology.
  "theverge.com techcrunch.com arstechnica.com wired.com engadget.com zdnet.com cnet.com venturebeat.com theregister.com technologyreview.com",
  "theinformation.com 9to5mac.com 9to5google.com macrumors.com androidauthority.com androidcentral.com techradar.com pcmag.com tomshardware.com",
  "bleepingcomputer.com thehackernews.com krebsonsecurity.com securityweek.com infoq.com techmeme.com restofworld.org 404media.co",
  // Science.
  "nature.com science.org newscientist.com scientificamerican.com ieee.org",
  // Sport.
  "espn.com espncricinfo.com skysports.com",
  // Sri Lanka.
  "adaderana.lk dailymirror.lk newsfirst.lk economynext.com ft.lk sundaytimes.lk island.lk dailynews.lk hirunews.lk lankadeepa.lk newswire.lk colombogazette.com",
]
  .join(" ")
  .split(" ");

const NAMES: ReadonlySet<string> = new Set(NEWSROOMS);

/** True when a site (as `siteOf` gives it) is one of the newsrooms, or a part of one ("edition.cnn.com", "asia.nikkei.com"). */
export function isNewsroom(site: string): boolean {
  const name = site.toLowerCase();
  // What readers write on a newsroom's own site is not its reporting.
  if (/^(?:forums?|community|communities|discussions?|answers|boards?)\./.test(name)) return false;
  if (NAMES.has(name)) return true;
  // Every ending of the name after a dot: "news.bbc.co.uk" is tried as "bbc.co.uk", then "co.uk", then "uk".
  for (let dot = name.indexOf("."); dot >= 0; dot = name.indexOf(".", dot + 1)) if (NAMES.has(name.slice(dot + 1))) return true;
  return false;
}

/** How much more a newsroom's result counts in a roundup. Small on purpose: enough to pass a rewrite, not a better match. */
export const NEWSROOM_WEIGHT = 1.25;

/** The list, for its tests. */
export const NEWSROOM_NAMES: readonly string[] = NEWSROOMS;

// The page reader's core (stage 205, ADR 0222): robots.txt first, then the page, then its text. At most six pages at once and
// two per site, so neither the reader nor any one site is overwhelmed. Pages are kept in memory for ten minutes and robots.txt
// for a day; nothing is written to disk.
import { fetchPage, PUBLIC_NET, refuseUrl } from "./fetch.mjs";
import { extractPage } from "./extract.mjs";
import { robotsFromResponse, robotsPermit } from "./robots.mjs";

function cache(limit) {
  const map = new Map();
  return {
    get(key, now) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (hit.until <= now) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value, until) {
      map.delete(key);
      map.set(key, { value, until });
      while (map.size > limit) map.delete(map.keys().next().value);
    },
  };
}

export function createReader({ net = PUBLIC_NET, now = Date.now, maxConcurrent = 6, perHost = 2, pageTtlMs = 600_000, robotsTtlMs = 86_400_000, fetcher = fetchPage } = {}) {
  const pages = cache(300);
  const robots = cache(1_000);
  const pendingRobots = new Map();
  let active = 0;
  const byHost = new Map();
  const waiting = [];

  const free = (host) => active < maxConcurrent && (byHost.get(host) ?? 0) < perHost;
  async function acquire(host) {
    while (!free(host)) await new Promise((resolve) => waiting.push({ host, resolve }));
    active++;
    byHost.set(host, (byHost.get(host) ?? 0) + 1);
  }
  function release(host) {
    active--;
    const left = (byHost.get(host) ?? 1) - 1;
    if (left > 0) byHost.set(host, left);
    else byHost.delete(host);
    const next = waiting.findIndex((w) => free(w.host));
    if (next >= 0) waiting.splice(next, 1)[0].resolve();
  }

  async function robotsFor(origin, signal) {
    const known = robots.get(origin, now());
    if (known) return known;
    if (pendingRobots.has(origin)) return pendingRobots.get(origin);
    const pending = fetcher(`${origin}/robots.txt`, { timeoutMs: 1_500, maxBytes: 500_000, types: null, signal, net })
      .then((result) => {
        const value = robotsFromResponse(result);
        // A site that couldn't be reached is asked again in a few minutes, not a day.
        robots.set(origin, value, now() + (value.kind === "disallow-all" && !result.status ? 300_000 : robotsTtlMs));
        return value;
      })
      .finally(() => pendingRobots.delete(origin));
    pendingRobots.set(origin, pending);
    return pending;
  }

  /** Reads one page: { ok: true, url, title, site, text, published, updated, optOut } or { ok: false, reason }. */
  async function read(url, { timeoutMs = 4_000, hintedDate = null, signal } = {}) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: "not a web address" };
    }
    // An address that may never be fetched is refused for that reason, before robots.txt or anything else is asked.
    const refused = refuseUrl(parsed.toString(), net);
    if (refused) return { ok: false, reason: refused };
    const cached = pages.get(parsed.toString(), now());
    if (cached) return cached;
    const host = parsed.hostname;
    await acquire(host);
    try {
      const rules = await robotsFor(parsed.origin, signal);
      if (!robotsPermit(rules, parsed.toString())) return { ok: false, reason: "the site's robots.txt doesn't allow it" };
      const page = await fetcher(parsed.toString(), { timeoutMs, signal, net });
      if (!page.ok) return { ok: false, reason: page.reason };
      const plain = page.contentType.startsWith("text/plain");
      const extracted = extractPage(page.text, page.url, { robotsTag: page.robotsTag, tdm: page.tdm, hintedDate, plain });
      const value = { ok: true, url: page.url, ...extracted };
      pages.set(parsed.toString(), value, now() + pageTtlMs);
      return value;
    } catch {
      return { ok: false, reason: "couldn't read the page" };
    } finally {
      release(host);
    }
  }

  return { read, stats: () => ({ active, waiting: waiting.length }) };
}

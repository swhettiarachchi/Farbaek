// The page reader's core (stage 205, ADR 0222): robots.txt first, then the page, then its text. At most six pages at once and
// two per site, so neither the reader nor any one site is overwhelmed. Pages are kept in memory for ten minutes and robots.txt
// for a day; nothing is written to disk.
import { fetchPage, fetchPicture, PUBLIC_NET, refuseUrl } from "./fetch.mjs";
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

export function createReader({ net = PUBLIC_NET, now = Date.now, maxConcurrent = 6, perHost = 2, pageTtlMs = 600_000, robotsTtlMs = 86_400_000, fetcher = fetchPage, pictureFetcher = fetchPicture, pictureTtlMs = 1_800_000, pictureRoomBytes = 24_000_000, maxPictures = 3 } = {}) {
  const pages = cache(300);
  // Pictures asked for lately, so six people opening one answer fetch each picture once. Bounded by bytes, oldest out first.
  const pictures = new Map();
  let pictureBytes = 0;
  const pendingPictures = new Map();
  // Pictures are fetched a few at a time in a pool of their own: an answer's ten pictures must never hold the places that
  // someone else's research needs to read its pages.
  let picturesActive = 0;
  const picturesWaiting = [];
  async function acquirePicture() {
    while (picturesActive >= maxPictures) await new Promise((resolve) => picturesWaiting.push(resolve));
    picturesActive++;
  }
  function releasePicture() {
    picturesActive--;
    picturesWaiting.shift()?.();
  }
  function keepPicture(key, value) {
    const size = value.ok ? value.bytes.length : 64;
    // One that is there already gives its room back first, so the count never drifts.
    const had = pictures.get(key);
    if (had) pictureBytes -= had.size;
    pictures.delete(key);
    pictures.set(key, { value, size, until: now() + (value.ok ? pictureTtlMs : 120_000) });
    pictureBytes += size;
    for (const [oldest, kept] of pictures) {
      if (pictureBytes <= pictureRoomBytes && pictures.size <= 400) break;
      if (oldest === key) break;
      pictures.delete(oldest);
      pictureBytes -= kept.size;
    }
  }
  function keptPicture(key) {
    const hit = pictures.get(key);
    if (!hit) return undefined;
    if (hit.until > now()) return hit.value;
    pictures.delete(key);
    pictureBytes -= hit.size;
    return undefined;
  }
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

  // Shared by everyone reading that site at the moment, so it runs on its own time limit only: one person pressing Stop
  // mustn't turn into "robots.txt disallows everything" for the next person.
  async function robotsFor(origin) {
    const known = robots.get(origin, now());
    if (known) return known;
    if (pendingRobots.has(origin)) return pendingRobots.get(origin);
    const pending = fetcher(`${origin}/robots.txt`, { timeoutMs: 1_500, maxBytes: 500_000, types: null, net })
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
      const rules = await robotsFor(parsed.origin);
      if (signal?.aborted) return { ok: false, reason: "stopped" };
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

  /**
   * Fetches one picture (stage 278): { ok: true, contentType, bytes } or { ok: false, reason }. The site's robots.txt is asked
   * as for a page, the same limits on how much is fetched at once hold, and a picture asked for by several people at the same
   * moment is fetched once.
   */
  async function picture(url, { timeoutMs = 5_000, signal } = {}) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: "not a web address" };
    }
    if (parsed.protocol !== "https:" && !net.allowLocalNames) return { ok: false, reason: "not https" };
    const refused = refuseUrl(parsed.toString(), net);
    if (refused) return { ok: false, reason: refused };
    const key = parsed.toString();
    const known = keptPicture(key);
    if (known) return known;
    if (pendingPictures.has(key)) return pendingPictures.get(key);
    const pending = (async () => {
      await acquirePicture();
      try {
        const rules = await robotsFor(parsed.origin);
        if (!robotsPermit(rules, key)) return { ok: false, reason: "the site's robots.txt doesn't allow it" };
        // Shared by everyone asking for it now, so one person leaving the page doesn't stop it for the others.
        return await pictureFetcher(key, { timeoutMs, net });
      } catch {
        return { ok: false, reason: "couldn't fetch the picture" };
      } finally {
        releasePicture();
      }
    })();
    pendingPictures.set(key, pending);
    try {
      const value = await pending;
      keepPicture(key, value);
      return signal?.aborted ? { ok: false, reason: "stopped" } : value;
    } finally {
      pendingPictures.delete(key);
    }
  }

  return { read, picture, stats: () => ({ active, waiting: waiting.length, pictures: pictures.size, pictureBytes, picturesActive, picturesWaiting: picturesWaiting.length }) };
}

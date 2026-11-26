import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { PICTURE_SIG_PATTERN, PICTURE_TYPES, pictureUrl } from "@/core/web/pictures";

/**
 * Signing and serving a source's picture (stage 278, ADR 0285). Farbaek's reader fetches a picture only for an address that
 * came out of Farbaek's own research: the address is saved with a signature made here, and the route gives a picture only when
 * the signature is right. Without that, the route would fetch any picture anyone named.
 *
 * What a signature says, and no more: this server, while researching some answer, kept this exact address as a page's preview
 * picture or a search's thumbnail. It is not tied to a person or an answer and has no end date, so anyone signed in who holds
 * one can ask for that one public picture again. What bounds the route is the rest: https only, public addresses only, pictures
 * only, a size limit, and limits on how many one person may ask for.
 *
 * The key is derived the way the server's other keys are (token-vault.ts, web-push.ts): from the secret it already has, through
 * HKDF with a label of its own, so the signatures say nothing about that secret and nothing else can be signed with them.
 * `PICTURE_SIGNING_KEY` is used in its place when set. With neither, there is no key, nothing is signed, and stories show
 * without pictures.
 */

type Env = Record<string, string | undefined>;

export function pictureKey(env: Env = process.env): Buffer | null {
  const master = (env.PICTURE_SIGNING_KEY ?? "").trim() || (env.SUPABASE_SECRET_KEY ?? "").trim();
  if (master.length < 20) return null;
  return Buffer.from(hkdfSync("sha256", master, "farbaek", "farbaek/chat-pictures/v1", 32));
}

/** The signature of a picture address: 27 URL-safe characters, 162 bits of an HMAC-SHA-256. */
export function signPicture(url: string, key: Buffer): string {
  return createHmac("sha256", key).update(url).digest("base64url").slice(0, 27);
}

/** True when `sig` is this server's signature of `url`. Compared in constant time, and only when it is shaped as one. */
export function verifyPicture(url: string, sig: string, key: Buffer): boolean {
  if (!PICTURE_SIG_PATTERN.test(sig)) return false;
  const made = Buffer.from(signPicture(url, key));
  const given = Buffer.from(sig);
  return made.length === given.length && timingSafeEqual(made, given);
}

/** A picture address with its signature, as it is saved with a source; nothing when there is no key or the address isn't usable. */
export function signedPicture(raw: unknown, key: Buffer | null, base?: string): { image: string; imageSig: string } | null {
  if (!key) return null;
  const image = pictureUrl(raw, base);
  return image ? { image, imageSig: signPicture(image, key) } : null;
}

/**
 * How many pictures one person may ask for in a window, counted in this server's memory in bounded room. An answer shows a
 * handful, each kept by the browser for a week, so an honest reader is far under it; it is a ceiling on someone replaying
 * signed addresses to make the reader work.
 */
export function createPictureLimiter(limit: number, windowMs: number, maxPeople = 2_000, now: () => number = () => Date.now()): ((person: string) => boolean) & { size(): number } {
  const seen = new Map<string, { start: number; hits: number }>();
  const allow = (person: string): boolean => {
    const at = now();
    const entry = seen.get(person);
    if (entry && at - entry.start < windowMs) {
      entry.hits += 1;
      return entry.hits <= limit;
    }
    if (!entry && seen.size >= maxPeople) {
      for (const [key, value] of seen) if (at - value.start >= windowMs) seen.delete(key);
      // Everyone still within their window: the oldest tenth go, so the room never grows.
      let drop = seen.size >= maxPeople ? Math.ceil(maxPeople / 10) : 0;
      for (const key of seen.keys()) {
        if (drop-- <= 0) break;
        seen.delete(key);
      }
    }
    seen.set(person, { start: at, hits: 1 });
    return true;
  };
  return Object.assign(allow, { size: () => seen.size });
}

/**
 * How many pictures are on their way at one moment: a few for one person, and so many in all. A picture is held whole in the
 * server's memory while it is passed on, so without this a burst of requests for large pictures would hold them all at once.
 * A request over the count waits its turn, since an answer's pictures are all asked for together; one that would wait behind
 * too many is turned away.
 */
export function createPictureGate(perPerson = 4, inAll = 16, maxWaiting = 64) {
  const active = new Map<string, number>();
  let total = 0;
  const waiting: { person: string; go: () => void }[] = [];
  const free = (person: string) => total < inAll && (active.get(person) ?? 0) < perPerson;
  const take = (person: string) => {
    total += 1;
    active.set(person, (active.get(person) ?? 0) + 1);
  };
  const leave = (person: string) => {
    total -= 1;
    const left = (active.get(person) ?? 1) - 1;
    if (left > 0) active.set(person, left);
    else active.delete(person);
    const next = waiting.findIndex((w) => free(w.person));
    if (next >= 0) {
      const [w] = waiting.splice(next, 1);
      take(w!.person);
      w!.go();
    }
  };
  return {
    /** Resolves to the function that gives the place back, or null when too many are waiting already or the request went away. */
    async enter(person: string, signal?: AbortSignal): Promise<(() => void) | null> {
      const done = () => {
        let left = false;
        return () => {
          if (left) return;
          left = true;
          leave(person);
        };
      };
      if (free(person)) {
        take(person);
        return done();
      }
      if (waiting.length >= maxWaiting || signal?.aborted) return null;
      return new Promise((resolve) => {
        const entry = { person, go: () => resolve(done()) };
        waiting.push(entry);
        signal?.addEventListener(
          "abort",
          () => {
            const at = waiting.indexOf(entry);
            if (at >= 0) {
              waiting.splice(at, 1);
              resolve(null);
            }
          },
          { once: true },
        );
      });
    },
    stats: () => ({ total, people: active.size, waiting: waiting.length }),
  };
}

export interface PictureDeps {
  key: Buffer | null;
  /** Asks the page reader for the picture: its bytes and kind, or null when it couldn't be had. */
  fetch(url: string, signal: AbortSignal): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  /** Whether this person may ask for another picture now. */
  allow(): boolean;
  /** Waits for this person's turn to hold a picture: the function that gives the place back, or null when there is none. */
  enter?(signal: AbortSignal): Promise<(() => void) | null>;
}

const NOT_FOUND = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
const LATER = () => new Response(null, { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } });

/**
 * `GET /app/chat/api/picture?u=<address>&s=<signature>`, for someone signed in. Answers the picture, or 404 with nothing in it:
 * the screen then shows the story without one. What comes back is another site's bytes, so it is sent as a picture and nothing
 * else: a kind from the short list, no sniffing, and a policy under which it could run nothing even if opened on its own.
 */
export async function servePicture(request: Request, deps: PictureDeps): Promise<Response> {
  if (!deps.key) return NOT_FOUND();
  // Someone who asked their browser to save data is sent no pictures: the stories keep their words.
  if ((request.headers.get("save-data") ?? "").toLowerCase() === "on") return NOT_FOUND();
  const params = new URL(request.url).searchParams;
  const asked = params.get("u") ?? "";
  const sig = params.get("s") ?? "";
  // The address must be one this server would have signed, as it would have written it, and the signature must be its own.
  const url = pictureUrl(asked);
  if (!url || url !== asked || !verifyPicture(url, sig, deps.key)) return NOT_FOUND();
  if (!deps.allow()) return LATER();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]);
  const leave = deps.enter ? await deps.enter(signal) : () => undefined;
  if (!leave) return LATER();
  try {
    const picture = await deps.fetch(url, AbortSignal.any([request.signal, AbortSignal.timeout(7_000)])).catch(() => null);
    if (!picture) return NOT_FOUND();
    const type = picture.contentType.split(";")[0]!.trim().toLowerCase();
    if (!(PICTURE_TYPES as readonly string[]).includes(type) || picture.bytes.byteLength === 0) return NOT_FOUND();
    return new Response(picture.bytes as BodyInit, {
      status: 200,
      headers: {
        "content-type": type,
        "content-length": String(picture.bytes.byteLength),
        // The address is the picture's name: the same address is the same picture, so the browser keeps it for a week.
        "cache-control": "private, max-age=604800, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "content-disposition": "inline",
        "cross-origin-resource-policy": "same-origin",
        vary: "save-data",
      },
    });
  } finally {
    leave();
  }
}

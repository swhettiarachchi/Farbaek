import "server-only";
import { LINK_BODY_BYTES, LINK_PAYLOAD_MAX, linkAnswer, type LinkFired } from "@/core/automation/links";
import { readTextCapped } from "@/server/http/body";
import { json, problem } from "@/server/sandbox/http";

/**
 * A call to a task's link from another app (stage 277, ADR 0284): `POST /api/v1/hooks/<link id>` with the link's secret in the
 * Authorization header and, if the caller likes, a little text in the body for the run. There is no session here and no person:
 * the secret is the whole of the caller's right, so it is taken only from the header (never from the address, which ends up in
 * logs), and neither it nor the body is ever logged or sent back.
 */

export interface LinkCallDeps {
  /** Whether this caller, known by a hash of its address, may make another call now. */
  allow(caller: string): Promise<boolean>;
  fire(linkId: string, secret: string, body: string | null): Promise<LinkFired | "error">;
  /** A hash of the caller's address, for the limit: never the address itself. */
  caller(request: Request): string;
  log?(event: string, fields: Record<string, unknown>): void;
}

/** Calls one address may make in a minute, to any link: far above an honest caller's, and a ceiling on a flood. */
export const LINK_CALLS_A_MINUTE = 30;

/**
 * A count of calls by caller, kept in this server's memory and nowhere else. A call with no right secret must cost the database
 * nothing but a read: a limit kept in the database would make every such call a write, and a caller who varies the address it
 * claims to come from could fill a table with them. Here the room is bounded, so the worst a flood does is forget older callers.
 * It sheds a flood from one address; what keeps a link safe is its secret and its own limit, which the database holds.
 */
export function createCallLimiter(limit: number, windowMs: number, maxCallers = 5_000, now: () => number = () => Date.now()): ((caller: string) => boolean) & { size(): number } {
  const seen = new Map<string, { start: number; hits: number }>();
  const allow = (caller: string): boolean => {
    const at = now();
    const entry = seen.get(caller);
    if (entry && at - entry.start < windowMs) {
      entry.hits += 1;
      return entry.hits <= limit;
    }
    if (!entry && seen.size >= maxCallers) {
      // Callers whose minute has passed go first; if every one is still within it, the oldest tenth goes.
      for (const [key, value] of seen) if (at - value.start >= windowMs) seen.delete(key);
      let drop = seen.size >= maxCallers ? Math.ceil(maxCallers / 10) : 0;
      for (const key of seen.keys()) {
        if (drop-- <= 0) break;
        seen.delete(key);
      }
    }
    seen.set(caller, { start: at, hits: 1 });
    return true;
  };
  // How many callers are remembered: never more than `maxCallers`.
  return Object.assign(allow, { size: () => seen.size });
}

const UNKNOWN = () => {
  const a = linkAnswer("unknown");
  return problem(a.status, a.code, a.message, undefined, { "www-authenticate": "Bearer" });
};

export async function handleLinkCall(request: Request, linkId: string, deps: LinkCallDeps): Promise<Response> {
  // The limit comes first, so a caller trying secrets is slowed before anything is compared.
  const allowed = await deps.allow(deps.caller(request)).catch(() => false);
  if (!allowed) return problem(429, "RATE_LIMITED", "Too many calls from this address. Try again in a minute.", undefined, { "retry-after": "60" });

  // "Bearer <secret>", and nothing else: a missing or malformed header is answered as a wrong secret is.
  const header = request.headers.get("authorization") ?? "";
  const secret = /^Bearer ([^\s]+)$/i.exec(header)?.[1] ?? null;
  if (!secret) return UNKNOWN();

  const body = await readTextCapped(request, LINK_BODY_BYTES);
  // Too much is refused, not cut: a caller is never told a run was queued with text the run won't be given whole.
  if (body === null || body.trim().length > LINK_PAYLOAD_MAX) return problem(413, "TOO_LARGE", `The body is too large. Send at most ${LINK_PAYLOAD_MAX.toLocaleString("en-US")} characters of text.`);

  const fired = await deps.fire(linkId, secret, body).catch(() => "error" as const);
  if (fired === "error") return problem(503, "UNAVAILABLE", "The call couldn't be taken just now. Try again in a moment.", undefined, { "retry-after": "30" });
  // Which link was called and how it went; never the secret or what was sent.
  deps.log?.("link.called", { link: /^[0-9a-f-]{36}$/i.test(linkId) ? linkId : "malformed", outcome: fired });
  const answer = linkAnswer(fired);
  if (fired === "queued") return json({ data: { status: "queued", message: answer.message } }, answer.status);
  if (fired === "unknown") return UNKNOWN();
  return problem(answer.status, answer.code, answer.message, undefined, answer.retryAfter ? { "retry-after": String(answer.retryAfter) } : {});
}

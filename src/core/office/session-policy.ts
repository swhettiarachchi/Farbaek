/**
 * How long an Office Space sign-in lasts, judged from the Supabase JWT
 * (ADR 0032). `amr` lists how the person authenticated, newest first; it
 * comes either as objects with timestamps or as plain method names (RFC
 * 8176), and without a timestamp the session's age is unknown, so it fails
 * closed. The database also tracks each staff session (idle time, ending
 * it); this is the part the token alone can answer.
 */
import { OFFICE_POLICY } from "@/config/office";

export interface AmrEntry {
  method: string;
  /** Seconds since the epoch, or null when the token didn't say. */
  timestamp: number | null;
}

/** Second factors. Everything else (an email code, a password, a link) is a first factor. */
const SECOND_FACTOR = /^(?:totp|mfa\/.+|webauthn|phone)$/;

export function parseAmr(amr: unknown): AmrEntry[] {
  if (!Array.isArray(amr)) return [];
  const out: AmrEntry[] = [];
  for (const item of amr) {
    if (typeof item === "string" && item) out.push({ method: item, timestamp: null });
    else if (item && typeof item === "object" && typeof (item as { method?: unknown }).method === "string") {
      const ts = (item as { timestamp?: unknown }).timestamp;
      out.push({ method: (item as { method: string }).method, timestamp: typeof ts === "number" && Number.isFinite(ts) && ts > 0 ? ts : null });
    }
  }
  return out;
}

function newest(entries: AmrEntry[], pick: (e: AmrEntry) => boolean): Date | null {
  let best: number | null = null;
  for (const e of entries) {
    if (!pick(e) || e.timestamp === null) continue;
    if (best === null || e.timestamp > best) best = e.timestamp;
  }
  return best === null ? null : new Date(best * 1000);
}

/** When the person last proved they hold the mailbox (or another first factor). */
export function firstFactorAt(amr: unknown): Date | null {
  return newest(parseAmr(amr), (e) => !SECOND_FACTOR.test(e.method));
}

/** When the person last entered an authenticator code. */
export function lastTotpAt(amr: unknown): Date | null {
  return newest(parseAmr(amr), (e) => e.method === "totp" || e.method === "mfa/totp");
}

export type TokenVerdict =
  | { ok: true; firstFactorAt: Date }
  /** No session, or one whose age can't be told: sign in again. */
  | { ok: false; reason: "sign_in" }
  /** Signed in with the email code only: the authenticator code is next. */
  | { ok: false; reason: "verify" }
  /** Older than the office allows: sign in again. */
  | { ok: false; reason: "expired" };

export function tokenVerdict(claims: { aal?: unknown; amr?: unknown } | null, now: Date, policy = OFFICE_POLICY): TokenVerdict {
  if (!claims) return { ok: false, reason: "sign_in" };
  const first = firstFactorAt(claims.amr);
  if (!first) return { ok: false, reason: "sign_in" };
  if (now.getTime() - first.getTime() > policy.maxSessionHours * 3_600_000) return { ok: false, reason: "expired" };
  if (claims.aal !== "aal2") return { ok: false, reason: "verify" };
  return { ok: true, firstFactorAt: first };
}

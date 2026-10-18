/**
 * Pairing codes and agent tokens. Both are random secrets; Farbaek stores
 * only their SHA-256.
 *
 * - A pairing code is typed by a person: 10 characters from an alphabet
 *   without look-alikes (no 0, 1, I or O), shown as XXXXX-XXXXX. That's 50
 *   bits, it works once, for 10 minutes, and redeeming is rate-limited.
 * - An agent token is "fa_" plus 32 random bytes in base64url. The desktop
 *   app keeps it in the OS keychain.
 */
import { createHash, randomBytes } from "node:crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;
export const PAIRING_MINUTES = 10;
export const AGENT_TOKEN_PATTERN = /^fa_[A-Za-z0-9_-]{43}$/;

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** A new code, formatted for reading. 256 is a multiple of 32, so each character is uniform. */
export function newPairingCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b & 31]!).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** What a person typed, as the canonical code: upper case, no spaces or dashes. Null when it can't be a code. */
export function normalizePairingCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

export function newAgentToken(): string {
  return `fa_${randomBytes(32).toString("base64url")}`;
}

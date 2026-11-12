// Passwords, tokens and limits, from Node's own crypto. Nothing here is
// stored as it was typed: passwords are scrypt hashes, and session and reset
// tokens are kept as SHA-256 hashes, so a copy of the data file opens nothing.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password, salt, cost = COST) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, cost, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === "string" ? stored.split("$") : [];
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p), maxmem: COST.maxmem });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Checked against when an email has no account, so a wrong email takes as long as a wrong password.
export const DECOY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

/** 32 random bytes as text: for sessions, reset links and form tokens. */
export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Two strings compared in the same time whatever they hold. */
export function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Lower case, trimmed, and plausibly an email address, or null. */
export function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length >= 3 && email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;

/** Why a new password isn't accepted, or null. */
export function passwordProblem(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) return "Use at least " + PASSWORD_MIN + " characters.";
  if (password.length > PASSWORD_MAX) return "Use at most " + PASSWORD_MAX + " characters.";
  return null;
}

/** A fixed-window counter kept in memory: true while a key is under its limit. */
export function createLimiter(limit, windowMs) {
  const hits = new Map();
  return function allow(key) {
    const now = Date.now();
    const hit = hits.get(key);
    if (!hit || hit.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return true;
    }
    hit.count += 1;
    return hit.count <= limit;
  };
}

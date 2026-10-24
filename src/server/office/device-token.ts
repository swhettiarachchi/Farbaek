/**
 * The device cookie's name and hashes (ADR 0069, 0072), without Next.js
 * request APIs, so the proxy can use them too.
 */
import { createHash } from "node:crypto";

export const DEVICE_COOKIE = "__Host-fb-device";
export const DEVICE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function deviceHash(token: string): string {
  return createHash("sha256").update(`office-device:${token}`).digest("hex");
}

/** A device-add code's hash: the code itself is shown once and never stored. */
export function deviceCodeHash(code: string): string {
  return createHash("sha256").update(`office-invite:${code}`).digest("hex");
}

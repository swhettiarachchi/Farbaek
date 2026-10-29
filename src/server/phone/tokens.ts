/**
 * The values a phone's sign-in passes around (ADR 0110). The phone makes a
 * PKCE verifier (RFC 7636) and sends only its S256 challenge to the browser;
 * Farbaek answers with a one-time code in the farbaek:// callback, stored as
 * its SHA-256. Only the phone holding the verifier can redeem it.
 */
import { createHash, randomBytes } from "node:crypto";

export const PHONE_PLATFORMS = ["ios", "android"] as const;
export type PhonePlatform = (typeof PHONE_PLATFORMS)[number];

/** The app's own scheme. The browser sheet that opened the sign-in returns here. */
export const PHONE_CALLBACK = "farbaek://connected";

export const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
export const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** The phone's own value, returned unchanged so it can match the answer to its request. */
export const STATE_PATTERN = /^[A-Za-z0-9._~-]{8,128}$/;
export const PUSH_TOKEN_PATTERN = /^[0-9a-fA-F]{64,200}$/;
export const APP_VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,32}$/;
/** Sign in with Apple (ADR 0113): the app's raw nonce (Apple's token carries its SHA-256) and Apple's one-time authorization code. */
export const APPLE_NONCE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
export const APPLE_CODE_PATTERN = /^[A-Za-z0-9._-]{8,1024}$/;

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 32 random bytes, so 256 bits: a code can't be guessed in its two minutes. */
export function newConnectCode(): string {
  return randomBytes(32).toString("base64url");
}

/** The S256 challenge for a verifier: base64url of its SHA-256, without padding. */
export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

const DEFAULT_NAMES: Record<PhonePlatform, string> = { ios: "iPhone", android: "Android phone" };

/** A device name the person will recognise in Settings: printable, one line, at most 60 characters. */
export function cleanDeviceName(input: unknown, platform: PhonePlatform): string {
  const raw = typeof input === "string" ? input : "";
  const one = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return (one ? [...one].slice(0, 60).join("").trim() : "") || DEFAULT_NAMES[platform];
}

export function isPhonePlatform(value: unknown): value is PhonePlatform {
  return typeof value === "string" && (PHONE_PLATFORMS as readonly string[]).includes(value);
}

/** The farbaek:// address the browser returns to, with its values encoded. */
export function callbackUrl(params: Record<string, string>): string {
  return `${PHONE_CALLBACK}?${new URLSearchParams(params).toString()}`;
}

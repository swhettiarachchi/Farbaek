/**
 * The device cookie behind Office Space's trusted devices (ADR 0069). Each
 * browser gets a random secret in "__Host-fb-device": Secure, HttpOnly,
 * SameSite=Strict, on this one host, for 400 days (the longest browsers
 * keep a cookie). The database stores only its SHA-256. The name doesn't
 * start with the session cookie's, so Supabase never mistakes it for one.
 */
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { deviceLabel } from "@/core/office/devices";
import { DEVICE_COOKIE, DEVICE_TOKEN as TOKEN, deviceHash } from "./device-token";

export { DEVICE_COOKIE, deviceHash };

/** The device's hash, if this browser already has a device cookie. For pages and checks. */
export async function currentDeviceHash(): Promise<string | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  return token && TOKEN.test(token) ? deviceHash(token) : null;
}

/**
 * The device's hash and name, giving this browser a device cookie first if it
 * has none. Only Server Actions can set cookies, so only they call this.
 */
export async function ensureDevice(): Promise<{ hash: string; label: string }> {
  const store = await cookies();
  let token = store.get(DEVICE_COOKIE)?.value;
  if (!token || !TOKEN.test(token)) {
    token = randomBytes(32).toString("base64url");
    store.set(DEVICE_COOKIE, token, { path: "/", secure: true, httpOnly: true, sameSite: "strict", maxAge: 400 * 24 * 3600 });
  }
  return { hash: deviceHash(token), label: deviceLabel((await headers()).get("user-agent")) };
}

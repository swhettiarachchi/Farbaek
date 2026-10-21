/**
 * What the office records about where a request came from: a short hash of
 * the network address (never the address itself), the browser's user agent
 * and a request id. The address is a hint for limits and alerts, never a
 * gate: proxies can forward whatever the client sent (ADR 0032).
 */
import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";

export interface RequestMeta {
  ipHash: string;
  userAgent: string | null;
  requestId: string;
}

export function hashAddress(address: string): string {
  return createHash("sha256").update(`office-ip:${address}`).digest("hex").slice(0, 32);
}

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const address = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  const ua = h.get("user-agent");
  return { ipHash: hashAddress(address), userAgent: ua ? ua.slice(0, 300) : null, requestId: randomUUID() };
}

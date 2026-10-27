/**
 * Dodo's webhooks follow Standard Webhooks (verified 2026-10-27): HMAC-SHA256
 * of "<webhook-id>.<webhook-timestamp>.<raw body>" with the endpoint's secret
 * (base64 after "whsec_"), sent as space-separated "v1,<base64>" entries, so
 * a rotated secret's old and new signatures can both be present. Nothing in
 * the body is read until the signature and the timestamp check out.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ProviderEvent } from "@/core/billing/provider";

/** Dodo's tolerance, either way, for a delivery's timestamp. */
export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

export type WebhookRejection = "missing_headers" | "bad_timestamp" | "stale" | "bad_signature" | "bad_payload";
export type WebhookVerdict = { ok: true; event: ProviderEvent } | { ok: false; reason: WebhookRejection };

const WEBHOOK_ID = /^[A-Za-z0-9_.:-]{1,200}$/;

const Body = z.object({
  type: z.string().regex(/^[a-z_]+\.[a-z_]+$/).max(80),
  timestamp: z.string().max(60),
  data: z.record(z.string(), z.unknown()),
});

/** The signing key: the secret without "whsec_", base64-decoded. */
export function signingKey(secret: string): Buffer {
  return Buffer.from(secret.trim().replace(/^whsec_/, ""), "base64");
}

export function signWebhook(id: string, timestampSeconds: number, body: string, secret: string): string {
  return createHmac("sha256", signingKey(secret)).update(`${id}.${timestampSeconds}.${body}`).digest("base64");
}

function anyMatches(header: string, expected: string): boolean {
  const want = Buffer.from(expected, "base64");
  let found = false;
  for (const entry of header.split(" ")) {
    const [version, sig] = entry.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    // Every entry is compared, so timing doesn't show which one matched.
    if (given.length === want.length && timingSafeEqual(given, want)) found = true;
  }
  return found;
}

const text = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

export function verifyDodoWebhook(raw: string, headers: Headers, secret: string, now: Date): WebhookVerdict {
  const id = headers.get("webhook-id") ?? "";
  const timestamp = headers.get("webhook-timestamp") ?? "";
  const signature = headers.get("webhook-signature") ?? "";
  if (!WEBHOOK_ID.test(id) || !timestamp || !signature) return { ok: false, reason: "missing_headers" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "bad_timestamp" };
  const seconds = Number(timestamp);
  if (Math.abs(now.getTime() - seconds * 1000) > WEBHOOK_TOLERANCE_MS) return { ok: false, reason: "stale" };
  if (!anyMatches(signature, signWebhook(id, seconds, raw, secret))) return { ok: false, reason: "bad_signature" };

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(JSON.parse(raw));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  const eventAt = new Date(body.timestamp);
  const metadata = body.data.metadata && typeof body.data.metadata === "object" ? (body.data.metadata as Record<string, unknown>) : {};
  return {
    ok: true,
    event: {
      provider: "dodo",
      webhookId: id,
      type: body.type,
      eventAt: Number.isFinite(eventAt.getTime()) ? eventAt : new Date(seconds * 1000),
      subscriptionId: text(body.data.subscription_id),
      orgId: text(metadata.farbaek_org, 36),
      payload: body,
    },
  };
}

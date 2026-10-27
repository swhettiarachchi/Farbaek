import { after } from "next/server";
import { receiveWebhook } from "@/server/billing/webhooks";
import { billingWebhookDeps } from "@/server/billing/wiring";

/**
 * Dodo Payments' webhooks (ADR 0100). Verified on the raw body, stored once
 * by id, answered right away and processed after the response. 503 while
 * payments aren't connected, so Dodo keeps retrying instead of losing one.
 */
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return receiveWebhook(request, billingWebhookDeps(), (work) => after(work));
}

"use server";

import { refresh } from "next/cache";
import type { OfficeFormState } from "@/components/office/action-form";
import { PLAN_CATALOG_VERSION, SELF_SERVE_PLANS } from "@/core/billing/catalog";
import { isPaidPlanId } from "@/core/billing/provider-state";
import { readBillingConfig } from "@/server/billing/config";
import { createDodoClient } from "@/server/billing/providers/dodo/client";
import { processWebhooks } from "@/server/billing/webhooks";
import { billingWebhookDeps } from "@/server/billing/wiring";
import { log } from "@/server/observability/log";
import { staffAction } from "@/server/office/access";
import { readPaymentsPage } from "@/server/office/payments-data";
import { requestMeta } from "@/server/office/request-meta";
import { OFFICE_MESSAGES } from "@/server/office/staff-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates the products checkout charges for (ADR 0100): one monthly product
 * at Dodo Payments for each paid plan in the current price list that doesn't
 * have one, in the server's mode (test only, for now). Owners only.
 */
export async function createProductsAction(): Promise<OfficeFormState> {
  const gate = await staffAction("billing.products");
  if (!gate.ok) return { ok: false, message: gate.message };
  const config = readBillingConfig();
  if (!config) return { ok: false, message: "Payments aren't connected on this server, so no product can be created. Nothing changed." };
  const page = await readPaymentsPage(gate.ctx.admin);
  if (!page) return { ok: false, message: OFFICE_MESSAGES.UNKNOWN };
  const have = new Set(page.products.filter((p) => p.mode === config.mode && p.catalogVersion === PLAN_CATALOG_VERSION).map((p) => p.planId));
  const missing = SELF_SERVE_PLANS.filter((p) => p.pricing.kind === "paid" && isPaidPlanId(p.id) && !have.has(p.id));
  if (missing.length === 0) return { ok: true, message: "Every paid plan already has a product for the current price list." };

  const dodo = createDodoClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, mode: config.mode });
  const meta = await requestMeta();
  const made: string[] = [];
  for (const plan of missing) {
    if (plan.pricing.kind !== "paid" || !isPaidPlanId(plan.id)) continue;
    const created = await dodo.createProduct({ planId: plan.id, name: `Farbaek ${plan.name}`, description: plan.summary, amountCents: plan.pricing.monthlyCents, currency: "USD" });
    if (!created.ok) {
      log("warn", "billing.product_create_failed", { plan: plan.id, code: created.code });
      refresh();
      return { ok: false, message: `${made.length ? `Created ${made.join(", ")}. ` : ""}Dodo Payments refused ${plan.name} (${created.code}). Try again; plans that have a product are skipped.` };
    }
    const recorded = await gate.ctx.store.recordBillingProduct(
      { userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId },
      { mode: config.mode, planId: plan.id, productId: created.value.productId, amountCents: plan.pricing.monthlyCents, currency: "USD", catalogVersion: PLAN_CATALOG_VERSION },
      meta,
    );
    if (!recorded.ok) {
      refresh();
      return { ok: false, message: `${plan.name} was created at Dodo Payments (${created.value.productId}) but couldn't be recorded: ${OFFICE_MESSAGES[recorded.code]} Archive it in Dodo's dashboard before trying again.` };
    }
    made.push(plan.name);
  }
  refresh();
  return { ok: true, message: `Created ${made.length} ${made.length === 1 ? "product" : "products"} in Dodo's ${config.mode} mode: ${made.join(", ")}.` };
}

/** Queues a failed or dead webhook again and processes it now. Processing re-reads the subscription, so it's safe to repeat. */
export async function replayWebhookAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("billing.replay");
  if (!gate.ok) return { ok: false, message: gate.message };
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, message: "Choose an event to replay." };
  const r = await gate.ctx.store.replayWebhook({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { id }, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  const deps = billingWebhookDeps();
  const result = deps ? await processWebhooks(deps, id).catch(() => null) : null;
  refresh();
  if (!deps) return { ok: true, message: "Queued again. Payments aren't connected on this server, so it runs once they are." };
  return { ok: true, message: result && result.claimed > 0 ? `Replayed: ${Object.entries(result.outcomes).map(([k, n]) => `${n} ${k}`).join(", ")}.` : "Queued again. The hourly run picks it up." };
}

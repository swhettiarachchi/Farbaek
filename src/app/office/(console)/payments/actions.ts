"use server";

import { refresh } from "next/cache";
import type { OfficeFormState } from "@/components/office/action-form";
import { BILLABLE_PLANS, PLAN_CATALOG_VERSION, chargeCents, formatUsd } from "@/core/billing/catalog";
import { TOPUP_PACKS_CENTS } from "@/core/billing/topups";
import { isPaidPlanId } from "@/core/billing/provider-state";
import { readProviderConfig } from "@/server/billing/config";
import { createDodoClient } from "@/server/billing/providers/dodo/client";
import { processWebhooks } from "@/server/billing/webhooks";
import { billingWebhookDeps } from "@/server/billing/wiring";
import { log } from "@/server/observability/log";
import { staffAction } from "@/server/office/access";
import { readPaymentsPage } from "@/server/office/payments-data";
import { requestMeta } from "@/server/office/request-meta";
import { verifyStepUp } from "@/server/office/step-up";
import { notePaymentsLive } from "@/server/platform/state";
import { PAID_TERMS_VERSION } from "@/config/legal";
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
  // Before going live too, so live products exist when checkout opens (ADR 0104).
  const config = readProviderConfig();
  if (!config) return { ok: false, message: "This server has no Dodo keys, so no product can be created. Nothing changed." };
  const page = await readPaymentsPage(gate.ctx.admin);
  if (!page) return { ok: false, message: OFFICE_MESSAGES.UNKNOWN };
  const have = new Set(page.products.filter((p) => p.mode === config.mode && p.catalogVersion === PLAN_CATALOG_VERSION).map((p) => p.planId));
  const missing = BILLABLE_PLANS.filter((p) => p.pricing.kind === "paid" && isPaidPlanId(p.id) && !have.has(p.id));
  const havePacks = new Set(page.topups.filter((t) => t.mode === config.mode && t.catalogVersion === PLAN_CATALOG_VERSION).map((t) => t.packCents));
  const missingPacks = TOPUP_PACKS_CENTS.filter((c) => !havePacks.has(c));
  if (missing.length === 0 && missingPacks.length === 0) return { ok: true, message: "Every paid plan and top-up pack already has a product for the current price list." };

  const dodo = createDodoClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, mode: config.mode });
  const meta = await requestMeta();
  const made: string[] = [];
  for (const plan of missing) {
    if (plan.pricing.kind !== "paid" || !isPaidPlanId(plan.id)) continue;
    const created = await dodo.createProduct({ planId: plan.id, interval: plan.pricing.interval, name: `Farbaek ${plan.name}`, description: plan.summary, amountCents: chargeCents(plan), currency: "USD" });
    if (!created.ok) {
      log("warn", "billing.product_create_failed", { plan: plan.id, code: created.code });
      refresh();
      return { ok: false, message: `${made.length ? `Created ${made.join(", ")}. ` : ""}Dodo Payments refused ${plan.name} (${created.code}). Try again; plans that have a product are skipped.` };
    }
    const recorded = await gate.ctx.store.recordBillingProduct(
      { userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId },
      { mode: config.mode, planId: plan.id, interval: plan.pricing.interval, productId: created.value.productId, amountCents: chargeCents(plan), currency: "USD", catalogVersion: PLAN_CATALOG_VERSION },
      meta,
    );
    if (!recorded.ok) {
      refresh();
      return { ok: false, message: `${plan.name} was created at Dodo Payments (${created.value.productId}) but couldn't be recorded: ${OFFICE_MESSAGES[recorded.code]} Archive it in Dodo's dashboard before trying again.` };
    }
    made.push(plan.name);
  }
  // Top-up packs (ADR 0102): one-time products, tax added at checkout.
  for (const cents of missingPacks) {
    const created = await dodo.createProduct({ once: true, name: `Farbaek AI usage top-up ${formatUsd(cents)}`, description: "More AI usage for a paid Farbaek plan, at the plan's own rate, lasting 12 months.", amountCents: cents, currency: "USD" });
    if (!created.ok) {
      refresh();
      return { ok: false, message: `${made.length ? `Created ${made.join(", ")}. ` : ""}Dodo Payments refused the ${formatUsd(cents)} top-up (${created.code}). Try again; products that exist are skipped.` };
    }
    const recorded = await gate.ctx.store.recordTopupProduct({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { mode: config.mode, packCents: cents, productId: created.value.productId, catalogVersion: PLAN_CATALOG_VERSION }, meta);
    if (!recorded.ok) {
      refresh();
      return { ok: false, message: `The ${formatUsd(cents)} top-up was created at Dodo Payments (${created.value.productId}) but couldn't be recorded: ${OFFICE_MESSAGES[recorded.code]} Archive it in Dodo's dashboard before trying again.` };
    }
    made.push(`${formatUsd(cents)} top-up`);
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

/**
 * Turns live payments on (ADR 0104): owners only, with the Terms version they approve, a reason and a fresh
 * authenticator code, all checked again in the database. It ends every test-mode plan and test top-up.
 */
export async function goLiveAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("billing.go_live");
  if (!gate.ok) return { ok: false, message: gate.message };
  if (form.get("terms") !== PAID_TERMS_VERSION) return { ok: false, message: `Tick the box to approve the Terms' Paid plans section, version ${PAID_TERMS_VERSION}.` };
  if (!readProviderConfig() || readProviderConfig()!.mode !== "live") return { ok: false, message: "This server doesn't have live Dodo keys yet. Run set-dodo.ps1 -Live first. Nothing changed." };
  const meta = await requestMeta();
  const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
  if (!step.ok) return { ok: false, message: step.message };
  const r = await gate.ctx.store.confirmPaymentsLive({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { termsVersion: PAID_TERMS_VERSION, reason: String(form.get("reason") ?? "").trim() }, meta);
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  notePaymentsLive(new Date().toISOString());
  log("info", "billing.payments_live", { by: gate.ctx.user.id, ...r.value });
  refresh();
  return { ok: true, message: `Live payments are on: checkout is open to every workspace. ${r.value.testPlansEnded} test ${r.value.testPlansEnded === 1 ? "plan" : "plans"} and ${r.value.testTopupsEnded} test ${r.value.testTopupsEnded === 1 ? "top-up" : "top-ups"} ended.` };
}

/** Turns live payments off: new checkouts stop; subscriptions already running stay at Dodo. Owners, with a reason and a code. */
export async function endLiveAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("billing.go_live");
  if (!gate.ok) return { ok: false, message: gate.message };
  const meta = await requestMeta();
  const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
  if (!step.ok) return { ok: false, message: step.message };
  const r = await gate.ctx.store.endPaymentsLive({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { reason: String(form.get("reason") ?? "").trim() }, meta);
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  notePaymentsLive(null);
  refresh();
  return { ok: true, message: "Live payments are off. New checkouts stopped; subscriptions already running continue at Dodo Payments." };
}

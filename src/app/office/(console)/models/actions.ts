"use server";

import { refresh } from "next/cache";
import type { OfficeFormState } from "@/components/office/action-form";
import { CANARY_SUITE } from "@/content/canary-suite";
import { TIERS, tierModels, type Tier } from "@/core/agent/routing";
import { pricedModel } from "@/core/ai/model-canary";
import { hasAnthropicKey } from "@/server/ai/config";
import { canaryRunDeps } from "@/server/ai/model-canary-wiring";
import { estimateSuite, runCanary } from "@/server/ai/model-canary-runner";
import { log } from "@/server/observability/log";
import { staffAction } from "@/server/office/access";
import { requestMeta } from "@/server/office/request-meta";
import { OFFICE_MESSAGES } from "@/server/office/staff-store";
import { verifyStepUp } from "@/server/office/step-up";
import { notePlatformModel, platformModels, platformPause, refreshPlatformState } from "@/server/platform/state";

const MODEL_ID = /^[a-z0-9][a-z0-9.-]{2,80}$/;
const tierOf = (v: FormDataEntryValue | null): Tier | null => (TIERS as readonly string[]).includes(String(v)) ? (v as Tier) : null;

/**
 * Starts a canary of a candidate against a tier's model (ADR 0090). It runs
 * in the background on Farbaek's own sample tasks and spends Farbaek's
 * Anthropic credit, so it needs a reason; the database allows one at a time
 * and three a day.
 */
export async function startCanaryAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("models.canary");
  if (!gate.ok) return { ok: false, message: gate.message };
  const tier = tierOf(form.get("tier"));
  const candidate = String(form.get("candidate") ?? "").trim();
  if (!tier || !MODEL_ID.test(candidate)) return { ok: false, message: "Choose a tier and a candidate model." };
  if (!hasAnthropicKey()) return { ok: false, message: "This server has no Anthropic key, so a canary can't run." };
  await refreshPlatformState(true);
  const paused = platformPause("ai_runs");
  if (paused) return { ok: false, message: `AI is paused for everyone, so a canary can't run: ${paused}` };
  const current = tierModels("anthropic", platformModels())[tier];
  if (candidate === current) return { ok: false, message: `The ${tier} tier already uses ${current}. Choose another model to compare.` };

  const estimate = estimateSuite(current, candidate);
  const r = await gate.ctx.store.startCanary(
    { userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId },
    { tier, current, candidate, estimateUnits: estimate.units, reason: String(form.get("reason") ?? "").trim() },
    await requestMeta(),
  );
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  // In the background, like a cloud run: the page refreshes until the report is in.
  void runCanary(canaryRunDeps(gate.ctx.admin), { id: r.value, tier, current, candidate }).then((status) => log("info", "canary.done", { run: r.value, status }));
  refresh();
  return { ok: true, message: `Canary started: ${CANARY_SUITE.length} sample tasks on ${current} and ${candidate}. The report appears here in a few minutes.` };
}

/** Switches a tier to a candidate a recent canary compared (ADR 0090). Owners only, with a reason and a fresh authenticator code. */
export async function switchModelAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("models.switch");
  if (!gate.ok) return { ok: false, message: gate.message };
  const tier = tierOf(form.get("tier"));
  const model = pricedModel(String(form.get("model") ?? ""));
  const canaryId = String(form.get("canaryId") ?? "");
  if (!tier) return { ok: false, message: "Choose a tier." };
  if (!model) return { ok: false, message: OFFICE_MESSAGES.UNPRICED_MODEL };
  const meta = await requestMeta();
  const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
  if (!step.ok) return { ok: false, message: step.message };
  const r = await gate.ctx.store.setModel(
    { userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId },
    { tier, model, canaryId, reason: String(form.get("reason") ?? "").trim() },
    "step_up",
    meta,
  );
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  notePlatformModel(tier, model);
  refresh();
  return { ok: true, message: `The ${tier} tier now uses ${model} for every workspace. Other servers pick it up within 15 seconds.` };
}

/** Returns a tier to the model Farbaek ships with. Owners only, with a reason and a fresh authenticator code. */
export async function restoreDefaultModelAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("models.switch");
  if (!gate.ok) return { ok: false, message: gate.message };
  const tier = tierOf(form.get("tier"));
  if (!tier) return { ok: false, message: "Choose a tier." };
  const meta = await requestMeta();
  const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
  if (!step.ok) return { ok: false, message: step.message };
  const r = await gate.ctx.store.setModel(
    { userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId },
    { tier, model: null, canaryId: null, reason: String(form.get("reason") ?? "").trim() },
    "step_up",
    meta,
  );
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  notePlatformModel(tier, null);
  refresh();
  return { ok: true, message: `The ${tier} tier is back on ${tierModels("anthropic")[tier]}. Other servers pick it up within 15 seconds.` };
}

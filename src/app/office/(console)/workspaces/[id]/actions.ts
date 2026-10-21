"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { OfficeFormState } from "@/components/office/action-form";
import { USD_PER_UNIT } from "@/core/billing/rate-card";
import { needsStepUp } from "@/core/office/permissions";
import { abortCloudRuns } from "@/server/cloud-agent/executor";
import { staffAction } from "@/server/office/access";
import { requestMeta } from "@/server/office/request-meta";
import { OFFICE_MESSAGES } from "@/server/office/staff-store";
import { verifyStepUp } from "@/server/office/step-up";

const Uuid = z.uuid();
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** Suspends a workspace: members can read but not change anything, its sites stop serving, live runs stop. */
export async function suspendWorkspaceAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("workspace.suspend");
  if (!gate.ok) return { ok: false, message: gate.message };
  const orgId = Uuid.safeParse(form.get("orgId"));
  if (!orgId.success) return { ok: false, message: OFFICE_MESSAGES.WORKSPACE_MISSING };
  const r = await gate.ctx.store.suspendWorkspace(
    { userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId },
    { orgId: orgId.data, confirmName: text(form, "confirmName"), notice: text(form, "notice"), reason: text(form, "reason") },
    await requestMeta(),
  );
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  const stopped = abortCloudRuns({ orgId: orgId.data });
  refresh();
  return { ok: true, message: `Suspended. Members see your notice, its sites show "temporarily unavailable"${stopped ? `, and ${stopped} live ${stopped === 1 ? "run was" : "runs were"} stopped` : ""}.` };
}

export async function restoreWorkspaceAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("workspace.suspend");
  if (!gate.ok) return { ok: false, message: gate.message };
  const orgId = Uuid.safeParse(form.get("orgId"));
  if (!orgId.success) return { ok: false, message: OFFICE_MESSAGES.WORKSPACE_MISSING };
  const r = await gate.ctx.store.restoreWorkspace({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { orgId: orgId.data, reason: text(form, "reason") }, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message: "Restored. Members can work again and its sites serve as before." };
}

/** Adds days to a trial. The database holds the caps: support 7 once, admins 14, owners 30, never past 44 days in all. */
export async function extendTrialAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("trial.extend");
  if (!gate.ok) return { ok: false, message: gate.message };
  const orgId = Uuid.safeParse(form.get("orgId"));
  const days = Number(text(form, "days"));
  if (!orgId.success) return { ok: false, message: OFFICE_MESSAGES.WORKSPACE_MISSING };
  if (!Number.isInteger(days) || days < 1) return { ok: false, message: OFFICE_MESSAGES.INVALID_DAYS };
  const r = await gate.ctx.store.extendTrial({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { orgId: orgId.data, days, reason: text(form, "reason") }, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  const ends = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(r.value));
  return { ok: true, message: `Extended by ${days} ${days === 1 ? "day" : "days"}. The trial now ends ${ends} (UTC), and its AI usage lasts until then too.` };
}

/** AI usage added by Farbaek, entered in dollars of list cost and stored as units. Never a payment. */
export async function addUsageAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("usage.add");
  if (!gate.ok) return { ok: false, message: gate.message };
  const orgId = Uuid.safeParse(form.get("orgId"));
  const dollars = Number(text(form, "dollars"));
  const days = Number(text(form, "days"));
  if (!orgId.success) return { ok: false, message: OFFICE_MESSAGES.WORKSPACE_MISSING };
  if (!Number.isFinite(dollars) || dollars <= 0) return { ok: false, message: "Enter an amount in dollars, such as 5." };
  const units = Math.round(dollars / USD_PER_UNIT);
  const meta = await requestMeta();
  let strength: "aal2" | "step_up" = "aal2";
  if (needsStepUp("usage.add", { units })) {
    const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
    if (!step.ok) return { ok: false, message: step.message };
    strength = "step_up";
  }
  const r = await gate.ctx.store.addUsage({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { orgId: orgId.data, units, days, reason: text(form, "reason") }, strength, meta);
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message: `Added $${dollars.toFixed(2)} of AI usage for ${days} ${days === 1 ? "day" : "days"}. The workspace sees it as "Added by Farbaek".` };
}

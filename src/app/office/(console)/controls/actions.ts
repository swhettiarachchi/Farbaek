"use server";

import { refresh } from "next/cache";
import type { OfficeFormState } from "@/components/office/action-form";
import { FLAG_DETAILS, isPlatformFlag } from "@/core/office/flags";
import { abortCloudRuns } from "@/server/cloud-agent/executor";
import { staffAction } from "@/server/office/access";
import { requestMeta } from "@/server/office/request-meta";
import { OFFICE_MESSAGES } from "@/server/office/staff-store";
import { verifyStepUp } from "@/server/office/step-up";
import { notePlatformFlag } from "@/server/platform/state";

/** Flips a platform switch. Owners only, with a reason and a fresh authenticator code both ways. */
export async function setFlagAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("flags.set");
  if (!gate.ok) return { ok: false, message: gate.message };
  const key = form.get("key");
  if (!isPlatformFlag(key)) return { ok: false, message: OFFICE_MESSAGES.INVALID_FLAG };
  const paused = form.get("paused") === "true";
  const message = String(form.get("message") ?? "").trim() || null;
  const meta = await requestMeta();
  const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
  if (!step.ok) return { ok: false, message: step.message };
  const r = await gate.ctx.store.setFlag(
    { userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId },
    { key, paused, message, reason: String(form.get("reason") ?? "").trim() },
    "step_up",
    meta,
  );
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  notePlatformFlag(key, paused, message);
  const stopped = paused && key === "ai_runs" ? abortCloudRuns("all") : 0;
  refresh();
  const label = FLAG_DETAILS[key].label;
  return {
    ok: true,
    message: paused ? `${label} paused for everyone${stopped ? `; ${stopped} live ${stopped === 1 ? "run" : "runs"} stopped` : ""}. Other servers pick it up within 15 seconds.` : `${label} back on for everyone.`,
  };
}

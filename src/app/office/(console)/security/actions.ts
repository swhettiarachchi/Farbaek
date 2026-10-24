"use server";

import { refresh } from "next/cache";
import type { OfficeFormState } from "@/components/office/action-form";
import { staffAction } from "@/server/office/access";
import { formatDeviceCode, newDeviceCode } from "@/core/office/device-codes";
import { deviceCodeHash } from "@/server/office/device-token";
import { currentDeviceHash } from "@/server/office/devices";
import { requestMeta } from "@/server/office/request-meta";
import { startEnrollment } from "@/server/office/sign-in";
import { OFFICE_MESSAGES } from "@/server/office/staff-store";
import { verifyStepUp } from "@/server/office/step-up";
import { officeAuth } from "@/server/office/supabase-auth";

export type AddState = { status: "idle" } | { status: "ready"; factorId: string; qr: string; secret: string } | { status: "error"; message: string };

/** A second (or third) authenticator, so a lost phone never locks anyone out. */
export async function addAuthenticatorAction(): Promise<AddState> {
  const gate = await staffAction("console.read");
  if (!gate.ok) return { status: "error", message: gate.message };
  const r = await startEnrollment({ auth: officeAuth(gate.ctx.client), store: gate.ctx.store, office: gate.ctx.office, meta: await requestMeta(), now: () => new Date() });
  if (r.status === "ready") return { status: "ready", factorId: r.factorId, qr: r.qr, secret: r.secret };
  return { status: "error", message: r.status === "error" ? r.message : OFFICE_MESSAGES.STAFF_SESSION_ENDED };
}

export async function confirmAuthenticatorAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("console.read");
  if (!gate.ok) return { ok: false, message: gate.message };
  const factorId = form.get("factorId");
  const code = String(form.get("code") ?? "").replace(/\s+/g, "");
  if (typeof factorId !== "string" || !/^\d{6}$/.test(code)) return { ok: false, message: "Enter the 6 digits the new app shows." };
  const auth = officeAuth(gate.ctx.client);
  if (!(await auth.verifyTotp(factorId, code))) return { ok: false, message: "That code didn't work. Use the current code from the new app." };
  await gate.ctx.store.noteEnrollment({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, await requestMeta());
  refresh();
  return { ok: true, message: "Added. You can now sign in with either authenticator." };
}

export async function removeAuthenticatorAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("console.read");
  if (!gate.ok) return { ok: false, message: gate.message };
  const factorId = form.get("factorId");
  const auth = officeAuth(gate.ctx.client);
  const factors = await auth.verifiedTotp();
  if (typeof factorId !== "string" || !factors.some((f) => f.id === factorId)) return { ok: false, message: "That authenticator isn't on your account." };
  if (factors.length < 2) return { ok: false, message: "Add another authenticator first. Office Space always needs one." };
  const meta = await requestMeta();
  const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
  if (!step.ok) return { ok: false, message: step.message };
  await auth.unenroll(factorId);
  await gate.ctx.store.record({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { strength: "step_up", action: "factor.removed", targetType: "factor", targetId: factorId, result: "success" }, meta);
  refresh();
  return { ok: true, message: "Removed. Its codes no longer work." };
}

export async function endOtherSessionsAction(): Promise<OfficeFormState> {
  const gate = await staffAction("console.read");
  if (!gate.ok) return { ok: false, message: gate.message };
  const r = await gate.ctx.store.endSessions({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, gate.ctx.user.id, null, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message: r.value === 0 ? "You had no other office sessions." : `Ended ${r.value} other ${r.value === 1 ? "session" : "sessions"}.` };
}

/**
 * Approves one of your own waiting devices (ADR 0069), from this trusted one,
 * with the code the new device shows and a fresh authenticator code.
 */
export async function approveDeviceAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("devices.own");
  if (!gate.ok) return { ok: false, message: gate.message };
  const deviceId = String(form.get("deviceId") ?? "");
  const code = String(form.get("code") ?? "").replace(/\s+/g, "");
  if (!/^[0-9a-f-]{36}$/.test(deviceId)) return { ok: false, message: OFFICE_MESSAGES.DEVICE_NOT_FOUND };
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Enter the 6-digit code the new device shows." };
  const fromHash = await currentDeviceHash();
  if (!fromHash) return { ok: false, message: OFFICE_MESSAGES.DEVICE_NOT_TRUSTED };
  const meta = await requestMeta();
  const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
  if (!step.ok) return { ok: false, message: step.message };
  const r = await gate.ctx.store.approveDevice({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { fromHash, deviceId, code }, "step_up", meta);
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  if (!r.value.ok) {
    const left = r.value.tries_left ?? 0;
    return { ok: false, message: left > 0 ? `That isn't the code the device shows. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes, so that request was cancelled. Sign in again on the device for a new code." };
  }
  refresh();
  return { ok: true, message: "Approved. On that device, select Continue." };
}

/** Removes one of your own devices (ADR 0069). It's out at its next request. */
export async function revokeDeviceAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("devices.own");
  if (!gate.ok) return { ok: false, message: gate.message };
  const deviceId = String(form.get("deviceId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(deviceId)) return { ok: false, message: OFFICE_MESSAGES.DEVICE_NOT_FOUND };
  const r = await gate.ctx.store.revokeDevice({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, deviceId, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message: "Removed. That device can't open the office until it's approved again." };
}

export type InviteState = { status: "idle" } | { status: "ready"; code: string; expiresAt: string } | { status: "error"; message: string };

/**
 * A one-time code that adds a new device (ADR 0072), made on this trusted
 * device with a fresh authenticator code. Shown once; only its hash is kept.
 */
export async function createDeviceInviteAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  const gate = await staffAction("devices.own");
  if (!gate.ok) return { status: "error", message: gate.message };
  const fromHash = await currentDeviceHash();
  if (!fromHash) return { status: "error", message: OFFICE_MESSAGES.DEVICE_NOT_TRUSTED };
  const meta = await requestMeta();
  const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
  if (!step.ok) return { status: "error", message: step.message };
  const code = newDeviceCode();
  const r = await gate.ctx.store.createDeviceInvite({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { fromHash, codeHash: deviceCodeHash(code) }, "step_up", meta);
  if (!r.ok) return { status: "error", message: OFFICE_MESSAGES[r.code] };
  return { status: "ready", code: formatDeviceCode(code), expiresAt: r.value };
}

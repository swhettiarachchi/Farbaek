"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { OfficeFormState } from "@/components/office/action-form";
import { OFFICE_POLICY } from "@/config/office";
import { ROLE_LABELS, STAFF_ROLES } from "@/core/office/permissions";
import { staffAction, type StaffContext } from "@/server/office/access";
import { requestMeta, type RequestMeta } from "@/server/office/request-meta";
import { OFFICE_MESSAGES, type StoreResult } from "@/server/office/staff-store";
import { verifyStepUp } from "@/server/office/step-up";

/**
 * Staff management (owners only, ADR 0032). Every change needs a reason and
 * a fresh authenticator code, and the database checks the role, the session
 * and the last-owner rule again before it records the event.
 */
type Severe = { ctx: StaffContext; meta: RequestMeta; reason: string };

async function severe(form: FormData): Promise<{ ok: true; s: Severe } | { ok: false; state: OfficeFormState }> {
  const gate = await staffAction("staff.manage");
  if (!gate.ok) return { ok: false, state: { ok: false, message: gate.message } };
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < OFFICE_POLICY.reasonMin || reason.length > OFFICE_POLICY.reasonMax) return { ok: false, state: { ok: false, message: OFFICE_MESSAGES.REASON_REQUIRED } };
  const meta = await requestMeta();
  const step = await verifyStepUp(gate.ctx, form.get("totp"), meta);
  if (!step.ok) return { ok: false, state: { ok: false, message: step.message } };
  return { ok: true, s: { ctx: gate.ctx, meta, reason } };
}

function done<T>(r: StoreResult<T>, message: string): OfficeFormState {
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message };
}

const actor = (ctx: StaffContext) => ({ userId: ctx.user.id, sessionId: ctx.sessionId });
const Role = z.enum(STAFF_ROLES);
const Uuid = z.uuid();

export async function inviteStaffAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const role = Role.safeParse(form.get("role"));
  const days = Number(form.get("days"));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!role.success) return { ok: false, message: OFFICE_MESSAGES.INVALID_ROLE };
  if (!z.email().safeParse(email).success) return { ok: false, message: OFFICE_MESSAGES.INVALID_EMAIL };
  const g = await severe(form);
  if (!g.ok) return g.state;
  const r = await g.s.ctx.store.invite(actor(g.s.ctx), { email, role: role.data, days, reason: g.s.reason }, "step_up", g.s.meta);
  return done(r, `Invited ${email} as ${ROLE_LABELS[role.data]} for ${days} ${days === 1 ? "day" : "days"}. Tell them to sign in at ${g.s.ctx.office.origin} with that address; Farbaek doesn't send invite emails yet.`);
}

export async function revokeInviteAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("staff.manage");
  if (!gate.ok) return { ok: false, message: gate.message };
  const id = Uuid.safeParse(form.get("inviteId"));
  if (!id.success) return { ok: false, message: OFFICE_MESSAGES.INVITE_NOT_FOUND };
  const reason = String(form.get("reason") ?? "").trim();
  const r = await gate.ctx.store.revokeInvite(actor(gate.ctx), id.data, reason, await requestMeta());
  return done(r, "Invite withdrawn. The address can't use it any more.");
}

export async function changeRoleAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const target = Uuid.safeParse(form.get("userId"));
  const role = Role.safeParse(form.get("role"));
  if (!target.success || !role.success) return { ok: false, message: OFFICE_MESSAGES.INVALID_ROLE };
  const g = await severe(form);
  if (!g.ok) return g.state;
  const r = await g.s.ctx.store.changeRole(actor(g.s.ctx), target.data, role.data, g.s.reason, "step_up", g.s.meta);
  return done(r, `Role changed to ${ROLE_LABELS[role.data]}. It applies from their next click.`);
}

export async function removeStaffAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const target = Uuid.safeParse(form.get("userId"));
  if (!target.success) return { ok: false, message: OFFICE_MESSAGES.NOT_STAFF };
  const g = await severe(form);
  if (!g.ok) return g.state;
  const r = await g.s.ctx.store.remove(actor(g.s.ctx), target.data, g.s.reason, "step_up", g.s.meta);
  return done(r, "Removed from the staff. Their office sessions ended, and the record stays in the log.");
}

export async function endSessionsAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("staff.manage");
  if (!gate.ok) return { ok: false, message: gate.message };
  const target = Uuid.safeParse(form.get("userId"));
  if (!target.success) return { ok: false, message: OFFICE_MESSAGES.NOT_STAFF };
  const r = await gate.ctx.store.endSessions(actor(gate.ctx), target.data, String(form.get("reason") ?? "").trim(), await requestMeta());
  return done(r, "Their office sessions ended. They'll need both codes to come back.");
}

/**
 * For a lost phone: opens a 24-hour window for a new authenticator, ends
 * their sessions and removes their old factors. Confirm who they are on a
 * call before doing this; their mailbox alone isn't enough.
 */
export async function resetAuthenticatorAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const target = Uuid.safeParse(form.get("userId"));
  if (!target.success) return { ok: false, message: OFFICE_MESSAGES.NOT_STAFF };
  const g = await severe(form);
  if (!g.ok) return g.state;
  const r = await g.s.ctx.store.allowMfaReset(actor(g.s.ctx), target.data, g.s.reason, "step_up", g.s.meta);
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  const { data } = await g.s.ctx.admin.auth.admin.mfa.listFactors({ userId: target.data });
  let removed = 0;
  for (const f of data?.factors ?? []) {
    const { error } = await g.s.ctx.admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: target.data });
    if (!error) removed += 1;
  }
  await g.s.ctx.store.record(actor(g.s.ctx), { strength: "step_up", action: "factor.reset_done", targetType: "staff", targetId: target.data, result: "success", detail: { removed } }, g.s.meta);
  refresh();
  return { ok: true, message: `They can add a new authenticator within 24 hours, at their next sign-in. ${removed} old ${removed === 1 ? "authenticator was" : "authenticators were"} removed.` };
}

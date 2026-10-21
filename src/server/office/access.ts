/**
 * Who is asking, on every Office Space page and action (ADR 0032). Nothing
 * here trusts the proxy, a hidden button or the token's role: each request
 * re-checks the host, the token (aal2, signed in within 12 hours), the
 * office session in the database (not idle, not ended) and the role there,
 * then the permission. Any doubt ends in the sign-in page or a 404.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { can, type OfficeAction, type StaffRole } from "@/core/office/permissions";
import { tokenVerdict } from "@/core/office/session-policy";
import { normalizeHost } from "@/server/http/hosts";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { officeConfig, type OfficeConfig } from "./config";
import { requestMeta } from "./request-meta";
import { createStaffStore, OFFICE_MESSAGES, type SessionCheck, type StaffStore, type StoreResult } from "./staff-store";
import { createOfficeServerClient } from "./supabase";

export interface StaffContext {
  user: { id: string; email: string };
  role: StaffRole;
  sessionId: string;
  firstFactorAt: Date;
  lastSeenAt: Date;
  office: OfficeConfig;
  admin: SupabaseClient;
  store: StaffStore;
  client: SupabaseClient;
  can: (action: OfficeAction) => boolean;
}

export type StaffRefusal = "not_found" | "sign_in" | "verify" | "not_staff" | "ended" | "unavailable";

export interface StaffCheckInput {
  hostOk: boolean;
  configured: boolean;
  claims: { sub?: unknown; aal?: unknown; amr?: unknown; session_id?: unknown; email?: unknown } | null;
  check: StoreResult<SessionCheck> | null;
  now: Date;
}

/** The decision, without any I/O. */
export function checkStaff(input: StaffCheckInput): { ok: true; role: StaffRole; firstFactorAt: Date; lastSeenAt: Date } | { ok: false; reason: StaffRefusal } {
  if (!input.configured || !input.hostOk) return { ok: false, reason: "not_found" };
  const claims = input.claims;
  if (!claims || typeof claims.sub !== "string") return { ok: false, reason: "sign_in" };
  const verdict = tokenVerdict(claims, input.now);
  if (!verdict.ok) return { ok: false, reason: verdict.reason === "verify" ? "verify" : "sign_in" };
  if (typeof claims.session_id !== "string") return { ok: false, reason: "sign_in" };
  if (!input.check) return { ok: false, reason: "sign_in" };
  if (!input.check.ok) return { ok: false, reason: "unavailable" };
  const c = input.check.value;
  if (c.status === "not_staff") return { ok: false, reason: "not_staff" };
  if (c.status === "no_session") return { ok: false, reason: "sign_in" };
  if (c.status === "ended" || !c.role) return { ok: false, reason: "ended" };
  return { ok: true, role: c.role, firstFactorAt: verdict.firstFactorAt, lastSeenAt: c.last_seen_at ? new Date(c.last_seen_at) : input.now };
}

export async function onOfficeHost(office: OfficeConfig | null): Promise<boolean> {
  if (!office) return false;
  const h = await headers();
  return normalizeHost(h.get("host")) === office.host;
}

/** The office's Supabase pieces for this request, or null when the office isn't set up here. */
export const officeClients = cache(async () => {
  const office = officeConfig();
  if (!office || !(await onOfficeHost(office))) return null;
  const client = await createOfficeServerClient();
  const admin = createSupabaseAdminClient();
  if (!client || !admin) return null;
  return { office, client, admin, store: createStaffStore(admin) };
});

export const getStaff = cache(async (): Promise<{ ok: true; ctx: StaffContext } | { ok: false; reason: StaffRefusal }> => {
  const clients = await officeClients();
  if (!clients) return { ok: false, reason: "not_found" };
  const { data } = await clients.client.auth.getClaims();
  const claims = (data?.claims ?? null) as StaffCheckInput["claims"];
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const sessionId = typeof claims?.session_id === "string" ? claims.session_id : null;
  const now = new Date();
  const pre = checkStaff({ hostOk: true, configured: true, claims, check: { ok: true, value: { status: "active", role: "viewer" } }, now });
  const check = pre.ok && userId && sessionId ? await clients.store.checkSession({ userId, sessionId }) : null;
  const decided = checkStaff({ hostOk: true, configured: true, claims, check, now });
  if (!decided.ok) {
    if (decided.reason === "ended" || (decided.reason === "sign_in" && claims)) await clients.client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return decided;
  }
  return {
    ok: true,
    ctx: {
      user: { id: userId!, email: typeof claims?.email === "string" ? claims.email : "" },
      role: decided.role,
      sessionId: sessionId!,
      firstFactorAt: decided.firstFactorAt,
      lastSeenAt: decided.lastSeenAt,
      office: clients.office,
      admin: clients.admin,
      store: clients.store,
      client: clients.client,
      can: (action) => can(decided.role, action),
    },
  };
});

/** For office pages and the console layout: a signed-in staff member, or a redirect to the right step. */
export async function requireStaff(): Promise<StaffContext> {
  const r = await getStaff();
  if (r.ok) return r.ctx;
  switch (r.reason) {
    case "not_found":
      notFound();
    case "verify":
      redirect("/verify");
    case "not_staff":
      redirect("/not-staff");
    case "ended":
      redirect("/sign-in?ended=1");
    case "unavailable":
      throw new Error("Office Space couldn't check your session. Nothing was changed.");
    default:
      redirect("/sign-in");
  }
}

export type ActionGate = { ok: true; ctx: StaffContext } | { ok: false; message: string };

/**
 * For office Server Actions: the same checks, plus the write's origin and
 * the permission. A refusal is recorded in the audit log.
 */
export async function staffAction(action: OfficeAction): Promise<ActionGate> {
  const r = await getStaff();
  if (!r.ok) return { ok: false, message: r.reason === "not_found" ? "Not found." : OFFICE_MESSAGES.STAFF_SESSION_ENDED };
  const ctx = r.ctx;
  const h = await headers();
  const origin = h.get("origin");
  const sameOrigin = origin ? origin === ctx.office.origin : h.get("sec-fetch-site") === "same-origin";
  if (!sameOrigin || !ctx.can(action)) {
    await ctx.store.record(
      { userId: ctx.user.id, sessionId: ctx.sessionId },
      { strength: "aal2", action: "access.denied", targetType: "action", targetId: action, result: "denied", detail: { why: sameOrigin ? "role" : "origin" } },
      await requestMeta(),
    );
    return { ok: false, message: sameOrigin ? OFFICE_MESSAGES.STAFF_FORBIDDEN : "That request didn't come from Office Space, so it was refused." };
  }
  return { ok: true, ctx };
}

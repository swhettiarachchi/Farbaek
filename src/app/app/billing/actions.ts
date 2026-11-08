"use server";

import { redirect } from "next/navigation";
import { billingDeps, topupDeps } from "@/server/billing/wiring";
import { setTopupCap, startTopup, topupErrorKey } from "@/server/billing/topups";
import { billingErrorKey, changePlan, openPortal, setCancelAtPeriodEnd, startCheckout, type BillingActor, type BillingWorkspace } from "@/server/billing/use-cases";
import { GOOGLE_MESSAGES, claimGooglePlayPurchase, openGooglePlayIntent, type GoogleResult } from "@/server/billing/google/service";
import { googlePlayDeps, googlePlayOn } from "@/server/billing/google/wiring";
import { log } from "@/server/observability/log";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

const BILLING = "/app/billing";

/** The signed-in person and workspace, or back to Billing with the reason. Every action checks again on the server. */
async function who(): Promise<{ ws: BillingWorkspace; actor: BillingActor }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.current) redirect("/app");
  if (ctx.mode === "demo") redirect(`${BILLING}?error=NOT_OPEN`);
  // The real reason, not "payments aren't open": a viewer's role, or a workspace Farbaek paused.
  if (!ctx.writes.enabled) redirect(`${BILLING}?error=${ctx.role && MANAGER_ROLES.includes(ctx.role) ? "SUSPENDED" : "FORBIDDEN"}`);
  return { ws: { id: ctx.current.id, onTrial: ctx.current.plan.source === "trial" }, actor: { userId: ctx.user.id, email: ctx.user.email, role: ctx.role } };
}

const planOf = (form: FormData) => String(form.get("plan") ?? "").slice(0, 20);

/** Agreed in the form, then on to the provider's hosted checkout. */
export async function startCheckoutAction(form: FormData): Promise<void> {
  const { ws, actor } = await who();
  const plan = planOf(form);
  const r = await startCheckout(billingDeps(), ws, actor, plan, form.get("consent") === "yes");
  if (!r.ok) {
    log("warn", "billing.checkout_refused", { org: ws.id, code: billingErrorKey(r) });
    redirect(`${BILLING}?choose=${encodeURIComponent(plan)}&error=${billingErrorKey(r)}#billing-step`);
  }
  redirect(r.value.url);
}

export async function openPortalAction(): Promise<void> {
  const { ws, actor } = await who();
  const r = await openPortal(billingDeps(), ws, actor);
  if (!r.ok) redirect(`${BILLING}?error=${billingErrorKey(r)}`);
  redirect(r.value.url);
}

export async function cancelPlanAction(): Promise<void> {
  const { ws, actor } = await who();
  const r = await setCancelAtPeriodEnd(billingDeps(), ws, actor, true);
  redirect(r.ok ? `${BILLING}?done=cancelled` : `${BILLING}?cancel=1&error=${billingErrorKey(r)}#billing-step`);
}

export async function resumePlanAction(): Promise<void> {
  const { ws, actor } = await who();
  const r = await setCancelAtPeriodEnd(billingDeps(), ws, actor, false);
  redirect(r.ok ? `${BILLING}?done=resumed` : `${BILLING}?error=${billingErrorKey(r)}`);
}

export async function changePlanAction(form: FormData): Promise<void> {
  const { ws, actor } = await who();
  const plan = planOf(form);
  const r = await changePlan(billingDeps(), ws, actor, plan);
  if (!r.ok) redirect(`${BILLING}?change=${encodeURIComponent(plan)}&error=${billingErrorKey(r)}#billing-step`);
  redirect(`${BILLING}?done=${r.value.direction === "upgrade" ? "upgraded" : "downgrade_scheduled"}&plan=${encodeURIComponent(plan)}`);
}

/** Sets or clears the workspace's monthly top-up limit (ADR 0102). */
export async function setTopupCapAction(form: FormData): Promise<void> {
  const { ws, actor } = await who();
  const r = await setTopupCap(topupDeps(), ws, actor, String(form.get("dollars") ?? ""));
  redirect(r.ok ? `${BILLING}?done=topup_cap#topups` : `${BILLING}?topup_error=${topupErrorKey(r)}#topups`);
}

/** Agreed in the form, then on to the provider's checkout for one top-up pack. */
export async function startTopupAction(form: FormData): Promise<void> {
  const { ws, actor } = await who();
  const pack = Number(form.get("pack"));
  const r = await startTopup(topupDeps(), ws, actor, pack, form.get("consent") === "yes");
  if (!r.ok) {
    log("warn", "billing.topup_refused", { org: ws.id, code: topupErrorKey(r) });
    redirect(`${BILLING}?topup=${encodeURIComponent(String(pack))}&topup_error=${topupErrorKey(r)}#billing-step`);
  }
  redirect(r.value.url);
}

/** What the Google Play button gets back (ADR 0154): its words are safe to show inside the Android app. */
export type PlayActionResult = { ok: true; pending: boolean } | { ok: false; code: string; message: string };

const playRefusal = (code: string, message: string): PlayActionResult => ({ ok: false, code, message });

/** The person, workspace and Google Play, checked again on the server for every call. */
async function playScope() {
  const ctx = await loadAppContext();
  if (!ctx?.current || ctx.mode === "demo" || !ctx.writes.enabled) return null;
  const deps = googlePlayOn() ? googlePlayDeps() : null;
  if (!deps) return null;
  return { deps, orgId: ctx.current.id, actor: ctx.user.id, role: ctx.role };
}

function fromGoogle(r: GoogleResult<{ pending: boolean } | null>, orgId: string): PlayActionResult {
  if (r.ok) return { ok: true, pending: Boolean(r.value?.pending) };
  log("warn", "billing.google_play_refused", { org: orgId, code: r.code });
  return playRefusal(r.code, r.message);
}

/** An owner or admin is about to buy this plan through Google Play: the purchase that follows is bound to this workspace. */
export async function openGooglePlayIntentAction(productId: string): Promise<PlayActionResult> {
  const s = await playScope();
  if (!s) return playRefusal("NOT_OPEN", GOOGLE_MESSAGES.off);
  try {
    return fromGoogle(await openGooglePlayIntent(s.deps, { orgId: s.orgId, actor: s.actor, role: s.role, productId: String(productId).slice(0, 100) }), s.orgId);
  } catch (e) {
    const tooMany = e instanceof Error && e.message.includes("TOO_MANY_ATTEMPTS");
    log("warn", "billing.google_play_intent_failed", { org: s.orgId, reason: tooMany ? "too_many" : "error" });
    return playRefusal(tooMany ? "TOO_MANY_ATTEMPTS" : "NOT_OPEN", tooMany ? "Too many tries in the last hour. Try again later." : GOOGLE_MESSAGES.check);
  }
}

/** A Google Play purchase the app just made, or one it holds: Farbaek asks Google about it before anything changes. */
export async function claimGooglePlayPurchaseAction(purchaseToken: string): Promise<PlayActionResult> {
  const s = await playScope();
  if (!s) return playRefusal("NOT_OPEN", GOOGLE_MESSAGES.off);
  try {
    return fromGoogle(await claimGooglePlayPurchase(s.deps, { orgId: s.orgId, actor: s.actor, role: s.role, purchaseToken }), s.orgId);
  } catch {
    log("warn", "billing.google_play_claim_failed", { org: s.orgId });
    return playRefusal("GOOGLE_UNAVAILABLE", GOOGLE_MESSAGES.check);
  }
}

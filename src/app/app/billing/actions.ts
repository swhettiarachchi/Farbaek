"use server";

import { redirect } from "next/navigation";
import { billingDeps, topupDeps } from "@/server/billing/wiring";
import { setTopupCap, startTopup, topupErrorKey } from "@/server/billing/topups";
import { billingErrorKey, changePlan, openPortal, setCancelAtPeriodEnd, startCheckout, type BillingActor, type BillingWorkspace } from "@/server/billing/use-cases";
import { log } from "@/server/observability/log";
import { loadAppContext } from "@/server/workspace/context";

const BILLING = "/app/billing";

/** The signed-in person and workspace, or back to Billing with the reason. Every action checks again on the server. */
async function who(): Promise<{ ws: BillingWorkspace; actor: BillingActor }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.current) redirect("/app");
  if (ctx.mode === "demo") redirect(`${BILLING}?error=NOT_OPEN`);
  if (!ctx.writes.enabled) redirect(`${BILLING}?error=NOT_OPEN`);
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

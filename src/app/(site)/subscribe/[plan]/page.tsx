import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateOrganizationForm } from "@/components/app/forms";
import { SubscribeSummary } from "@/components/pricing/subscribe-summary";
import { Container } from "@/components/ui/container";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { TRIAL, getPlan } from "@/core/billing/catalog";
import { isPaidPlanId } from "@/core/billing/provider-state";
import { baseName, billingChoosePath, subscribePath } from "@/core/billing/subscribe";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isDemoMode, loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = {
  title: "Subscribe",
  robots: { index: false, follow: false },
};

/**
 * Where every Subscribe button goes (ADR 0197). Whatever state the visitor is
 * in, it ends at the plan's review step in Billing: signed out, they sign in
 * and come back here; with no workspace of their own to subscribe, they name
 * one here; then Billing shows the price, what's included and the consent box
 * before checkout.
 */
export default async function SubscribePage({ params, searchParams }: { params: Promise<{ plan: string }>; searchParams: Promise<{ new?: string }> }) {
  const [{ plan: raw }, sp] = await Promise.all([params, searchParams]);
  if (!isPaidPlanId(raw)) redirect("/pricing");
  const planId = raw;
  // Signing in comes back here. Without sign-in on this server, the sign-in page says so plainly.
  const signIn = `/sign-in?${new URLSearchParams({ next: subscribePath(planId) })}`;

  // Signed out: sign in first. Checked before the app context, which would send to sign-in without the plan.
  if (!isDemoMode()) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) redirect(signIn);
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) redirect(signIn);
  }

  const ctx = await loadAppContext();
  if (!ctx) redirect(signIn);
  // An owner or admin of the open workspace goes straight to its review step. So does the demo, which can't make workspaces.
  // A member of someone else's workspace, or anyone who asked for a new one, names a workspace of their own first.
  const manager = Boolean(ctx.role && MANAGER_ROLES.includes(ctx.role));
  if (ctx.current && (ctx.mode === "demo" || (manager && sp.new !== "1"))) redirect(billingChoosePath(planId));

  const name = baseName(getPlan(planId));
  return (
    <Container className="grid gap-10 py-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start lg:gap-16 lg:py-16">
      <div className="w-full max-w-[440px] justify-self-center lg:justify-self-start">
        <h1 className={FOCUSED_TITLE}>Subscribe to {name}</h1>
        <p className="mt-3 text-body leading-relaxed text-ink-2">
          {ctx.current ? `First, name a workspace of your own. ${ctx.current.name} stays as it is.` : "First, name your workspace."} Your projects live in it, and the
          plan belongs to it. Next you review {name} and agree before anything is charged.
        </p>
        <div className="mt-8 rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
          <div className="rounded-md bg-surface p-5 shadow-e1 sm:p-6">
            <CreateOrganizationForm plan={planId} submitLabel="Continue to review" defaultName="My workspace" />
          </div>
        </div>
        <p className="mt-6 text-sm leading-relaxed text-ink-3">
          New workspaces get the {TRIAL.lengthDays}-day {getPlan(TRIAL.basePlan).name} trial, once per email address. Subscribing ends it, and billing starts then.
        </p>
        <p className="mt-2 text-sm text-ink-3">Signed in as {ctx.user.email}.</p>
      </div>
      <SubscribeSummary planId={planId} stage="workspace" />
    </Container>
  );
}

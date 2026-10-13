import { SignOutIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { TRIAL, getPlan } from "@/core/billing/catalog";
import { ORGANIZATION_SELECT, summarizeOrganizations, type WorkspaceSummary } from "@/server/workspace/organizations";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { signOut } from "./actions";
import { CreateOrganizationForm } from "./create-organization-form";

export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

// Per-user page: always render at request time, never from the build cache.
export const dynamic = "force-dynamic";

const number = new Intl.NumberFormat("en-US");

function PlanLine({ ws }: { ws: WorkspaceSummary }) {
  if (ws.billingUnknown) return <StatusBadge status="failed" label="Billing state missing" />;
  if (ws.plan.source === "trial") return <StatusBadge status="info" label={`${getPlan(ws.plan.planId).name} trial`} />;
  if (ws.plan.suspendedFrom) return <StatusBadge status="approval" label="Paid features paused" />;
  return <StatusBadge status="verified" label={getPlan(ws.plan.planId).name} />;
}

function WorkspaceCard({ ws }: { ws: WorkspaceSummary }) {
  const limits = ws.plan.limits;
  const evaluationsLabel = ws.plan.source === "trial" ? "evaluations for the trial" : "evaluations a month";
  return (
    <li className="rounded-md border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{ws.name}</h2>
        <PlanLine ws={ws} />
      </div>

      {ws.trial ? (
        <p className="mt-3 text-[15px] text-ink-2">
          {ws.trial.phase.phase === "active" ? (
            <>
              {ws.trial.phase.daysRemaining} {ws.trial.phase.daysRemaining === 1 ? "day" : "days"} left. The trial ends{" "}
              <LocalTime iso={ws.trial.endsAt} />, then this workspace moves to Free. Nothing is charged.
            </>
          ) : (
            <>
              The trial ended <LocalTime iso={ws.trial.endsAt} />. This workspace is on Free and nothing was charged.
            </>
          )}
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-5 text-sm sm:grid-cols-4">
        {[
          ["Seats", limits.seats],
          ["Agents", limits.agents],
          ["Integrations", limits.integrations],
          [evaluationsLabel, limits.evaluationsPerMonth],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-ink-3">{label}</dt>
            <dd className="mt-0.5 font-medium tabular">{value === null ? "Contract" : number.format(Number(value))}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export default async function WorkspaceHome() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <Container className="py-16">
        <h1 className="text-3xl font-medium tracking-[-0.02em]">Workspace</h1>
        <p className="mt-4 max-w-[60ch] rounded-md border border-dashed border-line-strong/60 p-5 text-[15px] text-ink-2">
          Supabase isn&apos;t connected in this environment. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>, then restart the server.
        </p>
      </Container>
    );
  }

  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims) redirect("/sign-in");

  const { data, error } = await supabase.from("organizations").select(ORGANIZATION_SELECT).order("created_at");
  const workspaces = error ? null : summarizeOrganizations(data, new Date());
  const email = typeof claims.email === "string" ? claims.email : "your account";

  return (
    <Container className="py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[13px] text-ink-3">{"// workspace"}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.02em]">Your workspaces</h1>
          <p className="mt-1 text-sm text-ink-3">Signed in as {email}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className={buttonClasses("secondary", "sm")}>
            <SignOutIcon size={16} aria-hidden /> Sign out
          </button>
        </form>
      </div>

      <div className="mt-10">
        {workspaces === null ? (
          <p role="alert" className="rounded-md border border-failed/40 bg-failed/[0.05] p-5 text-[15px]">
            Your workspaces couldn&apos;t be loaded. Nothing has changed; reload to try again.
          </p>
        ) : workspaces.length === 0 ? (
          <section aria-labelledby="create-title" className="max-w-[480px] rounded-md border border-line bg-surface p-6">
            <h2 id="create-title" className="text-xl font-medium">
              Create your first workspace
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              It starts with the {TRIAL.lengthDays}-day Team trial. No card is needed, and when the trial ends the workspace moves to
              Free.
            </p>
            <div className="mt-6">
              <CreateOrganizationForm />
            </div>
          </section>
        ) : (
          <ul className="grid gap-4">
            {workspaces.map((ws) => (
              <WorkspaceCard key={ws.id} ws={ws} />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-10 max-w-[62ch] text-sm text-ink-3">
        Projects, tasks and contracts arrive in the next step of the build. This page shows only what is stored today.
      </p>
    </Container>
  );
}

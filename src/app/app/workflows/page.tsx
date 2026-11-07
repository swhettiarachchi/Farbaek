import { FlowArrowIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { WorkflowStatusChip } from "@/components/workflows/workflow-status";
import { checkFeature } from "@/core/billing/entitlements";
import { nextAction } from "@/core/realityloop/workflow";
import { WORKFLOWS_NOT_IN_PLAN } from "@/server/workflows/use-cases";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Workflows" };

/** Governed workflows, autonomy level 4 (ADR 0092): several steps, run in order once approved. */
export default async function WorkflowsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const [workflows, projects] = await Promise.all([ctx.reader.listWorkflows(ctx.current.id), ctx.reader.listProjects(ctx.current.id)]);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const feature = checkFeature(ctx.current.plan, "advanced_autonomy");
  const planReason = feature.allowed ? null : feature.code === "FEATURE_NOT_IN_PLAN" ? WORKFLOWS_NOT_IN_PLAN : feature.message;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Workflows"
        description="A bigger goal, done step by step. The agent works through the steps in order once an owner or admin approves, and stops whenever a person needs to look."
        actions={
          planReason ? (
            // The control stays visible and off, with its reason, so the page never has a missing button (no dead ends).
            <span className="flex flex-col items-start gap-1 sm:items-end">
              <button type="button" disabled className={buttonClasses("primary", "md")}>
                New workflow
              </button>
              <span className="max-w-[36ch] text-xs text-ink-3 sm:text-right">{ctx.mode === "demo" ? "The demo workspace is read-only." : planReason}</span>
            </span>
          ) : (
            <ButtonLink href="/app/workflows/new">New workflow</ButtonLink>
          )
        }
      />
      {planReason && ctx.mode !== "demo" ? <Notice>{planReason} You can still read workflows here.</Notice> : null}

      {workflows.length === 0 ? (
        <EmptyState icon={FlowArrowIcon} title="No workflows yet" action={planReason ? undefined : <ButtonLink href="/app/workflows/new">New workflow</ButtonLink>}>
          Split a goal into steps. Each step becomes a task with its own plan, and the agent works through them one at a time.
        </EmptyState>
      ) : (
        <ul className="grid gap-4">
          {workflows.map((w) => {
            const verified = w.steps.filter((s) => s.status === "verified").length;
            return (
              <li key={w.id}>
                <Link
                  href={`/app/workflows/${w.id}`}
                  className="grid gap-3 rounded-md border border-line bg-surface p-5 shadow-e1 transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:shadow-e2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[1.0625rem] font-medium tracking-[-0.01em]">{w.title}</p>
                      <p className="mt-1 text-xs text-ink-3">
                        {names.get(w.projectId) ?? "A project"}. {verified} of {w.steps.length} steps verified. Created <RelativeTime iso={w.createdAt} />
                      </p>
                    </div>
                    <WorkflowStatusChip status={w.status} />
                  </div>
                  <p className="text-sm text-ink-2">{nextAction(w)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

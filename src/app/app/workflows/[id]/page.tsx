import { ArrowLeftIcon, FlagIcon, UsersThreeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/primitives";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { WorkflowControls } from "@/components/workflows/workflow-controls";
import { StepStatusBadge, WorkflowStatusChip } from "@/components/workflows/workflow-status";
import { capShare } from "@/core/agent/run-cap";
import { checkFeature } from "@/core/billing/entitlements";
import { nextAction, unapprovedSteps } from "@/core/realityloop/workflow";
import { WORKFLOWS_NOT_IN_PLAN } from "@/server/workflows/use-cases";
import { loadAppContext } from "@/server/workspace/context";
import { periodUnits } from "@/server/workspace/plan-card-data";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Workflow" };

/** One governed workflow (ADR 0092): its steps in order, what each is waiting on, and its controls. */
export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const w = await ctx.reader.getWorkflow(ctx.current.id, id);
  if (!w) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, w.projectId);
  const manager = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const contributor = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const feature = checkFeature(ctx.current.plan, "advanced_autonomy");
  const missing = unapprovedSteps(w);
  const approveReason =
    w.status !== "draft"
      ? null
      : !manager
        ? "Only an owner or admin can approve a workflow."
        : !feature.allowed
          ? feature.code === "FEATURE_NOT_IN_PLAN"
            ? WORKFLOWS_NOT_IN_PLAN
            : feature.message
          : missing.length
            ? `Approve the plan for ${missing.map((s) => `step ${s.position}`).join(", ")} first.`
            : "";
  const disabledReason = ctx.mode === "demo" ? "The demo workspace is read-only. Sign in to run your own workflows." : !ctx.writes.enabled ? ctx.writes.reason : !contributor ? "Your role can view this workflow but not change it." : null;
  const stepShare = capShare(Math.floor(w.ceilingUnits / Math.max(1, w.steps.length)), periodUnits(ctx.current));

  return (
    <div className="grid gap-8">
      <LiveRefresh active={w.status === "running" || w.status === "approved"} />
      <div>
        <Link href="/app/workflows" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> Workflows
        </Link>
        <div className="mt-3">
          <PageHeader title={w.title} description={nextAction(w)} actions={<WorkflowStatusChip status={w.status} />} />
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {project ? (
            <Link href={`/app/projects/${project.id}`} className="hover:text-accent hover:underline">
              {project.name}
            </Link>
          ) : (
            "A project"
          )}
          . Each step&apos;s run stops at {stepShare ?? "its share of the ceiling"}.{" "}
          {w.approvedAt ? (
            <>
              Approved <RelativeTime iso={w.approvedAt} /> (<LocalTime iso={w.approvedAt} />).
            </>
          ) : (
            "Not approved yet."
          )}
        </p>
      </div>

      <section aria-labelledby="steps-heading" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
        <div className="rounded-md bg-surface p-5 shadow-e1 sm:p-6">
          <h2 id="steps-heading" className="text-lg font-medium">
            Steps
          </h2>
          <ol className="mt-4 grid">
            {w.steps.map((s, i) => {
              // Agent teams (ADR 0128): the other steps that run at the same time as this one.
              const mates = w.steps.filter((m) => m.stage === s.stage && m.position !== s.position).map((m) => m.position);
              return (
              <li key={s.position} className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 pb-6 last:pb-0 max-[18em]:grid-cols-1">
                {i < w.steps.length - 1 ? (
                  <span aria-hidden className={`absolute bottom-0 left-[1.3rem] top-11 border-l-2 ${s.status === "verified" ? "border-solid border-accent/70" : "border-dashed border-line-strong/50"}`} />
                ) : null}
                <span className="relative z-10 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-sm font-medium tabular text-ink-2">{s.position}</span>
                <div className="grid min-w-0 gap-1.5 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <Link href={`/app/tasks/${s.taskId}`} className="-my-3 inline-block py-3 text-[0.9375rem] font-medium hover:text-accent hover:underline">
                      {s.title}
                    </Link>
                    <StepStatusBadge status={s.status} />
                  </div>
                  <p className="text-sm text-ink-2">
                    {s.contract ? (
                      s.contract.status === "approved" ? (
                        <>Contract approved, version {s.contract.version}.</>
                      ) : (
                        <>
                          Plan drafted, waiting for approval.{" "}
                          <Link href={`/app/tasks/${s.taskId}#contract`} className="font-medium text-accent hover:underline">
                            Review it
                          </Link>
                        </>
                      )
                    ) : (
                      <>
                        No plan yet.{" "}
                        <Link href={`/app/tasks/${s.taskId}`} className="font-medium text-accent hover:underline">
                          Draft it
                        </Link>
                      </>
                    )}
                    {s.detail ? ` ${s.detail}` : ""}
                  </p>
                  {s.runId ? (
                    <Link href={`/app/build/${s.runId}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline sm:min-h-0">
                      Open its run
                    </Link>
                  ) : null}
                  {mates.length ? (
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                      <UsersThreeIcon size={14} weight="bold" aria-hidden /> Runs at the same time as step {mates.join(" and ")}, with its own agent.
                    </p>
                  ) : null}
                  {s.checkpoint ? (
                    <p className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                      <FlagIcon size={14} weight="bold" aria-hidden /> Checkpoint: stops for a person after this step.
                    </p>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ol>
        </div>
      </section>

      <WorkflowControls
        workflowId={w.id}
        approve={approveReason}
        canContinue={w.status === "waiting" && w.waitingReason === "checkpoint"}
        canCancel={!["finished", "cancelled"].includes(w.status)}
        disabledReason={disabledReason}
      />
      {w.approvedSha256 ? <p className="font-mono text-[0.75rem] text-ink-3">Approval bound to sha256 {w.approvedSha256}</p> : null}
    </div>
  );
}

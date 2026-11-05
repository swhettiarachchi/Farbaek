import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { WorkflowForm } from "@/components/workflows/workflow-form";
import { CAP_LABELS } from "@/core/agent/run-cap";
import { checkFeature } from "@/core/billing/entitlements";
import { WORKFLOWS_NOT_IN_PLAN } from "@/server/workflows/use-cases";
import { loadAppContext } from "@/server/workspace/context";
import { runEstimates } from "@/server/workspace/plan-card-data";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "New workflow" };

export default async function NewWorkflowPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { project } = await searchParams;
  const projects = (await ctx.reader.listProjects(ctx.current.id)).filter((p) => !p.archivedAt);
  const feature = checkFeature(ctx.current.plan, "advanced_autonomy");
  const top = runEstimates(ctx.current).balanced?.high ?? null;
  const caps = (["top", "double"] as const).map((choice) => ({ choice, title: CAP_LABELS[choice].title, detail: top === null ? "The usage estimate isn't available for this workspace." : CAP_LABELS[choice].detail(top) }));
  const disabledReason =
    ctx.mode === "demo"
      ? "The demo workspace is read-only. Sign in to run your own workflows."
      : !ctx.writes.enabled
        ? ctx.writes.reason
        : !ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)
          ? "Your role can view workflows but not create them."
          : !feature.allowed
            ? feature.code === "FEATURE_NOT_IN_PLAN"
              ? WORKFLOWS_NOT_IN_PLAN
              : feature.message
            : projects.length === 0
              ? "Create a project first: a workflow's steps change one project."
              : null;

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/app/workflows" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> Workflows
        </Link>
        <div className="mt-3">
          <PageHeader
            title="New workflow"
            description="Each step becomes a task. Draft and approve each one's plan, then an owner or admin approves the workflow and the agent works through the steps in order."
          />
        </div>
      </div>
      <Card>
        <WorkflowForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} defaultProject={projects.some((p) => p.id === project) ? project! : null} caps={caps} disabledReason={disabledReason} />
      </Card>
    </div>
  );
}

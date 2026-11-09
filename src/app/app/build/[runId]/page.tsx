import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/primitives";
import { ReportResult } from "@/components/tasks/report-result";
import { RunLive } from "@/components/build/run-live";
import { getRun, getRunUsage, listRunEvents } from "@/server/cloud-agent/store";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { runUsageView } from "@/server/workspace/plan-card-data";
import { loadRunPreview } from "@/server/workspace/run-preview";
import { MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Build run" };

type Params = { params: Promise<{ runId: string }> };

export default async function BuildRunPage({ params }: Params) {
  const ctx = await loadAppContext();
  if (!ctx?.current || ctx.mode !== "live") notFound();
  const user = await createSupabaseServerClient();
  if (!user) notFound();
  const { runId } = await params;
  const run = await getRun(user, ctx.current.id, runId);
  if (!run) notFound();
  const [events, used, preview, changePending] = await Promise.all([
    listRunEvents(user, ctx.current.id, run.id, 0, 400),
    getRunUsage(user, ctx.current.id, run).catch(() => null),
    loadRunPreview(ctx.reader, ctx.current.id, run),
    run.proposalId
      ? ctx.reader
          .getLatestProposal(ctx.current.id, run.taskId)
          .then((p) => p?.id === run.proposalId && p.status === "pending")
          .catch(() => false)
      : false,
  ]);
  const usage = runUsageView(used, run.capUnits, ctx.current);
  const canAnswer = ctx.writes.enabled && (run.startedBy === ctx.user.id || (ctx.role !== null && MANAGER_ROLES.includes(ctx.role)));

  return (
    <div className="grid gap-6">
      <Link href="/app/build" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={16} weight="bold" aria-hidden /> Build
      </Link>
      <PageHeader
        title={run.taskTitle}
        description={
          <>
            <Link href={`/app/projects/${run.projectId}`} className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
              {run.projectName}
            </Link>
            . The agent works on a copy; nothing changes in your project until you review and apply the change.
          </>
        }
      />
      <RunLive initialRun={run} initialEvents={events} initialUsage={usage} preview={preview} changePending={changePending} canAnswer={canAnswer} />
      <ReportResult about={{ taskId: run.taskId }} />
    </div>
  );
}

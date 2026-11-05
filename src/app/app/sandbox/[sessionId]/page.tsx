import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/app/primitives";
import { SandboxWorkspace, type WorkspaceProps } from "@/components/sandbox/workspace";
import { END_REASON_LABELS } from "@/core/sandbox/lifecycle";
import { FAILURE_LABELS, type FailureCategory } from "@/core/sandbox/failures";
import { egressRules, NETWORK_PROFILE_LABELS } from "@/core/sandbox/network";
import { SANDBOX_SIZES, SANDBOX_TEMPLATES } from "@/core/sandbox/templates";
import { formatDuration, sessionUsage } from "@/core/sandbox/usage";
import { executionDto, sessionDto } from "@/server/sandbox/http";
import { sandboxForPage } from "@/server/sandbox/page-context";
import { meteredFrom } from "@/server/sandbox/types";
import { loadAppContext } from "@/server/workspace/context";
import type { Execution, SandboxSession } from "@/sdk/sandbox-client";

export const metadata: Metadata = { title: "Test space session" };
export const dynamic = "force-dynamic";

export default async function SandboxSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const sandbox = await sandboxForPage(ctx);
  if (!sandbox.ok) {
    return (
      <div className="grid gap-6">
        <Link href="/app/sandbox" className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-accent hover:underline">
          Back to Test space
        </Link>
        <Notice tone="warning">{sandbox.reason}</Notice>
      </div>
    );
  }
  const { service, store, actor, role } = sandbox.value;
  const session = await store.getSession(sessionId);
  if (!session || session.orgId !== actor.orgId) notFound();

  const [executions, events, receipts, overview, taskRecord, contract] = await Promise.all([
    store.listExecutions(session.id, 30),
    store.listEvents(session.id, 60),
    store.listReceipts({ sessionId: session.id }, 20),
    service.overview(actor),
    session.taskId ? ctx.reader.getTask(actor.orgId, session.taskId) : Promise.resolve(null),
    session.taskId ? ctx.reader.getContract(actor.orgId, session.taskId) : Promise.resolve(null),
  ]);

  const manager = role === "owner" || role === "admin";
  const canOperate = ctx.writes.enabled && role !== "viewer" && (session.createdBy === actor.userId || manager);
  const runReason =
    overview.execution.mode !== "sandboxed"
      ? overview.execution.reason
      : !canOperate
        ? ctx.writes.enabled
          ? "Only the person who started this session, or an owner or admin, can run commands here."
          : ctx.writes.reason
        : session.state !== "ready"
          ? "The session isn't running."
          : null;

  const failure = session.failureCategory ? (FAILURE_LABELS[session.failureCategory as FailureCategory] ?? FAILURE_LABELS.provider_unavailable) : null;
  const notice: WorkspaceProps["notice"] =
    session.state === "failed"
      ? { tone: "failed", title: failure?.title ?? "The session failed", body: `${session.failureMessage ? `${session.failureMessage} ` : ""}${failure?.action ?? ""}` }
      : session.state === "requested" || session.state === "provisioning"
        ? { tone: "info", title: "Starting the test space", body: "Farbaek is starting a private, throwaway computer and copying in the project files. This page updates on its own." }
        : session.state === "paused"
          ? { tone: "warning", title: "Paused", body: "Nothing runs while paused, and running time isn't counted. Resume to keep working; the time limit still applies." }
          : session.state === "stopping"
            ? { tone: "info", title: "Stopping", body: session.cleanupStatus === "failed" ? "Destroying the test space failed and will be retried. The runtime's own time limit still ends it." : "The runtime is destroying the test space." }
            : session.state === "terminated" || session.state === "expired"
              ? {
                  tone: "info",
                  title: END_REASON_LABELS[session.endReason ?? "user"],
                  body: `The test space was ${session.cleanupStatus === "done" || session.cleanupStatus === "not_needed" ? "destroyed" : "scheduled for cleanup"}. Its command history and receipts stay here for 30 days; receipts are kept for good.`,
                }
              : null;

  const usage = sessionUsage(meteredFrom(session), executions.reduce((n, e) => n + (e.durationMs ?? 0), 0), new Date());
  const egress = egressRules(session.network);

  return (
    <div className="grid gap-4">
      <Link href="/app/sandbox" className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-accent hover:underline">
        Back to Test space
      </Link>
      <SandboxWorkspace
        orgId={actor.orgId}
        me={actor.userId}
        session={sessionDto(session) as SandboxSession}
        executions={executions.map(executionDto) as Execution[]}
        events={events}
        receipts={receipts.map((r) => ({ digest: r.digest, status: r.status, createdAt: r.createdAt, statement: r.statement }))}
        task={
          taskRecord
            ? { id: taskRecord.task.id, title: taskRecord.task.title, state: taskRecord.task.state, checks: contract && contract.status === "approved" ? contract.body.requiredChecks : [] }
            : null
        }
        capabilities={overview.capabilities}
        previewReason={overview.previewReason}
        canOperate={canOperate}
        runReason={runReason}
        notice={notice}
        usage={{
          running: formatDuration(usage.runningSeconds),
          vcpu: formatDuration(usage.vcpuSeconds),
          memory: `${Math.round(usage.gibSeconds / 60)} GiB-min`,
          active: formatDuration(usage.activeExecutionSeconds),
        }}
        egress={{ allowOut: egress.allowOut, denyOut: egress.denyOut }}
        labels={{ template: SANDBOX_TEMPLATES[session.template].label, size: SANDBOX_SIZES[session.size].label, network: NETWORK_PROFILE_LABELS[session.network].title }}
      />
    </div>
  );
}

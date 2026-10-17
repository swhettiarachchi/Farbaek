import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/app/primitives";
import { CreateSessionForm } from "@/components/sandbox/create-session-form";
import { suggestTemplate } from "@/core/sandbox/templates";
import { TERMINAL_STATES } from "@/core/realityloop/task-machine";
import { sandboxForPage } from "@/server/sandbox/page-context";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "New sandbox session" };
export const dynamic = "force-dynamic";

export default async function NewSandboxSessionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const sp = await searchParams;
  const sandbox = await sandboxForPage(ctx);

  const back = (
    <Link href="/app/sandbox" className="text-sm font-medium text-accent hover:underline">
      Back to Sandbox
    </Link>
  );
  if (!sandbox.ok) {
    return (
      <div className="grid gap-6">
        {back}
        <PageHeader title="New session" />
        <Notice tone="warning">{sandbox.reason}</Notice>
      </div>
    );
  }

  const { service, actor } = sandbox.value;
  const [overview, projects, tasks] = await Promise.all([service.overview(actor), ctx.reader.listProjects(actor.orgId), ctx.reader.listTasks(actor.orgId)]);
  const files = await Promise.all(projects.map((p) => ctx.reader.listFiles(actor.orgId, p.id).catch(() => [])));
  const limits = overview.limits.limits;
  const disabledReason =
    overview.execution.mode !== "sandboxed"
      ? overview.execution.reason
      : !ctx.writes.enabled
        ? ctx.writes.reason
        : overview.activeSessions >= limits.maxConcurrentSessions
          ? `Your workspace has ${overview.activeSessions} of ${limits.maxConcurrentSessions} sessions running. Stop one to start another.`
          : overview.minutesUsed >= limits.minutesPerPeriod
            ? "Your workspace has used its sandbox minutes for this period."
            : null;

  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader title="New session" description="Choose an environment, how big it is and what it may reach. Only the options your plan includes are offered." />
      <CreateSessionForm
        idempotencyKey={crypto.randomUUID()}
        runtime={overview.runtimeId === "vercel" ? "vercel" : "e2b"}
        allowedSizes={limits.sizes}
        allowedNetworks={limits.networkProfiles}
        maxMinutes={limits.maxSessionMinutes}
        idleMinutes={limits.idleMinutes}
        maxCommandMinutes={Math.round(limits.maxCommandSeconds / 60)}
        projects={projects.map((p, i) => ({ id: p.id, name: p.name, suggested: suggestTemplate((files[i] ?? []).map((f) => f.path)) }))}
        tasks={tasks.filter((t) => !TERMINAL_STATES.has(t.state)).map((t) => ({ id: t.id, title: t.title, projectId: t.projectId }))}
        defaultProjectId={one("project")}
        defaultTaskId={one("task")}
        disabledReason={disabledReason}
      />
    </div>
  );
}

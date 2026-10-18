import { ArrowRightIcon, FileTextIcon, FingerprintIcon, RobotIcon, SparkleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { AgentCore } from "@/components/build/agent-core";
import { RunStatusBadge } from "@/components/build/run-status";
import { StartRun } from "@/components/build/start-run";
import { LocalTime } from "@/components/ui/local-time";
import { isLive } from "@/core/agent/cloud-run";
import { EFFORT_LABELS } from "@/core/agent/routing";
import { workspacePhase } from "@/core/agent/run-phase";
import { resolveAiProvider } from "@/server/ai/config";
import { listRuns, type RunView } from "@/server/cloud-agent/store";
import { sandboxExecutionMode } from "@/server/sandbox/registry";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Build" };

// A real sequence: each step needs the one before it.
const FLOW = [
  { icon: FileTextIcon, title: "Describe", text: "Write the outcome you want as a task in a project." },
  { icon: SparkleIcon, title: "Agree", text: "Draft the intent contract with AI, check it and approve it." },
  { icon: RobotIcon, title: "Build", text: "The agent works in the cloud, runs the checks and asks before anything risky." },
  { icon: FingerprintIcon, title: "Review", text: "You review every change, apply it and get a ProofPack." },
];

export default async function BuildPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;

  const ai = resolveAiProvider();
  const sandbox = sandboxExecutionMode();
  const canStart = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const startReason = !ctx.writes.enabled
    ? ctx.writes.reason
    : !canStart
      ? "Your role can view runs but not start them."
      : ai.provider !== "anthropic"
        ? ai.provider
          ? "Cloud runs need Claude on this server."
          : ai.reason
        : null;

  const [tasks, runs] = await Promise.all([
    ctx.reader.listTasks(ws.id),
    ctx.mode === "live"
      ? createSupabaseServerClient().then((c) => (c ? listRuns(c, ws.id) : ([] as RunView[]))).catch(() => [] as RunView[])
      : Promise.resolve([] as RunView[]),
  ]);
  const busy = new Set(runs.filter((r) => ["starting", "working", "waiting"].includes(r.status)).map((r) => r.taskId));
  const ready = tasks.filter((t) => t.state === "CONTRACT_APPROVED");
  const phase = workspacePhase(runs.map((r) => r.status));
  const going = runs.filter((r) => isLive(r.status)).length;
  const waitingRun = runs.find((r) => r.status === "waiting");

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Build"
        description="Describe an outcome, agree the contract, and the Farbaek Agent builds it in the cloud on Farbaek's AI. No API key needed: each run uses your workspace's AI usage, and every change waits for your review."
      />

      <AgentCore phase={phase}>
        <p className="text-sm leading-relaxed text-ink-2">
          {waitingRun ? (
            <>
              A run is waiting for you to approve a command.{" "}
              <Link href={`/app/build/${waitingRun.id}`} className="font-medium text-accent hover:underline">
                Open the run
              </Link>
            </>
          ) : going > 0 ? (
            `${going} ${going === 1 ? "run is" : "runs are"} going. Each one shows its steps live.`
          ) : ready.length > 0 ? (
            `${ready.length} ${ready.length === 1 ? "task is" : "tasks are"} ready to build.`
          ) : (
            "Approve a task's contract and it shows up below, ready for the agent."
          )}
        </p>
      </AgentCore>

      {sandbox.mode !== "sandboxed" ? (
        <Notice>
          No verified sandbox is connected, so runs prepare the change without running tests or builds. {sandbox.reason}
        </Notice>
      ) : null}

      <ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4" aria-label="How a build works">
        {FLOW.map((s, i) => (
          <li key={s.title} className="bg-surface p-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
                <s.icon size={15} weight="bold" aria-hidden />
              </span>
              <span className="font-mono text-xs text-ink-3">{`0${i + 1}`}</span> {s.title}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="ready-heading" className="grid gap-4">
        <h2 id="ready-heading" className="text-lg font-medium">
          Ready to build
        </h2>
        {ready.length === 0 ? (
          <EmptyState
            icon={RobotIcon}
            title="Nothing is ready to build yet"
            action={
              <Link href="/app/projects" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent hover:underline">
                Open projects <ArrowRightIcon size={16} weight="bold" aria-hidden />
              </Link>
            }
          >
            Create a task in a project, draft its contract with AI and approve it. It shows up here, ready for the agent.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {ready.map((t) => (
              <li key={t.id} className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
                <div className="min-w-0">
                  <Link href={`/app/tasks/${t.id}`} className="text-[15px] font-medium hover:underline">
                    {t.title}
                  </Link>
                  <p className="mt-1 text-sm text-ink-3">Contract approved. Waiting for a change.</p>
                </div>
                <StartRun taskId={t.id} disabledReason={busy.has(t.id) ? "The agent is already working on this task." : startReason} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="runs-heading" className="grid gap-4">
        <h2 id="runs-heading" className="text-lg font-medium">
          Runs <span className="text-ink-3 tabular">{runs.length}</span>
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-ink-3">No runs yet. Start one from a task that&apos;s ready.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/app/build/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 hover:bg-canvas-2 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.taskTitle}</span>
                    <span className="block text-xs text-ink-3">
                      {r.projectName} · {EFFORT_LABELS[r.effort].title} · <LocalTime iso={r.startedAt} />
                    </span>
                  </span>
                  <RunStatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

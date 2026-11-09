import { ArrowRightIcon, ClipboardTextIcon, ClockCounterClockwiseIcon, FileTextIcon, GitDiffIcon, HammerIcon, ListNumbersIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/app/live-refresh";
import { CardTitle, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { AgentCore } from "@/components/build/agent-core";
import { PromptComposer } from "@/components/build/prompt-composer";
import { RunStatusBadge } from "@/components/build/run-status";
import { StartRun } from "@/components/build/start-run";
import { Disclosure } from "@/components/ui/disclosure";
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
import { withheldFor } from "@/core/workspace/permissions";

export const metadata: Metadata = { title: "Build" };

// A real sequence: each step needs the one before it.
const FLOW = [
  { icon: FileTextIcon, title: "Describe", text: "Write the outcome you want as a task in a project." },
  { icon: ClipboardTextIcon, title: "Agree", text: "AI drafts a plan. You read it and approve it." },
  { icon: HammerIcon, title: "Build", text: "The agent works in the cloud, runs the checks and asks before anything risky." },
  { icon: GitDiffIcon, title: "Review", text: "You check every change and apply it. You also get a ProofPack, the record of what was checked." },
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
          ? "Cloud runs aren't available on this server yet."
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

  const flow = (
    <ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4" aria-label="How a build works">
      {FLOW.map((s) => (
        <li key={s.title} className="bg-surface p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <s.icon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden /> {s.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.text}</p>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="grid gap-8">
      {/* The list promises live steps, so it keeps up while a run is going or waiting. */}
      <LiveRefresh active={going > 0 || Boolean(waitingRun)} />
      <PageHeader
        title="Build"
        description="Say what you want and approve the plan, and the agent builds it. You don't need your own AI account: each run uses your workspace's AI usage, and every change waits for your review."
      />

      <section aria-label="Start a build" className="aurora">
        <PromptComposer mode="app" size="compact" disabledReason={startReason} />
      </section>

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
            "Approve a task's plan and it shows up below, ready for the agent."
          )}
        </p>
      </AgentCore>

      {sandbox.mode !== "sandboxed" ? (
        <Notice>
          Runs prepare the change without running tests or builds. {sandbox.reason}
        </Notice>
      ) : null}

      {/* Someone new reads how it goes; once a workspace has run anything, the steps fold away. */}
      {runs.length === 0 ? flow : <Disclosure summary="How a build works" icon={<ListNumbersIcon size={20} />}>
          {flow}
        </Disclosure>}

      <section aria-labelledby="ready-heading" className="grid gap-4">
        <CardTitle id="ready-heading" icon={HammerIcon}>
          Ready to build
        </CardTitle>
        {ready.length === 0 ? (
          <EmptyState
            icon={HammerIcon}
            title="Nothing is ready to build yet"
            action={
              <Link href="/app/new" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent hover:underline">
                Describe what you want to build <ArrowRightIcon size={16} weight="bold" aria-hidden />
              </Link>
            }
          >
            Describe one thing you want, in the box above or on a project. AI drafts the plan, you approve it, and the task shows up here, ready for the agent.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {ready.map((t) => (
              <li key={t.id} className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
                <div className="min-w-0">
                  <Link href={`/app/tasks/${t.id}`} className="-my-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium hover:underline">
                    {t.title}
                  </Link>
                  <p className="mt-1 text-sm text-ink-3">Plan approved. Press Build with the agent to start.</p>
                </div>
                <StartRun taskId={t.id} disabledReason={busy.has(t.id) ? "The agent is already working on this task." : (startReason ?? withheldFor(ctx.role, ctx.permissions, "run_agents"))} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="runs-heading" className="grid gap-4">
        <CardTitle id="runs-heading" icon={ClockCounterClockwiseIcon}>
          Runs
        </CardTitle>
        {runs.length === 0 ? (
          <p className="text-sm text-ink-3">No runs yet. Start one from a task that&apos;s ready.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/app/build/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 hover:bg-canvas-2 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[0.9375rem] font-medium">{r.taskTitle}</span>
                    <span className="block text-xs text-ink-3">
                      {r.projectName}, {EFFORT_LABELS[r.effort].title.toLowerCase()} effort. Started <LocalTime iso={r.startedAt} />
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

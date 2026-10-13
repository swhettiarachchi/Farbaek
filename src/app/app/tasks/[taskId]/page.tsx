import { ArrowLeftIcon, ClockCounterClockwiseIcon, InfoIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelTaskControl } from "@/components/app/forms";
import { Card, TaskStateBadge } from "@/components/app/primitives";
import { ProofThread } from "@/components/proof/proof-thread";
import { LocalTime } from "@/components/ui/local-time";
import { TASK_STATE_LABELS, lifecycleProgress } from "@/core/realityloop/progress";
import { TERMINAL_STATES } from "@/core/realityloop/task-machine";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Task" };

const ACTOR: Record<"user" | "agent" | "system", string> = { user: "Person", agent: "Agent", system: "Farbaek" };

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const found = await ctx.reader.getTask(ctx.current.id, taskId);
  if (!found) notFound();
  const { task, history } = found;

  const stages = lifecycleProgress(task.state, history);
  const finished = TERMINAL_STATES.has(task.state);
  const cancelReason = !ctx.writes.enabled ? ctx.writes.reason : null;

  return (
    <div className="grid gap-8">
      <div>
        <Link href={`/app/projects/${task.projectId}`} className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> {task.projectName ?? "Project"}
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="max-w-[40ch] text-balance text-[1.6rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2rem]">{task.title}</h1>
          <TaskStateBadge state={task.state} />
        </div>
        <p className="mt-2 text-sm text-ink-3">
          Created <LocalTime iso={task.createdAt} /> · version <span className="tabular">{task.version}</span>
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-medium">Lifecycle</h2>
        <p className="mt-1 text-sm text-ink-2">A stage turns solid only when the task has actually passed it.</p>
        <div className="mt-6">
          <ProofThread
            label="Task lifecycle"
            stages={stages.map((s) => ({ key: s.key, label: s.label, body: "", status: s.status, statusText: s.note }))}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <ClockCounterClockwiseIcon size={20} className="text-ink-3" aria-hidden /> History
          </h2>
          <ol className="mt-4 grid gap-0">
            <li className="relative border-l border-line pb-5 pl-5">
              <span aria-hidden className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-line-strong" />
              <p className="text-[15px]">Task received</p>
              <p className="text-xs text-ink-3">
                <LocalTime iso={task.createdAt} />
              </p>
            </li>
            {history.map((h, i) => (
              <li key={h.eventId} className={`relative pl-5 ${i < history.length - 1 ? "border-l border-line pb-5" : "border-l border-transparent"}`}>
                <span aria-hidden className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-accent" />
                <p className="text-[15px]">
                  {TASK_STATE_LABELS[h.from]} <span className="text-ink-3">to</span> {TASK_STATE_LABELS[h.to]}
                </p>
                <p className="text-xs text-ink-3">
                  {ACTOR[h.actorKind]} · <span className="font-mono">{h.eventType}</span> · <LocalTime iso={h.at} />
                </p>
              </li>
            ))}
          </ol>
          {history.length === 0 ? <p className="mt-2 text-sm text-ink-3">No changes yet.</p> : null}
        </Card>

        <div className="grid gap-6">
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <InfoIcon size={20} className="text-info" aria-hidden /> What happens next
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              {task.state === "RECEIVED"
                ? "Context, the intent contract and the plan come from Farbaek Agent, which arrives with Studio in Stage 2. Until then this task stays at Received."
                : finished
                  ? "This task is finished. Its history stays as a record."
                  : "This task moves forward only through the lifecycle: each step is checked by the state machine and recorded above."}
            </p>
          </Card>
          {!finished ? (
            <Card>
              <h2 className="text-lg font-medium">Stop this task</h2>
              <p className="mt-1 text-sm text-ink-2">Cancelling stops future steps. Anything already done elsewhere isn&apos;t undone by this.</p>
              <div className="mt-4">
                <CancelTaskControl taskId={task.id} version={task.version} disabledReason={cancelReason} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Build's workspace (stage 202, ADR 0219): which of a project's tasks the Agent pane opens on, and where that task stands.
 * Pure rules, shared by the server page and its tests.
 */
import { TERMINAL_STATES, type TASK_STATES } from "@/core/realityloop/task-machine";

type TaskState = (typeof TASK_STATES)[number];

export interface ThreadTask {
  id: string;
  title: string;
  state: TaskState;
  updatedAt: string;
}

/** States where nothing more will happen to the task: the task machine's own list, so the two can't drift apart. */
const SETTLED: ReadonlySet<TaskState> = TERMINAL_STATES;

/**
 * The task the workspace opens on: the one asked for when it belongs to this project; otherwise the most recently touched
 * task that is still going; otherwise the most recent of all. None when the project has no tasks.
 */
export function pickTask<T extends ThreadTask>(tasks: readonly T[], wanted?: string | null): T | null {
  if (tasks.length === 0) return null;
  const asked = wanted ? tasks.find((t) => t.id === wanted) : undefined;
  if (asked) return asked;
  const newest = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return newest.find((t) => !SETTLED.has(t.state)) ?? newest[0]!;
}

/**
 * Where the open task stands, as the Agent pane needs to know it:
 * - `plan_missing`: there's a task but the plan couldn't be drafted;
 * - `plan_waiting`: a plan waits for the person's approval;
 * - `ready`: the plan is approved and no agent is on it;
 * - `running`: an agent is working (or waiting for an answer);
 * - `change_waiting`: the agent's change waits to be reviewed;
 * - `under_way`: past the agent, and still moving: being applied or checked, or waiting on someone;
 * - `settled`: the work is in the project and checked, or the task ended some other way;
 * - `cancelled`.
 */
export type ThreadStage = "plan_missing" | "plan_waiting" | "ready" | "running" | "change_waiting" | "under_way" | "settled" | "cancelled";

export function threadStage(input: { state: TaskState; hasPlan: boolean; planApproved: boolean; runLive: boolean; changePending: boolean }): ThreadStage {
  if (input.state === "CANCELLED") return "cancelled";
  if (input.runLive) return "running";
  if (input.changePending) return "change_waiting";
  // An ended request never offers its plan for approval again, whatever its plan's own status says.
  if (SETTLED.has(input.state)) return "settled";
  if (!input.hasPlan) return "plan_missing";
  if (!input.planApproved) return "plan_waiting";
  // Only a task whose plan is approved and untouched can take a run (the executor asks for exactly this state).
  if (input.state === "CONTRACT_APPROVED") return "ready";
  return "under_way";
}

/**
 * First steps on Mission Control (spec Stage 1, ADR 0073): Farbaek's loop
 * from one sentence to a live, verified site, each step read from the
 * workspace's records, never from clicks. The loop runs in order, so a later
 * step done means the earlier ones were too: a verified change was applied,
 * and an applied one had its plan approved.
 */
import type { TaskState } from "@/core/realityloop/task-machine";

export type FirstStepKey = "describe" | "approve" | "apply" | "verify" | "publish";
export type FirstStepState = "done" | "next" | "later" | "unavailable";

export interface FirstStepFacts {
  /** Active projects, newest first. */
  projects: readonly { id: string }[];
  /** The workspace's tasks, most recently updated first. */
  tasks: readonly { id: string; state: TaskState; projectId: string }[];
  /** The newest ProofPack: one is recorded each time a change is applied. */
  latestProofPack: { taskId: string; status: "unverified" | "partially_verified" | "verified" | "failed" } | null;
  /** The task of the newest verified ProofPack. */
  verifiedTaskId: string | null;
  /** A site that is live now. */
  liveSite: { projectId: string; name: string } | null;
}

/** Why a step can't happen on this server, or null when it can. */
export interface FirstStepLimits {
  checks: string | null;
  publishing: string | null;
}

export interface FirstStep {
  key: FirstStepKey;
  /** One word for the track. */
  short: string;
  title: string;
  /** What happens in this step, from the person's side. */
  detail: string;
  state: FirstStepState;
  href: string | null;
  /** The button's words, on the next step only. */
  action: string | null;
  /** Why it can't happen here, when unavailable. */
  reason: string | null;
}

export interface FirstSteps {
  steps: FirstStep[];
  done: number;
  complete: boolean;
}

const DRAFTING: ReadonlySet<TaskState> = new Set(["RECEIVED", "CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED"]);
// Rejected and cancelled tasks may have ended before or after their plan was approved, so they prove nothing.
const UNKNOWN: ReadonlySet<TaskState> = new Set(["REJECTED", "CANCELLED"]);
const APPLIED: ReadonlySet<TaskState> = new Set(["VERIFYING", "VERIFIED", "PARTIALLY_VERIFIED", "REVIEW_REQUIRED"]);
const WORKING: ReadonlySet<TaskState> = new Set(["CONTRACT_APPROVED", "PLAN_PROPOSED", "POLICY_EVALUATED", "EXECUTION_AUTHORIZED", "EXECUTING"]);

const COPY: Record<FirstStepKey, { short: string; title: string; detail: string; action: string }> = {
  describe: {
    short: "Describe",
    title: "Describe what to build",
    detail: "One sentence is enough. Farbaek makes a project and drafts a plan you can read before anything runs.",
    action: "Write it",
  },
  approve: {
    short: "Approve",
    title: "Approve the plan",
    detail: "The plan says which files may change and how the result is checked. Nothing runs until you approve it.",
    action: "Read the plan",
  },
  apply: {
    short: "Apply",
    title: "Review and apply the change",
    detail: "The agent works in the cloud and hands back a change. You see every line before it reaches your files.",
    action: "Review the change",
  },
  verify: {
    short: "Verify",
    title: "Get it verified",
    detail: "Farbaek tests exactly what you approved, on a safe copy, and keeps a record of what it found.",
    action: "Run the checks",
  },
  publish: {
    short: "Publish",
    title: "Publish your site",
    detail: "Your site goes live at its own address, with proof of what's in it.",
    action: "Publish",
  },
};

const ORDER: readonly FirstStepKey[] = ["describe", "approve", "apply", "verify", "publish"];

export function firstSteps(facts: FirstStepFacts, limits: FirstStepLimits): FirstSteps {
  const { tasks } = facts;
  const verifiedTask = facts.verifiedTaskId ?? tasks.find((t) => t.state === "VERIFIED")?.id ?? null;
  const reached: Record<FirstStepKey, boolean> = {
    describe: tasks.length > 0,
    approve: tasks.some((t) => !DRAFTING.has(t.state) && !UNKNOWN.has(t.state)),
    apply: facts.latestProofPack !== null || tasks.some((t) => APPLIED.has(t.state)),
    verify: verifiedTask !== null,
    publish: facts.liveSite !== null,
  };
  // In order: the furthest step reached marks every one before it.
  const furthest = ORDER.reduce((last, key, i) => (reached[key] ? i : last), -1);

  const projectOf = (taskId: string | null) => tasks.find((t) => t.id === taskId)?.projectId ?? null;
  const drafting = tasks.find((t) => DRAFTING.has(t.state));
  const reviewable = tasks.find((t) => t.state === "APPROVAL_PENDING") ?? tasks.find((t) => WORKING.has(t.state));
  const unverified = facts.latestProofPack && facts.latestProofPack.status !== "verified" ? facts.latestProofPack.taskId : (tasks.find((t) => APPLIED.has(t.state) && t.state !== "VERIFIED")?.id ?? null);
  const publishProject = projectOf(verifiedTask) ?? projectOf(facts.latestProofPack?.taskId ?? null) ?? facts.projects[0]?.id ?? null;

  const href: Record<FirstStepKey, string | null> = {
    describe: "#start",
    approve: drafting ? `/app/new/${drafting.id}` : "#start",
    apply: reviewable ? `/app/tasks/${reviewable.id}#change` : "/app/build",
    verify: unverified ? `/app/tasks/${unverified}#checks` : "/app/tasks",
    publish: publishProject ? `/app/projects/${publishProject}#publish` : "/app/projects",
  };
  const reason: Record<FirstStepKey, string | null> = { describe: null, approve: null, apply: null, verify: limits.checks, publish: limits.publishing };

  let nextGiven = false;
  const steps = ORDER.map((key, i): FirstStep => {
    const done = i <= furthest;
    const unavailable = !done && reason[key] !== null;
    const next = !done && !unavailable && !nextGiven;
    if (next) nextGiven = true;
    const state: FirstStepState = done ? "done" : unavailable ? "unavailable" : next ? "next" : "later";
    return {
      key,
      short: COPY[key].short,
      title: COPY[key].title,
      detail: COPY[key].detail,
      state,
      href: state === "next" ? href[key] : null,
      action: state === "next" ? COPY[key].action : null,
      reason: unavailable ? reason[key] : null,
    };
  });
  const done = steps.filter((s) => s.state === "done").length;
  // Complete once nothing is left to do here; a step this server can't offer doesn't hold it open.
  return { steps, done, complete: steps.every((s) => s.state === "done" || s.state === "unavailable") };
}

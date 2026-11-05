/**
 * What a task needs from the person, in one plain sentence and one action
 * (ADR 0170). It leads the task page, so nobody has to read the lifecycle to
 * find out what to do. The words come from the task's real state, never from
 * a guess: "done" is only ever said of a task that reached that state.
 */
import type { TaskState } from "./task-machine";

export type NextStepTone = "action" | "working" | "done" | "problem" | "idle";

/** Where the action goes: a card on the same page, the task's project, or its live run. */
export type NextStepTarget = "plan" | "change" | "checks" | "undo" | "fix" | "details" | "project" | "run";

export interface NextStep {
  tone: NextStepTone;
  title: string;
  body: string;
  action: { label: string; target: NextStepTarget } | null;
}

export interface NextStepFacts {
  state: TaskState;
  /** A change is ready to review on this page, or was stopped and is shown here. */
  hasChange: boolean;
  /** That change waited too long, so it can only be discarded now (ADR 0042). */
  changeExpired: boolean;
  /** This person can approve that change. */
  canApprove: boolean;
  /** This person can do anything to this task: not a viewer, and the project isn't archived. */
  canAct: boolean;
  /** A cloud run of this task. It leaves the task's state as it is, so it's stated here. */
  run: "none" | "working" | "waiting";
  /** The fix already started for this task's failed checks (ADR 0101). */
  fix: "none" | "open" | "fixed";
  /** The agent can be started from this page. */
  canBuild: boolean;
  /** The checks can run on a sandbox here. */
  sandboxed: boolean;
  /** The checks are running right now. */
  checking: boolean;
  /** The last run couldn't count as proof, because a project file changed after the change went in (ADR 0175). */
  lastCheckUnverified?: boolean;
  /** How many checks this change has to pass. */
  checks: number;
  /** The agent can be asked to fix what failed. */
  canFix: boolean;
  /** The applied change can still be undone from this page. */
  canUndo: boolean;
}

const undoOr = (facts: NextStepFacts) => (facts.canUndo ? ({ label: "Undo the change", target: "undo" } as const) : ({ label: "Open the project", target: "project" } as const));

/** What someone who can look but not act is offered in place of the action. */
const LOOK: Record<NextStepTarget, string> = {
  plan: "See the plan",
  change: "See the change",
  checks: "See the checks",
  undo: "See undo",
  fix: "See the fix",
  details: "See the details",
  project: "Open the project",
  run: "See the run",
};

export function taskNextStep(facts: NextStepFacts): NextStep {
  const step = stepFor(facts);
  if (facts.canAct) return step;
  // It's only someone's turn if they can take it, and nobody is offered what they can't do.
  const look = step.action ? { label: LOOK[step.action.target], target: step.action.target } : null;
  const readOnly = "You can read everything here, but you can't change this task. The reason is next to each button.";
  if (step.tone === "action") return { tone: "idle", title: "This task is waiting for someone", body: readOnly, action: look };
  if (step.tone === "problem") return { ...step, body: readOnly, action: look };
  return { ...step, action: look };
}

/** A fix that's already under way or done takes the place of offering one. */
function existingFix(facts: NextStepFacts): Pick<NextStep, "body" | "action"> | null {
  if (facts.fix === "none") return null;
  return {
    body: facts.fix === "open" ? "A fix is open in its own task. See how it's going." : "A follow-up task fixed it.",
    action: { label: "See the fix", target: "fix" },
  };
}

function stepFor(facts: NextStepFacts): NextStep {
  switch (facts.state) {
    case "RECEIVED":
    case "CONTEXT_ASSEMBLED":
      return {
        tone: "action",
        title: "Write the plan",
        body: "Say what you want, or let AI draft it for you. Nothing changes until you approve it.",
        action: { label: "Write the plan", target: "plan" },
      };
    case "CONTRACT_DRAFTED":
      return {
        tone: "action",
        title: "Read the plan and approve it",
        body: "The agent starts only after you approve this plan. You can change it first.",
        action: { label: "Read the plan", target: "plan" },
      };
    case "CONTRACT_APPROVED":
      if (facts.run === "waiting") {
        return {
          tone: "action",
          title: "The agent is waiting for you",
          body: "It wants to run a command and needs your approval first.",
          action: { label: "Open the run", target: "run" },
        };
      }
      if (facts.run === "working") {
        return {
          tone: "working",
          title: "The agent is working",
          body: "You can leave this page. Farbaek tells you when it needs you.",
          action: { label: "Watch it work", target: "run" },
        };
      }
      return facts.canBuild
        ? {
            tone: "action",
            title: "Your plan is approved. Ready to build",
            body: "The agent works on a copy of your project, and you check the result before anything changes.",
            action: { label: "Start building", target: "change" },
          }
        : {
            tone: "idle",
            title: "Your plan is approved",
            body: "Building can't start right now. The reason is just below.",
            action: { label: "See why", target: "change" },
          };
    case "PLAN_PROPOSED":
    case "POLICY_EVALUATED":
    case "EXECUTION_AUTHORIZED":
    case "EXECUTING":
      return {
        tone: "working",
        title: "The agent is working",
        body: "You can leave this page. Farbaek tells you when it needs you.",
        action: null,
      };
    case "APPROVAL_PENDING":
      if (facts.hasChange && facts.changeExpired) {
        return {
          tone: "problem",
          title: "This change ran out of time",
          body: "It can't be approved now. Discard it, and ask the agent to try again with the files as they are now.",
          action: { label: "See the change", target: "change" },
        };
      }
      if (facts.hasChange && !facts.canApprove) {
        return {
          tone: "idle",
          title: "This change needs someone else's approval",
          body: "You can read it, but you can't approve it yourself. The reason is next to the button.",
          action: { label: "See the change", target: "change" },
        };
      }
      return facts.hasChange
        ? {
            tone: "action",
            title: "The agent finished. Check what changed, then approve",
            body: "Nothing goes into your project until you approve it.",
            action: { label: "Review the change", target: "change" },
          }
        : {
            tone: "action",
            title: "Waiting for a person's approval",
            body: "The agent's next step needs someone to approve it. Read the plan to see what it covers.",
            action: { label: "Read the plan", target: "plan" },
          };
    case "REVIEW_REQUIRED":
      return {
        tone: "action",
        title: "This needs your review",
        body: "Look at what happened before it goes any further.",
        action: facts.hasChange ? { label: "Review the change", target: "change" } : { label: "See the details", target: "details" },
      };
    case "BLOCKED":
      return facts.hasChange
        ? {
            tone: "problem",
            title: "This change went outside the plan",
            body: "So it was stopped. Change the plan, or discard this change and try again.",
            action: { label: "See what happened", target: "change" },
          }
        : {
            tone: "problem",
            title: "A rule stopped this plan",
            body: "Change the plan so it fits your rules, then try again.",
            action: { label: "Change the plan", target: "plan" },
          };
    case "VERIFYING":
      if (!facts.sandboxed) {
        return {
          tone: "idle",
          title: "The change is in your project, but it hasn't been checked",
          body: "Checks can't run here yet, so it isn't marked as verified. You can undo the change if you need to.",
          action: undoOr(facts),
        };
      }
      if (facts.checking) {
        return {
          tone: "working",
          title: "Checking your change now",
          body: "The change is in your project. It's marked as verified only if every check passes.",
          action: null,
        };
      }
      if (facts.checks === 0) {
        return {
          tone: "idle",
          title: "The change is in your project",
          body: "This plan lists no checks, so nothing can confirm it worked. Have a look at the result, or undo it.",
          action: { label: "Open the project", target: "project" },
        };
      }
      if (facts.lastCheckUnverified) {
        return {
          tone: "idle",
          title: "The checks ran, but they can't prove this change",
          body: "A file in the project changed after this change was applied, so passing checks can't mark it verified. You can carry on: start a new task for your next change, or undo this one.",
          action: undoOr(facts),
        };
      }
      return {
        tone: "action",
        title: "Run the checks",
        body: "The change is in your project. Run the checks to make sure it works.",
        action: { label: "Go to the checks", target: "checks" },
      };
    case "VERIFIED":
      return {
        tone: "done",
        title: "Done and checked",
        body: "The change is in your project, and every check passed.",
        action: { label: "Open the project", target: "project" },
      };
    case "PARTIALLY_VERIFIED":
      return {
        tone: "problem",
        title: "Done, but not every check passed",
        ...(existingFix(facts) ?? {
          body: facts.canFix ? "You can ask the agent to fix what failed." : "Read the results in the details, and fix what failed.",
          action: facts.canFix ? { label: "Ask the agent to fix it", target: "fix" } : { label: "See the details", target: "details" },
        }),
      };
    case "FAILED":
      return {
        tone: "problem",
        title: "The checks didn't pass",
        ...(existingFix(facts) ?? {
          body: facts.canFix ? "You can ask the agent to fix what failed, or undo the change." : "You can undo the change, or stop this task.",
          action: facts.canFix ? { label: "Ask the agent to fix it", target: "fix" } : undoOr(facts),
        }),
      };
    case "INTERRUPTED":
      return {
        tone: "problem",
        title: "The checks were interrupted",
        body: "They didn't finish, so this change isn't verified. You can undo it, or stop this task.",
        action: undoOr(facts),
      };
    case "RECOVERY_PENDING":
      return {
        tone: "action",
        title: "Part of the change is undone",
        body: "Undo the rest, or put the remaining files back yourself and then finish.",
        action: { label: "Go to undo", target: "undo" },
      };
    case "RECOVERED":
      return {
        tone: "done",
        title: "The change was undone",
        body: "Every file is back to how it was. This task is finished.",
        action: { label: "Open the project", target: "project" },
      };
    case "REQUIRES_HUMAN_INTERVENTION":
      return {
        tone: "problem",
        title: "This needs a person",
        body: "Something couldn't finish on its own. Read the details, or ask for help.",
        action: { label: "See the details", target: "details" },
      };
    case "REJECTED":
      return {
        tone: "idle",
        title: "This was turned down",
        body: "Nothing changed in your project. Its history stays as a record.",
        action: { label: "Open the project", target: "project" },
      };
    case "EXPIRED":
      return {
        tone: "idle",
        title: "This ran out of time",
        body: "The approval window closed, so nothing changed. Start a new task when you're ready.",
        action: { label: "Open the project", target: "project" },
      };
    case "CANCELLED":
      return {
        tone: "idle",
        title: "This task was cancelled",
        body: "No more steps will run. Its history stays as a record.",
        action: { label: "Open the project", target: "project" },
      };
  }
}

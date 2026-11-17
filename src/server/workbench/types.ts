/**
 * What Build's workspace page hands its screen (stage 202, ADR 0219). Types only, with no values, so the browser's files can
 * import them without pulling any server code after them (`tests/design/browser-imports.test.ts`).
 */
import type { CapChoice } from "@/core/agent/cap-choices";
import type { SiteTheme } from "@/core/media/studio-kit";
import type { TASK_STATES } from "@/core/realityloop/task-machine";
import type { ThreadStage } from "@/core/workbench/thread";
import type { RunEventView, RunView } from "@/server/cloud-agent/store";
import type { RunEstimates, RunUsageView } from "@/server/workspace/plan-card-data";

export interface WorkbenchFile {
  path: string;
  revision: number;
  sizeBytes: number;
  /** A picture: shown, not edited as text. */
  image: boolean;
}

export interface WorkbenchTask {
  id: string;
  title: string;
  state: (typeof TASK_STATES)[number];
  version: number;
  updatedAt: string;
}

/** The open task's plan, in the words the plan card uses, and what its Approve and build control needs while it waits. */
export interface WorkbenchPlan {
  outcome: string;
  /** What may change, as one sentence, and where. */
  changes: string;
  resources: string[];
  /** How it will be checked. */
  checks: string[];
  /** What stays untouched. */
  kept: string[];
  recovery: string;
  questions: string[];
  approved: boolean;
  approve: {
    version: number;
    sha256: string;
    estimates: RunEstimates;
    skills: { id: string; label: string; description: string }[];
    suggested: string[];
    projectSkills: string[];
    heldSkills: string[];
    kitPro: boolean;
    defaultCap: CapChoice;
    defaultTheme: SiteTheme;
    firstBuildNote: string | null;
  } | null;
}

/** The latest check of the open task's result, as little as the Output pane says about it. */
export interface WorkbenchCheck {
  status: "running" | "done" | "failed";
  result: "verified" | "partially_verified" | "failed" | "unverified" | null;
  failure: string | null;
}

export interface WorkbenchData {
  project: { id: string; name: string; archived: boolean };
  files: WorkbenchFile[];
  tasks: WorkbenchTask[];
  task: WorkbenchTask | null;
  /** Where the open task stands; "empty" when the project has no task yet. */
  stage: ThreadStage | "empty";
  plan: WorkbenchPlan | null;
  run: RunView | null;
  events: RunEventView[];
  usage: RunUsageView;
  check: WorkbenchCheck | null;
  /** The sample workspace: everything shows, nothing can be changed. */
  demo: boolean;
  /** Why starting a build, approving or running is off for this person right now; null when it can go ahead. */
  buildOff: string | null;
  /** Why saving a file is off; null when this person can edit. */
  editOff: string | null;
  /** Whether this person may answer the running agent (its starter, or an owner or admin). */
  canAnswer: boolean;
  /** Changes whenever the project's files or the waiting change do, so the preview is read again only then. */
  previewKey: string;
}

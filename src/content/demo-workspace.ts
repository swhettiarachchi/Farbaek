/**
 * The demo workspace: sample data only, read-only, isolated from every real
 * tenant. Used when FARBAEK_DEMO_APP=1 and Supabase is NOT configured, so it
 * can never be mixed with real data. Every screen shows a "Demo" ribbon.
 */
import type { TaskState } from "@/core/realityloop/task-machine";

export const DEMO_USER = { id: "demo-user", email: "you@demo.farbaek" } as const;
export const DEMO_ORG_ID = "00000000-0000-4000-8000-0000000de300";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface DemoTask {
  id: string;
  projectId: string;
  title: string;
  /** The lifecycle path this task has taken, in order (excluding RECEIVED). */
  path: TaskState[];
  createdHoursAgo: number;
}

export const DEMO_PROJECTS = [
  { id: "00000000-0000-4000-8000-00000000a001", name: "Storefront", description: "Customer-facing shop: catalogue, cart and checkout.", createdDaysAgo: 5 },
  { id: "00000000-0000-4000-8000-00000000a002", name: "Docs site", description: "Public product documentation.", createdDaysAgo: 4 },
  { id: "00000000-0000-4000-8000-00000000a003", name: "Billing service", description: null, createdDaysAgo: 2 },
] as const;

const P = DEMO_PROJECTS;

const HAPPY_TO_APPROVAL: TaskState[] = [
  "CONTEXT_ASSEMBLED",
  "CONTRACT_DRAFTED",
  "CONTRACT_APPROVED",
  "PLAN_PROPOSED",
  "POLICY_EVALUATED",
  "APPROVAL_PENDING",
];

export const DEMO_TASKS: DemoTask[] = [
  {
    id: "00000000-0000-4000-8000-00000000b001",
    projectId: P[0].id,
    title: "Rewrite 100 product descriptions in the house style",
    path: HAPPY_TO_APPROVAL,
    createdHoursAgo: 30,
  },
  {
    id: "00000000-0000-4000-8000-00000000b002",
    projectId: P[0].id,
    title: "Add order export to CSV",
    path: [...HAPPY_TO_APPROVAL, "EXECUTION_AUTHORIZED", "EXECUTING", "VERIFYING", "VERIFIED"],
    createdHoursAgo: 70,
  },
  {
    id: "00000000-0000-4000-8000-00000000b003",
    projectId: P[1].id,
    title: "Fix the timezone in booking confirmation emails",
    path: ["CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "CONTRACT_APPROVED", "PLAN_PROPOSED", "POLICY_EVALUATED", "EXECUTION_AUTHORIZED", "EXECUTING"],
    createdHoursAgo: 6,
  },
  {
    id: "00000000-0000-4000-8000-00000000b004",
    projectId: P[2].id,
    title: "Upgrade the payment SDK to the next major version",
    path: ["CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "CONTRACT_APPROVED", "PLAN_PROPOSED", "POLICY_EVALUATED", "BLOCKED"],
    createdHoursAgo: 20,
  },
  {
    id: "00000000-0000-4000-8000-00000000b005",
    projectId: P[1].id,
    title: "Refresh the pricing page copy",
    path: [],
    createdHoursAgo: 2,
  },
  {
    id: "00000000-0000-4000-8000-00000000b006",
    projectId: P[0].id,
    title: "Remove the legacy coupon system",
    path: ["CONTEXT_ASSEMBLED", "CANCELLED"],
    createdHoursAgo: 96,
  },
];

const EVENT_FOR: Partial<Record<TaskState, string>> = {
  CONTEXT_ASSEMBLED: "assemble_context",
  CONTRACT_DRAFTED: "draft_contract",
  CONTRACT_APPROVED: "approve_contract",
  PLAN_PROPOSED: "propose_plan",
  POLICY_EVALUATED: "evaluate_policy",
  APPROVAL_PENDING: "require_approval",
  EXECUTION_AUTHORIZED: "authorize",
  EXECUTING: "start_execution",
  VERIFYING: "begin_verification",
  VERIFIED: "mark_verified",
  BLOCKED: "block",
  CANCELLED: "cancel",
};

/** The lifecycle event that moves a task from one state to the next. */
export function demoEventType(from: TaskState, to: TaskState): string {
  if (from === "APPROVAL_PENDING" && to === "EXECUTION_AUTHORIZED") return "grant_approval";
  return EVENT_FOR[to] ?? "update";
}

export const DEMO_TRIAL_STARTED_DAYS_AGO = 5;
export const DEMO_EVALUATIONS_THIS_PERIOD = 318;
export const DEMO_MEMBERS = [
  { userId: DEMO_USER.id, role: "owner" as const, joinedDaysAgo: 5 },
  { userId: "demo-teammate-1", role: "member" as const, joinedDaysAgo: 4 },
  { userId: "demo-teammate-2", role: "viewer" as const, joinedDaysAgo: 1 },
];

export const DEMO_TIME = { DAY, HOUR };

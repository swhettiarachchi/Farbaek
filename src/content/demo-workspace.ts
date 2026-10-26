/**
 * The demo workspace: sample data only, read-only, isolated from every real
 * tenant. Used when FARBAEK_DEMO_APP=1 and Supabase is NOT configured, so it
 * can never be mixed with real data. Every screen shows a "Demo" ribbon.
 */
import type { ProposalOutput } from "@/core/realityloop/change-proposal";
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
  /** A code task: its contract is about project files (paths and files.* operations). */
  code?: boolean;
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
    id: "00000000-0000-4000-8000-00000000b007",
    projectId: P[0].id,
    title: "Reject fractional quantities in the cart",
    path: HAPPY_TO_APPROVAL,
    createdHoursAgo: 4,
    code: true,
  },
  {
    id: "00000000-0000-4000-8000-00000000b008",
    projectId: P[0].id,
    title: "Show stock levels on product cards",
    path: ["CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "CONTRACT_APPROVED"],
    createdHoursAgo: 3,
    code: true,
  },
  {
    id: "00000000-0000-4000-8000-00000000b009",
    projectId: P[0].id,
    title: "Validate postcodes at checkout",
    path: [...HAPPY_TO_APPROVAL, "EXECUTION_AUTHORIZED", "EXECUTING", "VERIFYING"],
    createdHoursAgo: 1,
    code: true,
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

/** Contract fields for demo code tasks. Sample data. */
export const DEMO_CODE_CONTRACT = {
  resources: ["src/lib", "src/components"],
  allowedOperations: ["files.edit", "files.create"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: [{ id: "inv-1", statement: "Prices and stock values are unchanged." }],
  assumptions: ["Quantities come from the cart UI as numbers."],
  openQuestions: [],
  acceptanceCriteria: [
    { id: "ac-1", statement: "Adding a fractional quantity throws a clear error.", verification: "test" as const },
    { id: "ac-2", statement: "Existing cart tests still pass.", verification: "test" as const },
  ],
  approvals: [{ gate: "before_execution", role: "contributor" }],
  limits: { maxRecords: 5 },
  requiredChecks: ["pnpm test"],
  recovery: "Restore the previous file revisions from history.",
};

/** The demo's pending proposal, and a sample AI mapping of its hunks (ADR 0044). Sample data, not a real model call. */
export const DEMO_PROPOSAL_ID = "00000000-0000-4000-8000-0000000c0001";
export const DEMO_LENS_SUGGESTION = {
  model: "sample (no model call)",
  mappings: [
    { hunk: "f0h0", clause: "ac-1", reason: "The guard now throws for 1.5 and any other number that isn't whole, with a message saying so." },
    { hunk: "f1h0", clause: "ac-1", reason: "The new test adds 1.5 of a mug and expects the whole-number error." },
  ],
};

/** A sample attempt to verify task b009's applied change that couldn't run (ADR 0047). Sample data: nothing runs in the demo. */
export const DEMO_VERIFICATION = {
  taskId: "00000000-0000-4000-8000-00000000b009",
  failure: "Sample: Install packages with npm failed (exit 1), so the checks didn't run.",
  startedMinutesAgo: 12,
};

/** The sample model output behind the demo's pending proposal (task b007). Sample data, not a real model call. */
export const DEMO_PROPOSAL_TASK_ID = "00000000-0000-4000-8000-00000000b007";
/** The demo's sample governed workflow (ADR 0092), over three of the Storefront's sample tasks. */
export const DEMO_WORKFLOW_ID = "00000000-0000-4000-8000-0000000f0001";
export const DEMO_PROPOSAL_OUTPUT: ProposalOutput = {
  summary: "addToCart accepts fractional quantities today. Reject anything that isn't a whole number and cover it with a test.",
  steps: ["Check the quantity is a whole number in addToCart.", "Add a test for a fractional quantity."],
  risks: ["Callers that pass a quantity as a string will now get an error; the cart UI already sends numbers."],
  checks: ["pnpm test"],
  changes: [
    {
      path: "src/lib/cart.ts",
      kind: "edit",
      edits: [{ find: 'if (quantity < 1) throw new Error("Quantity must be at least 1");', replace: 'if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be a whole number of at least 1");' }],
      content: "",
      reason: "Reject fractional quantities where items are added.",
    },
    {
      path: "src/lib/cart.test.ts",
      kind: "edit",
      edits: [
        {
          find: '  it("merges repeat additions into one line", () => {',
          replace: `  it("rejects fractional quantities", () => {
    expect(() => addToCart([], mug, 1.5)).toThrow("whole number");
  });

  it("merges repeat additions into one line", () => {`,
        },
      ],
      content: "",
      reason: "Cover the new rule.",
    },
  ],
};

export const DEMO_TRIAL_STARTED_DAYS_AGO = 5;
export const DEMO_EVALUATIONS_THIS_PERIOD = 318;
export const DEMO_MEMBERS = [
  { userId: DEMO_USER.id, role: "owner" as const, joinedDaysAgo: 5, permissions: {} },
  { userId: "demo-teammate-1", role: "member" as const, joinedDaysAgo: 4, permissions: { publish: false as const } },
  { userId: "demo-teammate-2", role: "viewer" as const, joinedDaysAgo: 1, permissions: {} },
];

export const DEMO_TIME = { DAY, HOUR };

import { z } from "zod";
import type { Dropped, ProposedChange, Violation } from "@/core/realityloop/change-proposal";
import type { IntentContract } from "@/core/realityloop/contract";
import { TASK_STATES } from "@/core/realityloop/task-machine";
import type { WorkspaceSummary } from "./organizations";

export const ORG_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const CONTRIBUTOR_ROLES: readonly OrgRole[] = ["owner", "admin", "member"];
export const MANAGER_ROLES: readonly OrgRole[] = ["owner", "admin"];

export const MemberRow = z.object({
  user_id: z.string(),
  role: z.enum(ORG_ROLES),
  created_at: z.string(),
});
export type Member = { userId: string; role: OrgRole; joinedAt: string };

export const ProjectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
});
export type Project = { id: string; name: string; description: string | null; createdAt: string };

export const TaskRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum(TASK_STATES),
  version: z.number().int(),
  project_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Task = {
  id: string;
  title: string;
  state: (typeof TASK_STATES)[number];
  version: number;
  projectId: string;
  projectName?: string;
  createdAt: string;
  updatedAt: string;
};

export const TransitionRowSchema = z.object({
  event_id: z.string(),
  event_type: z.string(),
  from_state: z.enum(TASK_STATES),
  to_state: z.enum(TASK_STATES),
  actor_kind: z.enum(["user", "agent", "system"]),
  actor_id: z.string(),
  occurred_at: z.string(),
});
export type Transition = {
  eventId: string;
  eventType: string;
  from: (typeof TASK_STATES)[number];
  to: (typeof TASK_STATES)[number];
  actorKind: "user" | "agent" | "system";
  actorId: string;
  at: string;
};

export type ContractStatus = "draft" | "approved" | "superseded";

export interface ContractRecord {
  version: number;
  status: ContractStatus;
  sha256: string;
  body: IntentContract;
  createdAt: string;
  approvedAt: string | null;
}

export interface ProposalRecord {
  id: string;
  status: "pending" | "blocked" | "applied" | "discarded";
  contractVersion: number;
  plan: { summary: string; steps: string[]; risks: string[]; checks: string[] };
  changes: ProposedChange[];
  dropped: Dropped[];
  violations: Violation[];
  sha256: string;
  model: string | null;
  createdAt: string;
  decidedAt: string | null;
  appliedSha256: string | null;
  /** The policy decision that governed it; null for proposals made before policies were recorded. */
  policy: { outcome: string; version: string; findings: { rule: string; outcome: string; detail: string }[] } | null;
}

/** Shape of change_proposals rows; changes are stored with snake_case keys. */
export const ProposalRowSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  project_id: z.string(),
  status: z.enum(["pending", "blocked", "applied", "discarded"]),
  contract_version: z.number().int(),
  plan: z.object({ summary: z.string(), steps: z.array(z.string()), risks: z.array(z.string()), checks: z.array(z.string()) }),
  changes: z.array(
    z.object({ path: z.string(), kind: z.enum(["create", "edit"]), base_revision: z.number().int(), content: z.string(), sha256: z.string(), reason: z.string() }),
  ),
  dropped: z.array(z.object({ path: z.string(), reason: z.string() })),
  violations: z.array(z.object({ kind: z.string(), detail: z.string() })),
  sha256: z.string(),
  model: z.string().nullable(),
  created_at: z.string(),
  decided_at: z.string().nullable(),
  applied_sha256: z.string().nullable(),
  policy: z
    .object({ outcome: z.string(), version: z.string(), findings: z.array(z.object({ rule: z.string(), outcome: z.string(), detail: z.string() })) })
    .nullable()
    .optional(),
});

export function proposalFromRow(row: z.infer<typeof ProposalRowSchema>): ProposalRecord {
  return {
    id: row.id,
    status: row.status,
    contractVersion: row.contract_version,
    plan: row.plan,
    changes: row.changes.map((c) => ({ path: c.path, kind: c.kind, baseRevision: c.base_revision, content: c.content, sha256: c.sha256, reason: c.reason })),
    dropped: row.dropped as Dropped[],
    violations: row.violations as Violation[],
    sha256: row.sha256,
    model: row.model,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    appliedSha256: row.applied_sha256,
    policy: row.policy ?? null,
  };
}

export interface ProofPackRecord {
  digest: string;
  status: "unverified" | "partially_verified" | "verified" | "failed";
  statement: unknown;
  previous: string | null;
  createdAt: string;
}

export interface ProjectFile {
  path: string;
  revision: number;
  sizeBytes: number;
  sha256: string;
  updatedAt: string;
}

export interface ProjectFileContent extends ProjectFile {
  content: string;
}

export interface FileRevision {
  revision: number;
  change: "import" | "edit" | "delete";
  sizeBytes: number | null;
  sha256: string | null;
  createdAt: string;
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

export interface WorkspaceReader {
  mode: "live" | "demo";
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  listMembers(orgId: string): Promise<Member[]>;
  listProjects(orgId: string): Promise<Project[]>;
  getProject(orgId: string, projectId: string): Promise<Project | null>;
  listTasks(orgId: string, options?: { projectId?: string; limit?: number }): Promise<Task[]>;
  getTask(orgId: string, taskId: string): Promise<{ task: Task; history: Transition[] } | null>;
  countEvaluations(orgId: string, from: Date, to: Date): Promise<number>;
  /** AI credits reserved or settled in the window (refunds excluded). */
  countAiCredits(orgId: string, from: Date, to: Date): Promise<number>;
  /** Current files in a project, sorted by path. */
  listFiles(orgId: string, projectId: string): Promise<ProjectFile[]>;
  getFile(orgId: string, projectId: string, path: string): Promise<ProjectFileContent | null>;
  /** Every revision of one path, newest first (including deletions). */
  listFileRevisions(orgId: string, projectId: string, path: string): Promise<FileRevision[]>;
  /** One revision's content, or null when it doesn't exist or is a deletion. */
  getFileRevision(orgId: string, projectId: string, path: string, revision: number): Promise<string | null>;
  /** Case-insensitive plain-text search; at most 200 matching lines. */
  searchFiles(orgId: string, projectId: string, query: string): Promise<SearchHit[]>;
  /** ProofPacks recorded for a task, newest first. */
  listProofPacks(orgId: string, taskId: string): Promise<ProofPackRecord[]>;
  getProofPack(orgId: string, digest: string): Promise<ProofPackRecord | null>;
  /** The most recent change proposal for a task, or null. */
  getLatestProposal(orgId: string, taskId: string): Promise<ProposalRecord | null>;
  /** The latest contract version for a task, or null when none has been written. */
  getContract(orgId: string, taskId: string): Promise<ContractRecord | null>;
}

import type { GrantRow } from "@/core/billing/wallet";
import { z } from "zod";
import type { Dropped, ProposedChange, Violation } from "@/core/realityloop/change-proposal";
import type { IntentContract } from "@/core/realityloop/contract";
import type { AppliedFile, CurrentFile } from "@/core/realityloop/recovery";
import type { FileChangeEvent } from "@/core/realityloop/scope-drift";
import { TASK_STATES } from "@/core/realityloop/task-machine";
import type { WorkspaceSummary } from "./organizations";
import type { SkillPinRecord } from "./skill-pins";
import type { StoredLensSuggestion } from "@/core/realityloop/lens-suggestion";
import type { AutonomyView } from "./autonomy";
import type { RuleVersionView } from "./workspace-rules";
import type { Incident, IncidentEvent } from "./incidents";
import type { IncidentChange } from "@/core/trust/incidents";
import type { VerificationRecord } from "@/core/realityloop/verification";
import type { FirstStepFacts } from "@/core/workspace/first-steps";
import type { RehearsalRow } from "@/core/trust/rehearsal";
import type { ShadowDecision } from "@/core/trust/policy";
import type { ProjectGraphRecords } from "@/core/insights/project-graph";
import type { WorkflowView } from "@/core/realityloop/workflow";
import type { WithheldPermissions } from "@/core/workspace/permissions";
import type { AgentLease } from "@/core/agent/lease";
import type { SecondCheckResult } from "@/core/trust/second-check";
import type { LedgerEntry, SandboxUse } from "@/core/insights/cost-brain";
import type { ActivityCategory, ActivityEvent } from "@/core/workspace/activity";

export const ORG_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const CONTRIBUTOR_ROLES: readonly OrgRole[] = ["owner", "admin", "member"];
export const MANAGER_ROLES: readonly OrgRole[] = ["owner", "admin"];

export const MemberRow = z.object({
  user_id: z.string(),
  role: z.enum(ORG_ROLES),
  created_at: z.string(),
  permissions: z.unknown().optional(),
});
/** permissions: what an owner or admin turned off for a member (ADR 0087). */
export type Member = { userId: string; role: OrgRole; joinedAt: string; permissions: WithheldPermissions };

export const ProjectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
  archived_at: z.string().nullable().optional(),
});
/** archivedAt is set once an owner or admin archives the project; it stays readable but can't change. */
export type Project = { id: string; name: string; description: string | null; createdAt: string; archivedAt: string | null };

/** The emails a person wants from Farbaek (ADR 0063): about their builds and checks, and trial reminders. */
export type EmailPreferences = { workUpdates: boolean; trialReminders: boolean };

export const TaskRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum(TASK_STATES),
  version: z.number().int(),
  project_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  // The task this one fixes (migration v63, ADR 0101).
  fix_of_task_id: z.string().nullable().optional(),
  // The task's operating mode (migration v80, ADR 0131).
  mode: z.enum(["learn", "pair", "build", "audit"]).catch("build").optional(),
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
  /** The task whose failed checks this one fixes (ADR 0101). */
  fixOf?: string | null;
  /** Learn, Pair, Build or Audit (ADR 0131); Build when unknown. */
  mode?: "learn" | "pair" | "build" | "audit";
};

/** A fix started for a task whose checks failed (ADR 0101). */
export type TaskFix = { id: string; title: string; state: (typeof TASK_STATES)[number] };

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
  /** After this it can only be discarded: 72 hours after it was made, set by the database (ADR 0042). */
  expiresAt: string;
  decidedAt: string | null;
  appliedSha256: string | null;
  /** The policy decision that governed it; null for proposals made before policies were recorded. */
  policy: {
    outcome: string;
    version: string;
    findings: { rule: string; outcome: string; detail: string }[];
    shadow?: ShadowDecision;
    /** The workspace rules that applied (ADR 0082). */
    workspaceRules?: { version: number; sha256: string };
    /** The autonomy level that let it apply on its own (ADR 0086). */
    autonomyLevel?: 2 | 3;
  } | null;
  /** The Farbaek Agent that made it, or null when it was made in the web app. */
  agentId: string | null;
}

/** What level 2 would have decided, as stored under policy -> 'shadow' (ADR 0075). */
export const ShadowSchema = z.object({
  outcome: z.enum(["ALLOW_WITHIN_LIMITS", "REQUIRE_APPROVAL"]),
  reasons: z.array(z.enum(["blocked", "escalated", "too_many_files", "creates_files", "not_verifiable", "workspace_rule", "daily_limit"])),
  detail: z.string(),
  maxFiles: z.number().int(),
  allowCreates: z.boolean(),
});

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
  expires_at: z.string(),
  decided_at: z.string().nullable(),
  applied_sha256: z.string().nullable(),
  agent_id: z.string().nullable().optional(),
  policy: z
    .object({
      outcome: z.string(),
      version: z.string(),
      findings: z.array(z.object({ rule: z.string(), outcome: z.string(), detail: z.string() })),
      // A rehearsal that can't be read is left out rather than hiding the proposal (ADR 0075).
      shadow: ShadowSchema.optional().catch(undefined),
      workspaceRules: z.object({ version: z.number().int(), sha256: z.string() }).optional().catch(undefined),
      autonomyLevel: z.union([z.literal(2), z.literal(3)]).optional().catch(undefined),
    })
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
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
    appliedSha256: row.applied_sha256,
    policy: row.policy ?? null,
    agentId: row.agent_id ?? null,
  };
}

export interface ProofPackRecord {
  digest: string;
  status: "unverified" | "partially_verified" | "verified" | "failed";
  statement: unknown;
  previous: string | null;
  createdAt: string;
  /** Farbaek's signature, when it was signed (ADR 0062). Only read where it's shown. */
  signature?: { keyid: string; sig: string } | null;
}

/** What an applied proposal wrote and what each path holds now, for planning its undo. */
export interface RecoverySource {
  applied: AppliedFile[];
  current: Record<string, CurrentFile>;
  /** Digest of the change's ProofPack, or null when none was recorded. */
  proofPackDigest: string | null;
}

/** An invitation as owners and admins see it. The token never leaves the database as anything but its hash. */
/** A paired Farbaek Agent (migration 14). Its token hash is never readable here. */
export interface AgentRecord {
  id: string;
  name: string;
  platform: "windows" | "macos" | "linux";
  appVersion: string | null;
  pairedBy: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  /** Mesh's relay (ADR 0094): the device fingerprint, and since when it turned on "Reachable through Farbaek". */
  meshFingerprint: string | null;
  meshReachableAt: string | null;
  /** What the agent may do, where, and until when (ADR 0117). */
  lease: AgentLease & { setAt: string | null };
}

export interface InvitationRecord {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  revokedAt: string | null;
  /** Not accepted, revoked or expired, as of when it was read. */
  open: boolean;
}

/** One run of a task's contract checks in a sandbox, as its receipt. */
export interface CheckReceiptRecord {
  digest: string;
  sessionId: string;
  status: "verified" | "partially_verified" | "failed" | "unverified";
  statement: unknown;
  createdAt: string;
}

/** One recorded undo of an applied change. */
export interface RecoveryRecord {
  id: string;
  status: "recovered" | "partially_recovered";
  restored: number;
  digest: string;
  statement: unknown;
  createdAt: string;
}

export interface ProjectFile {
  path: string;
  revision: number;
  sizeBytes: number;
  sha256: string;
  updatedAt: string;
  /** "base64" for an image (ADR 0108): its content is base64 and its size and hash are over the bytes. Absent for text. */
  encoding?: "base64";
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
  /** Projects someone archived, newest archive first: still readable, so they're listed where they can be found. */
  listArchivedProjects(orgId: string): Promise<Project[]>;
  getProject(orgId: string, projectId: string): Promise<Project | null>;
  listTasks(orgId: string, options?: { projectId?: string; limit?: number }): Promise<Task[]>;
  getTask(orgId: string, taskId: string): Promise<{ task: Task; history: Transition[] } | null>;
  countEvaluations(orgId: string, from: Date, to: Date): Promise<number>;
  /** The workspace's AI usage grants that haven't expired (the usage wallet, ADR 0020). */
  listUsageGrants(orgId: string): Promise<GrantRow[]>;
  /** Current files in a project, sorted by path. */
  listFiles(orgId: string, projectId: string): Promise<ProjectFile[]>;
  getFile(orgId: string, projectId: string, path: string): Promise<ProjectFileContent | null>;
  /** Every revision of one path, newest first (including deletions). */
  listFileRevisions(orgId: string, projectId: string, path: string): Promise<FileRevision[]>;
  /** Every current text file with its content, sorted by path. Images aren't here (ADR 0108): see getProjectImages. */
  getProjectContents(orgId: string, projectId: string): Promise<{ path: string; content: string }[]>;
  /** Every current image as base64, sorted by path: for previews, the published site and downloads (ADR 0108). */
  getProjectImages(orgId: string, projectId: string): Promise<{ path: string; base64: string }[]>;
  /** One revision's content, or null when it doesn't exist or is a deletion. */
  getFileRevision(orgId: string, projectId: string, path: string, revision: number): Promise<string | null>;
  /** The workspace's autonomy setting (ADR 0046). */
  getAutonomy(orgId: string): Promise<AutonomyView>;
  /** Incidents, newest first (ADR 0083). */
  listIncidents(orgId: string): Promise<Incident[]>;
  getIncident(orgId: string, number: number): Promise<{ incident: Incident; events: IncidentEvent[] } | null>;
  /** The changes an incident is about, by shape only; `exact` is false when they're only the ones applied just before it. */
  getIncidentChanges(orgId: string, number: number): Promise<{ changes: IncidentChange[]; exact: boolean }>;
  /** The workspace's rule versions, newest first (ADR 0082). */
  getRuleVersions(orgId: string): Promise<RuleVersionView[]>;
  /** Current file paths across the workspace's projects, for the policy builder. `complete` is false when there were more than were read. */
  listProjectPaths(orgId: string): Promise<{ files: { projectId: string; path: string }[]; complete: boolean }>;
  /** Which emails the signed-in person wants (ADR 0063). Both on until they choose. */
  getEmailPreferences(): Promise<EmailPreferences>;
  /** The approved version of each of the project's own skills (ADR 0043). */
  listSkillPins(orgId: string, projectId: string): Promise<SkillPinRecord[]>;
  /** Case-insensitive plain-text search; at most 200 matching lines. */
  searchFiles(orgId: string, projectId: string, query: string): Promise<SearchHit[]>;
  /** ProofPacks recorded for a task, newest first. */
  listProofPacks(orgId: string, taskId: string): Promise<ProofPackRecord[]>;
  getProofPack(orgId: string, digest: string): Promise<ProofPackRecord | null>;
  /** The workspace's most recent ProofPacks, newest first. */
  listRecentProofPacks(orgId: string, limit: number): Promise<(ProofPackRecord & { taskId: string })[]>;
  /** What the first steps read beyond tasks: the newest ProofPack, the newest verified one and a live site (ADR 0073). */
  getFirstStepRecords(orgId: string): Promise<Pick<FirstStepFacts, "latestProofPack" | "verifiedTaskId" | "liveSite">>;
  /** Proposals made since `since` that carry a shadow-mode rehearsal, newest first (at most 200), with what became of each (ADR 0075). */
  listRehearsal(orgId: string, since: string): Promise<RehearsalRow[]>;
  /** Every file change in a project at or after `since`, oldest first (at most 500). */
  listFileChangesSince(orgId: string, projectId: string, since: string): Promise<FileChangeEvent[]>;
  /** The most recent change proposal for a task, or null. */
  getLatestProposal(orgId: string, taskId: string): Promise<ProposalRecord | null>;
  /** The AI mapping asked for in the Intent Diff Lens, if any (ADR 0044). */
  getLensSuggestion(orgId: string, proposalId: string): Promise<StoredLensSuggestion | null>;
  /** Applied changes that wrote this file, oldest first, with the reason each gave for it (ADR 0123). */
  listFileChanges(orgId: string, projectId: string, path: string): Promise<{ proposalId: string; taskId: string; appliedAt: string; model: string | null; byAgent: boolean; reason: string }[]>;
  /** A task's AI usage ledger and its sandbox sessions, for the Cost Brain (ADR 0122). */
  listTaskUsage(orgId: string, taskId: string): Promise<LedgerEntry[]>;
  listTaskSandboxes(orgId: string, taskId: string): Promise<SandboxUse[]>;
  /** The second check on a proposal, when someone asked for one (ADR 0121). */
  getSecondCheck(orgId: string, proposalId: string): Promise<(SecondCheckResult & { createdAt: string }) | null>;
  /** The latest contract version for a task, or null when none has been written. */
  getContract(orgId: string, taskId: string): Promise<ContractRecord | null>;
  /** What an applied proposal wrote, with each file's earlier and current state; null when nothing it wrote is on record. */
  getRecoverySource(orgId: string, projectId: string, proposal: { id: string; changes: readonly { path: string; kind: "create" | "edit"; baseRevision: number }[] }): Promise<RecoverySource | null>;
  /** Recoveries recorded for a task, newest first. */
  listRecoveries(orgId: string, taskId: string): Promise<RecoveryRecord[]>;
  getRecovery(orgId: string, digest: string): Promise<RecoveryRecord | null>;
  /** Sandbox check runs recorded for a task, newest first. */
  listCheckReceipts(orgId: string, taskId: string): Promise<CheckReceiptRecord[]>;
  /** The newest attempt to verify a task's applied change in one step, or null (ADR 0047). */
  getLatestVerification(orgId: string, taskId: string): Promise<VerificationRecord | null>;
  /** The newest fix started for this task, if any (ADR 0101). */
  getFixFor(orgId: string, taskId: string): Promise<TaskFix | null>;
  /** The workspace's invitations, newest first. Empty unless the reader is an owner or admin. */
  listInvitations(orgId: string): Promise<InvitationRecord[]>;
  /** The workspace's audit log, newest first (ADR 0119); `before` pages back by event id. */
  listActivity(orgId: string, options: { category: ActivityCategory | null; before: number | null; limit: number }): Promise<ActivityEvent[]>;
  /** The workspace's paired agents, revoked ones included, newest first. */
  listAgents(orgId: string): Promise<AgentRecord[]>;
  /** The records behind a project's graph (ADR 0089): its newest tasks and their evidence. */
  getProjectGraph(orgId: string, projectId: string): Promise<ProjectGraphRecords>;
  /** Governed workflows (ADR 0092), newest first. */
  listWorkflows(orgId: string): Promise<WorkflowView[]>;
  getWorkflow(orgId: string, id: string): Promise<WorkflowView | null>;
}

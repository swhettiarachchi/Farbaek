import { z } from "zod";
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
  /** Case-insensitive plain-text search; at most 200 matching lines. */
  searchFiles(orgId: string, projectId: string, query: string): Promise<SearchHit[]>;
  /** The latest contract version for a task, or null when none has been written. */
  getContract(orgId: string, taskId: string): Promise<ContractRecord | null>;
}

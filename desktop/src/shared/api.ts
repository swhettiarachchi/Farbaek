/**
 * The contract between the desktop app's window and its main process. The
 * window never sees keys or tokens: it can only ask the main process to
 * store, use or forget them. Everything crossing this bridge is plain data.
 */
import type { AgentMode } from "@/core/agent/modes";
import type { RunState } from "@/core/agent/operations";
import type { ApprovalRequest } from "@/agent-runtime/loop";

export type Provider = "anthropic" | "gemini";
export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export interface AppState {
  version: string;
  paired: { server: string; agentId: string; agentName: string; workspaceName: string } | null;
  keys: Record<Provider, boolean>;
  /** Whether the system keychain can encrypt secrets. Without it, nothing secret is stored. */
  keychain: { available: boolean; reason: string | null };
  dataFolder: string;
  /** A default name for this computer when pairing. */
  computerName: string;
}

export interface Profile {
  role: string;
  canPropose: boolean;
  sandbox: { mode: "sandboxed"; provider: string } | { mode: "review_only"; reason: string };
}

export interface TaskSummary {
  id: string;
  title: string;
  projectName: string;
  updatedAt: string;
}

export interface TaskView {
  id: string;
  title: string;
  projectName: string;
  ready: boolean;
  fileCount: number;
  contract: {
    version: number;
    outcome: string;
    resources: string[];
    allowed: string[];
    forbidden: string[];
    acceptance: string[];
    requiredChecks: string[];
  } | null;
}

export type DisplayEvent =
  | { at: string; kind: "model"; text: string; tokens: number }
  | { at: string; kind: "tool"; tool: string; target: string; status: "done" | "denied" | "declined" | "failed"; detail: string }
  | { at: string; kind: "approval"; display: string; risk: string }
  | { at: string; kind: "note"; text: string };

export interface RunDetail {
  id: string;
  taskId: string;
  taskTitle: string;
  projectName: string;
  mode: AgentMode;
  provider: Provider;
  model: string;
  state: RunState;
  startedAt: string;
  endedAt: string | null;
  /** Why the run ended, in words, once it has. */
  outcome: string | null;
  events: DisplayEvent[];
  pendingApproval: ApprovalRequest | null;
  finish: { summary: string; steps: string[]; risks: string[]; checks: string[] } | null;
  changes: { path: string; kind: "create" | "edit"; bytes: number; reason: string }[];
  notProposed: { path: string; reason: string }[];
  usage: { inputTokens: number; outputTokens: number };
  proposal: { id: string; status: "pending" | "blocked"; policy: string; violations: string[]; submittedAt: string } | null;
  discarded: boolean;
}

export type RunSummary = Pick<RunDetail, "id" | "taskId" | "taskTitle" | "projectName" | "mode" | "provider" | "state" | "startedAt" | "endedAt" | "outcome" | "proposal" | "discarded">;

export interface FarbaekAgentBridge {
  state(): Promise<AppState>;
  pair(input: { server: string; code: string; name: string }): Promise<Result<AppState>>;
  unpair(): Promise<Result<AppState>>;
  setKey(provider: Provider, key: string): Promise<Result<AppState>>;
  removeKey(provider: Provider): Promise<AppState>;
  profile(): Promise<Result<Profile>>;
  tasks(): Promise<Result<TaskSummary[]>>;
  task(id: string): Promise<Result<TaskView>>;
  startRun(input: { taskId: string; mode: AgentMode; provider: Provider }): Promise<Result<{ runId: string }>>;
  runs(): Promise<RunSummary[]>;
  run(id: string): Promise<RunDetail | null>;
  answerApproval(input: { runId: string; requestId: string; approved: boolean; bindingHash: string }): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  submitRun(runId: string): Promise<Result<RunDetail>>;
  discardRun(runId: string): Promise<void>;
  openTaskInFarbaek(taskId: string): Promise<void>;
  onRunUpdate(listener: (run: RunDetail) => void): () => void;
}

declare global {
  interface Window {
    farbaek: FarbaekAgentBridge;
  }
}

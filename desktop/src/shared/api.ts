/**
 * The contract between the desktop app's window and its main process. The
 * window never sees the agent token: it can only ask the main process to use
 * or forget it. There are no model keys: runs go through Farbaek's model
 * gateway. Everything crossing this bridge is plain data.
 */
import type { AgentMode } from "@/core/agent/modes";
import type { RunState } from "@/core/agent/operations";
import type { ApprovalRequest } from "@/agent-runtime/loop";
import type { Effort } from "@/core/agent/routing";
import type { MeshSnapshot, PreparedView } from "@/agent-runtime/mesh/node";

export type { Effort, MeshSnapshot, PreparedView };

/** Nearby transfer, or why it can't run on this computer. */
export type MeshState = { available: true; snapshot: MeshSnapshot } | { available: false; reason: string };
export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export interface AppState {
  version: string;
  paired: { server: string; agentId: string; agentName: string; workspaceName: string } | null;
  /** Whether the system keychain can encrypt secrets. Without it, nothing secret is stored. */
  keychain: { available: boolean; reason: string | null };
  dataFolder: string;
  /** A default name for this computer when pairing. */
  computerName: string;
  /** A model on this computer the agent can run on instead of Farbaek's (ADR 0134); null when none is set. */
  localModel: LocalModelSetting | null;
}

export interface LocalModelSetting {
  /** The local server's OpenAI-compatible address, on this computer only. */
  base: string;
  model: string;
}

export interface Profile {
  role: string;
  canPropose: boolean;
  sandbox: { mode: "sandboxed"; provider: string } | { mode: "review_only"; reason: string };
  /** What this agent may do, where and until when (ADR 0117). Missing from older servers. */
  lease?: { expiresAt: string; projects: string[] | null; capabilities: string[]; actionsPerHour: number };
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

/** Where a submitted proposal stands in Farbaek, from this app's last check (ADR 0042). */
export interface ProposalReview {
  status: "pending" | "blocked" | "applied" | "discarded";
  /** After this a pending proposal can only be discarded in Farbaek. */
  expiresAt: string;
  decidedAt: string | null;
  appliedSha256: string | null;
  proofPack: { digest: string; status: "unverified" | "partially_verified" | "verified" | "failed" } | null;
  /** Farbaek's proposal hash against the one worked out here from what was sent; null for runs sent before this check. */
  matchesSent: boolean | null;
  checkedAt: string;
}

export interface RunDetail {
  id: string;
  taskId: string;
  taskTitle: string;
  projectName: string;
  mode: AgentMode;
  effort: Effort;
  /** The model Farbaek chose for the latest step ("auto" before the first). */
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
  /** The share of the workspace's AI usage used, after the latest step. */
  usagePercent: number | null;
  proposal: {
    id: string;
    /** As Farbaek answered when it was sent. */
    status: "pending" | "blocked";
    policy: string;
    violations: string[];
    submittedAt: string;
    /** The proposal hash worked out on this computer from exactly what was sent. */
    sentSha256?: string;
    review?: ProposalReview;
  } | null;
  discarded: boolean;
}

export type RunSummary = Pick<RunDetail, "id" | "taskId" | "taskTitle" | "projectName" | "mode" | "effort" | "state" | "startedAt" | "endedAt" | "outcome" | "proposal" | "discarded">;

export interface FarbaekAgentBridge {
  state(): Promise<AppState>;
  pair(input: { server: string; code: string; name: string }): Promise<Result<AppState>>;
  unpair(): Promise<Result<AppState>>;
  profile(): Promise<Result<Profile>>;
  tasks(): Promise<Result<TaskSummary[]>>;
  task(id: string): Promise<Result<TaskView>>;
  /** "farbaek" uses Farbaek's AI and the workspace's usage; "local" uses the model set on this computer (ADR 0134). */
  startRun(input: { taskId: string; mode: AgentMode; effort: Effort; model?: "farbaek" | "local" }): Promise<Result<{ runId: string }>>;
  /** Lists the models a local server offers, checking it answers. */
  localModels(base: string): Promise<Result<string[]>>;
  /** Sets or clears the local model. */
  setLocalModel(input: LocalModelSetting | null): Promise<Result<AppState>>;
  runs(): Promise<RunSummary[]>;
  run(id: string): Promise<RunDetail | null>;
  answerApproval(input: { runId: string; requestId: string; approved: boolean; bindingHash: string }): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  submitRun(runId: string): Promise<Result<RunDetail>>;
  /** Asks Farbaek where the run's proposal stands now. */
  checkProposal(runId: string): Promise<Result<RunDetail>>;
  discardRun(runId: string): Promise<void>;
  openTaskInFarbaek(taskId: string): Promise<void>;
  onRunUpdate(listener: (run: RunDetail) => void): () => void;

  mesh: {
    state(): Promise<MeshState>;
    setVisible(on: boolean): Promise<Result<void>>;
    setLooking(on: boolean): Promise<Result<void>>;
    pair(at: { address: string; port: number }): Promise<Result<void>>;
    confirm(ok: boolean): Promise<Result<void>>;
    dismissPairing(): Promise<Result<void>>;
    forget(fingerprint: string): Promise<Result<void>>;
    /** Opens the folder dialog; null when the person cancels it. */
    prepare(): Promise<Result<PreparedView | null>>;
    dropPrepared(id: string): Promise<Result<void>>;
    send(input: { preparedId: string; fingerprint: string; at?: { address: string; port: number } }): Promise<Result<string>>;
    /** Be reachable by paired computers over the internet while the app is open (ADR 0094, ADR 0095). */
    setReachable(on: boolean): Promise<Result<void>>;
    /** Sends over the internet (ADR 0095): directly when the networks allow it, end to end encrypted. */
    sendOverInternet(input: { preparedId: string; fingerprint: string }): Promise<Result<string>>;
    /** The person chose Farbaek's relay for a transfer whose direct link was blocked. */
    useRelay(id: string): Promise<Result<void>>;
    /** Opens (or closes) a two-minute window for a phone or browser to pair through Farbaek (ADR 0096). */
    pairRemote(open: boolean): Promise<Result<void>>;
    /** Opens the folder dialog for where to save it; false when the person cancels it. */
    accept(id: string): Promise<Result<boolean>>;
    decline(id: string): Promise<Result<void>>;
    cancel(id: string): Promise<Result<void>>;
    resume(id: string): Promise<Result<void>>;
    dismiss(id: string): Promise<Result<void>>;
    openFolder(id: string): Promise<Result<void>>;
    onUpdate(listener: (snapshot: MeshSnapshot) => void): () => void;
  };
}

declare global {
  interface Window {
    farbaek: FarbaekAgentBridge;
  }
}

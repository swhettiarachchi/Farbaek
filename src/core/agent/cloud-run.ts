/**
 * Cloud runs (ADR 0022): the Farbaek Agent working on Farbaek's servers.
 * These rules are shared by the run executor and the Build pages: what a
 * run's states mean, and how its events are stored and shown. Events are
 * bounded so a chatty run can't grow the database or the page without limit.
 */

export const RUN_STATUSES = ["starting", "working", "waiting", "finished", "failed", "cancelled", "interrupted"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const LIVE_STATUSES: readonly RunStatus[] = ["starting", "working", "waiting"];
export const isLive = (s: RunStatus) => LIVE_STATUSES.includes(s);

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  starting: "Starting",
  working: "Working",
  waiting: "Waiting for you",
  finished: "Finished",
  failed: "Stopped",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

/** sandboxed: commands run in an isolated sandbox. review_only: no commands; the agent prepares a change only. */
export type CloudRunMode = "sandboxed" | "review_only";

export const CLOUD_RUN_MODE_LABELS: Record<CloudRunMode, string> = {
  sandboxed: "Tests and builds run in an isolated sandbox. Installs and network access ask you first.",
  review_only: "No sandbox is connected, so the agent prepares the change without running anything.",
};

/** A run's longest life, below the sandbox session and access-token lifetimes. */
export const CLOUD_RUN_MAX_MINUTES = 40;
/** A live run reports at least this often, even while waiting; after three missed reports it counts as interrupted. */
export const RUN_HEARTBEAT_MS = 60_000;
export const RUN_STALE_AFTER_MS = 3 * RUN_HEARTBEAT_MS;

export type RunEventKind = "model" | "tool" | "approval" | "note" | "command";

/** What a stored event holds. Text is clipped; nothing secret is ever stored (tool details come from the runtime, which redacts). */
export type RunEventPayload =
  | { kind: "model"; text: string; model: string; tokens: number }
  | { kind: "tool"; tool: string; target: string; status: "done" | "denied" | "declined" | "failed"; detail: string }
  | { kind: "approval"; requestId: string; display: string; risk: string; reason: string; why: string; bindingHash: string }
  | { kind: "note"; text: string; from?: "person" }
  | { kind: "command"; command: string; exitCode: number | null; output: string };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Bounds every text field so the event fits the database's 16 KB limit. */
export function boundEvent(e: RunEventPayload): { kind: RunEventKind; payload: Omit<RunEventPayload, "kind"> } {
  switch (e.kind) {
    case "model":
      return { kind: "model", payload: { text: clip(e.text, 4_000), model: clip(e.model, 100), tokens: Math.max(0, Math.round(e.tokens)) } };
    case "tool":
      return { kind: "tool", payload: { tool: clip(e.tool, 60), target: clip(e.target, 300), status: e.status, detail: clip(e.detail, 2_000) } };
    case "approval":
      return {
        kind: "approval",
        payload: { requestId: clip(e.requestId, 200), display: clip(e.display, 1_000), risk: clip(e.risk, 60), reason: clip(e.reason, 500), why: clip(e.why, 1_000), bindingHash: e.bindingHash },
      };
    case "note":
      // A person's message keeps its author, so the run's history can show who said what.
      return { kind: "note", payload: e.from === "person" ? { text: clip(e.text, 2_000), from: "person" } : { text: clip(e.text, 2_000) } };
    case "command":
      return { kind: "command", payload: { command: clip(e.command, 1_000), exitCode: e.exitCode, output: clip(e.output, 6_000) } };
  }
}

/** The sandbox image to use for a project, from its files. */
export function templateFor(paths: readonly string[]): "node-ts" | "python" {
  const has = (p: string) => paths.includes(p);
  if (has("package.json")) return "node-ts";
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) return "python";
  return "node-ts";
}

/**
 * What a cloud run is doing right now, for the Agent Core on the Build page
 * (ADR 0025). It comes only from the run's status and its recorded events,
 * so the core never shows activity the run didn't report.
 */
import type { RunEventKind, RunStatus } from "./cloud-run";

export const CORE_PHASES = ["idle", "starting", "working", "thinking", "reading", "writing", "running", "waiting", "done", "stopped"] as const;
export type CorePhase = (typeof CORE_PHASES)[number];

export const CORE_PHASE_LABELS: Record<CorePhase, string> = {
  idle: "Ready for a task",
  starting: "Getting ready",
  working: "Working",
  thinking: "Thinking",
  reading: "Reading the project",
  writing: "Writing changes",
  running: "Running a command",
  waiting: "Waiting for you",
  done: "Finished",
  stopped: "Stopped",
};

export interface PhaseEvent {
  kind: RunEventKind;
  payload: Record<string, unknown>;
}

const READ_TOOLS = new Set(["read_file", "list_files", "search_files", "review_site"]);
const WRITE_TOOLS = new Set(["write_file", "edit_file"]);

/** The run's phase from its status and its latest event. */
export function runPhase(status: RunStatus, latest: PhaseEvent | undefined): CorePhase {
  switch (status) {
    case "starting":
      return "starting";
    case "waiting":
      return "waiting";
    case "finished":
      return "done";
    case "failed":
    case "cancelled":
    case "interrupted":
      return "stopped";
    case "working":
      break;
  }
  if (!latest) return "thinking";
  if (latest.kind === "command") return "running";
  if (latest.kind === "tool") {
    const tool = typeof latest.payload.tool === "string" ? latest.payload.tool : "";
    if (READ_TOOLS.has(tool)) return "reading";
    if (WRITE_TOOLS.has(tool)) return "writing";
    if (tool === "run_command") return "running";
  }
  return "thinking";
}

/**
 * The workspace's agent as a whole, for the Build page: waiting if any run
 * waits for someone, working if any is going, otherwise ready.
 */
export function workspacePhase(statuses: readonly RunStatus[]): CorePhase {
  if (statuses.includes("waiting")) return "waiting";
  if (statuses.some((s) => s === "starting" || s === "working")) return "working";
  return "idle";
}

/** What each tool did, as a person would say it (ADR 0180). The tool's own name never reaches the screen. */
export const TOOL_VERB: Record<string, string> = {
  list_files: "Looked in",
  search_files: "Searched for",
  read_file: "Read",
  write_file: "Wrote",
  edit_file: "Edited",
  run_command: "Ran",
  review_site: "Reviewed the site",
  finish: "Finished",
};

/** A tool's target: paths and commands stay mono; a search, a summary or the project's top folder are words. */
export function toolTarget(tool: string, target: string): { text: string; mono: boolean } | null {
  if (!target || tool === "review_site") return null;
  if (tool === "search_files") return { text: `“${target}”`, mono: false };
  if (tool === "finish") return { text: target, mono: false };
  if (target === "(top)") return { text: "the project", mono: false };
  return { text: target, mono: true };
}

/** The latest step in words: a verb, and what it acted on (mono when it's a path or a command). */
export interface Activity {
  words: string;
  detail: { text: string; mono: boolean } | null;
}

/** A one-line description of the latest step, for under the phase label. */
export function latestActivity(latest: PhaseEvent | undefined): Activity | null {
  if (!latest) return null;
  const p = latest.payload;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (latest.kind) {
    case "tool": {
      const tool = s(p.tool);
      if (!tool) return null;
      const verb = TOOL_VERB[tool] ?? tool.replace(/_/g, " ");
      return { words: verb, detail: toolTarget(tool, s(p.target)) };
    }
    case "command":
      return s(p.command) ? { words: "Ran", detail: { text: s(p.command), mono: true } } : null;
    case "approval":
      return s(p.display) ? { words: "Waiting to run", detail: { text: s(p.display), mono: true } } : null;
    case "model":
    case "note":
      return null;
  }
}

export interface ChangedFile {
  path: string;
  /** "written" when the agent wrote the whole file at least once, else "edited". */
  change: "written" | "edited";
  /** How many successful writes and edits touched it. */
  times: number;
}

/**
 * The files a run changed in its copy, from its successful write and edit
 * steps, in the order first touched, and how many distinct files it read.
 */
export function runFiles(events: readonly PhaseEvent[]): { changed: ChangedFile[]; read: number } {
  const changed = new Map<string, ChangedFile>();
  const read = new Set<string>();
  for (const e of events) {
    if (e.kind !== "tool" || e.payload.status !== "done") continue;
    const tool = typeof e.payload.tool === "string" ? e.payload.tool : "";
    const path = typeof e.payload.target === "string" ? e.payload.target.trim() : "";
    if (!path) continue;
    if (tool === "read_file") read.add(path);
    if (!WRITE_TOOLS.has(tool)) continue;
    const prev = changed.get(path);
    const change = tool === "write_file" || prev?.change === "written" ? "written" : "edited";
    changed.set(path, { path, change, times: (prev?.times ?? 0) + 1 });
  }
  return { changed: [...changed.values()], read: read.size };
}

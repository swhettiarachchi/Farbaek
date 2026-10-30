/**
 * Operating modes (ADR 0131, spec §10): an explicit setting on each task
 * that says how far Farbaek may go. The database enforces the rules
 * (migration v80); this module holds the words, the limits and the notes
 * Learn and Audit tasks get instead of changes.
 */
import { z } from "zod";

export const TASK_MODES = ["learn", "pair", "build", "audit"] as const;
export type TaskMode = (typeof TASK_MODES)[number];

/** A Pair change is a small step: at most this many files. */
export const PAIR_MAX_FILES = 3;

export const MODE_INFO: Record<TaskMode, { label: string; detail: string; changes: boolean }> = {
  learn: { label: "Learn", detail: "Explains the concepts, decisions and trade-offs. Changes nothing.", changes: false },
  pair: { label: "Pair", detail: `Small steps you review one at a time: at most ${PAIR_MAX_FILES} files a change, and a person applies each one.`, changes: true },
  build: { label: "Build", detail: "Implements the approved contract within its limits.", changes: true },
  audit: { label: "Audit", detail: "Inspects and reports. Changes nothing.", changes: false },
};

export const MODE_REFUSALS = {
  MODE_NO_CHANGES: "This task is in a mode that changes nothing. Switch it to Pair or Build to change files.",
  PAIR_TOO_LARGE: `A Pair change is at most ${PAIR_MAX_FILES} files. Make the step smaller, or switch the task to Build.`,
  PAIR_NEEDS_PERSON: "A person applies every Pair change, so it wasn't applied on its own.",
} as const;

/** What the AI writes for a Learn or Audit task: never instructions, always checked. */
export const TaskNoteOutputSchema = z.object({
  summary: z.string().max(1200),
  points: z
    .array(
      z.object({
        title: z.string().max(160),
        body: z.string().max(1200),
        path: z.string().max(300).nullable(),
      }),
    )
    .max(12),
  uncertainty: z.string().max(600),
});
export type TaskNoteOutput = z.infer<typeof TaskNoteOutputSchema>;

export type NoteKind = "explanation" | "audit";

/** A kept note, as the task page shows it. */
export interface TaskNoteView {
  id: string;
  kind: "explanation" | "audit";
  summary: string;
  points: { title: string; body: string; path: string | null }[];
  uncertainty: string;
  /** Files that were in scope but not read. */
  left: string[];
  model: string;
  createdAt: string;
}

export const noteKindFor = (mode: TaskMode): NoteKind | null => (mode === "learn" ? "explanation" : mode === "audit" ? "audit" : null);

export const NOTE_LIMITS = { files: 8, totalChars: 60_000, fileChars: 20_000 } as const;

export interface TaskNoteRequest {
  kind: NoteKind;
  task: { title: string };
  contract: { outcome: string; resources: string[]; acceptanceCriteria: string[] } | null;
  files: { path: string; content: string; truncated: boolean }[];
}

/**
 * What goes to the model: the task, its contract when there is one, and up
 * to 8 files, 60,000 characters in all, longest-trimmed. Files that don't
 * fit are named in `left`, so the note can say what it didn't read.
 */
export function taskNoteRequest(
  kind: NoteKind,
  title: string,
  contract: TaskNoteRequest["contract"],
  files: readonly { path: string; content: string }[],
): { request: TaskNoteRequest; left: string[] } {
  const chosen: TaskNoteRequest["files"] = [];
  const left: string[] = [];
  let used = 0;
  for (const f of files) {
    if (chosen.length >= NOTE_LIMITS.files || used >= NOTE_LIMITS.totalChars) {
      left.push(f.path);
      continue;
    }
    const room = Math.min(NOTE_LIMITS.fileChars, NOTE_LIMITS.totalChars - used);
    const content = f.content.slice(0, room);
    used += content.length;
    chosen.push({ path: f.path, content, truncated: content.length < f.content.length });
  }
  return { request: { kind, task: { title }, contract, files: chosen }, left };
}

/** Keeps the note to what was sent: a point about a file that wasn't sent loses its path. */
export function acceptTaskNote(request: TaskNoteRequest, output: TaskNoteOutput, left: readonly string[]): TaskNoteOutput & { left: string[] } {
  const sent = new Set(request.files.map((f) => f.path));
  return {
    summary: output.summary.trim(),
    points: output.points.map((p) => ({ title: p.title.trim(), body: p.body.trim(), path: p.path && sent.has(p.path) ? p.path : null })).filter((p) => p.title || p.body),
    uncertainty: output.uncertainty.trim(),
    left: [...left],
  };
}

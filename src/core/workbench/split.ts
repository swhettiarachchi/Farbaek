/**
 * Build's workspace (stage 202, ADR 0219): the sizes of its panes. A pane's size is a share of its row or column, kept
 * between two limits so no pane can be dragged away, moved by the pointer or by the arrow keys, and remembered in this
 * browser. Pure rules; the hook that listens to the pointer is in the component.
 */
export interface SplitLimits {
  min: number;
  max: number;
}

export const AGENT_SPLIT: SplitLimits & { start: number } = { min: 0.22, max: 0.5, start: 0.32 };
export const OUTPUT_SPLIT: SplitLimits & { start: number } = { min: 0.14, max: 0.6, start: 0.28 };

/** A share kept inside its limits; anything that isn't a number is the starting share. */
export function clampSplit(value: unknown, limits: SplitLimits & { start: number }): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return limits.start;
  return Math.min(limits.max, Math.max(limits.min, value));
}

/** The arrow keys on a separator: a small step each press, the limits on Home and End. Other keys change nothing. */
export function stepSplit(value: number, key: string, limits: SplitLimits & { start: number }, grows: "ArrowRight" | "ArrowUp"): number {
  const shrinks = grows === "ArrowRight" ? "ArrowLeft" : "ArrowDown";
  if (key === grows) return clampSplit(value + 0.02, limits);
  if (key === shrinks) return clampSplit(value - 0.02, limits);
  if (key === "Home") return limits.min;
  if (key === "End") return limits.max;
  return value;
}

export interface WorkbenchLayout {
  agent: number;
  output: number;
  outputOpen: boolean;
  view: "preview" | "code";
}

export const START_LAYOUT: WorkbenchLayout = { agent: AGENT_SPLIT.start, output: OUTPUT_SPLIT.start, outputOpen: false, view: "preview" };

/** What was remembered, made safe: a missing or damaged value falls back piece by piece, never as a whole. */
export function parseLayout(raw: string | null | undefined): WorkbenchLayout {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: start afresh.
  }
  return {
    agent: clampSplit(saved.agent, AGENT_SPLIT),
    output: clampSplit(saved.output, OUTPUT_SPLIT),
    outputOpen: saved.outputOpen === true,
    view: saved.view === "code" ? "code" : "preview",
  };
}

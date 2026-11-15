"use client";

/**
 * Work the drafting assistant hands to another step's tool (stage 195): dictated rows for the Import step's typed tables, or a division
 * for the Lots step's divide panel. It travels in this tab's session storage, never in the address, and the tool shows it for checking
 * first. Clearing it, or importing, ends it.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { PlanOp } from "@/core/survey/assistant/ops";

export type Handoff = { kind: "divide"; op: Extract<PlanOp, { kind: "divide" }> } | { kind: "entry"; op: Extract<PlanOp, { kind: "measure" }> };

export const handoffKey = (projectId: string) => `farbaek.survey.handoff.${projectId}`;

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const read = (key: string): string | null => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

/** What was handed to this project's tools, or null; and a way to end it. */
export function useHandoff(projectId: string): { handoff: Handoff | null; clear(): void } {
  const key = handoffKey(projectId);
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  let handoff: Handoff | null = null;
  if (raw) {
    try {
      const v = JSON.parse(raw) as Handoff;
      if ((v.kind === "divide" && v.op?.kind === "divide") || (v.kind === "entry" && v.op?.kind === "measure")) handoff = v;
    } catch {
      handoff = null;
    }
  }
  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Nothing kept, nothing to clear.
    }
    listeners.forEach((l) => l());
  }, [key]);
  return { handoff, clear };
}

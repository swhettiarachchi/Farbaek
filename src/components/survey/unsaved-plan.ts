import { useSyncExternalStore } from "react";

/**
 * Whether the plan editor on this page holds changes that aren't saved (stage 224). A one-press answer elsewhere on the page (Confirm,
 * Keep as surveyed) saves a new version from the stored plan, and the editor then starts again from it: so those answers wait until
 * the editor's changes are saved, rather than throw them away without a word.
 */
let unsaved = false;
const listeners = new Set<() => void>();

export function setPlanUnsaved(value: boolean): void {
  if (unsaved === value) return;
  unsaved = value;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const PLAN_UNSAVED_REASON = "Save your changes to the plan first: this answer is saved as a new version of the plan as it's stored.";

export function usePlanUnsaved(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => unsaved,
    () => false,
  );
}

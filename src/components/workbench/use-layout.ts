"use client";

/**
 * The workspace's layout, remembered in this browser (stage 202): how wide the Agent pane is, how tall Output is, whether
 * Output is open, and whether the middle shows the preview or the code. Read with useSyncExternalStore, so the server and the
 * first paint agree (both start from the defaults) and the remembered sizes arrive without a flash of the wrong ones.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseLayout, type WorkbenchLayout } from "@/core/workbench/split";

const KEY = "farbaek.workbench-layout";
const CHANGED = "farbaek:workbench-layout";

/** The layout for this visit, used only when the browser won't store it (a private window, storage turned off). */
let memory: string | null = null;

function read(): string {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function useLayout(): [WorkbenchLayout, (patch: Partial<WorkbenchLayout>) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const layout = useMemo(() => parseLayout(raw), [raw]);
  const change = useCallback((patch: Partial<WorkbenchLayout>) => {
    const next = JSON.stringify({ ...parseLayout(read()), ...patch });
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage refused: the layout still changes, and holds for this visit.
      memory = next;
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return [layout, change];
}

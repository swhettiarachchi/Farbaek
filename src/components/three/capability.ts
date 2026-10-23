type Navigator3D = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/** A primary pointer that hovers and is precise: a mouse or trackpad. */
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Whether this device should get a 3D scene: a mouse or trackpad, no
 * Save-Data, at least 4 GB of memory and 4 cores where the browser says, and
 * WebGL. Reduced motion is checked by the caller, which also keeps the
 * static version on a slow start.
 *
 * Touch-first screens keep the static artwork (ADR 0052). On a mid-range
 * phone profile the hero scene cost about 240 KB of script and 650 ms of
 * blocked main thread, right when people start scrolling and typing.
 */
export function canRun3D(): boolean {
  if (!window.matchMedia(FINE_POINTER_QUERY).matches) return false;
  const nav = navigator as Navigator3D;
  if (nav.connection?.saveData) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) return false;
  if (nav.hardwareConcurrency && nav.hardwareConcurrency < 4) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Runs `cb` once the browser is idle (at most 2 seconds later), or after a short wait where it can't say. Returns a cancel function. */
export function whenIdle(cb: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(cb, { timeout: 2000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(cb, 1200);
  return () => window.clearTimeout(handle);
}

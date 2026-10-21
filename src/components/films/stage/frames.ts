/**
 * The recorder waits for every preview frame on the stage to finish
 * loading before it takes a picture, so a frame is never half drawn.
 */
const frames = new Map<HTMLIFrameElement, boolean>();

export function noteFrameMounted(el: HTMLIFrameElement): void {
  if (!frames.has(el)) frames.set(el, false);
}

export function noteFrameLoaded(el: HTMLIFrameElement): void {
  frames.set(el, true);
}

/** Resolves when every mounted frame has loaded, or after `timeoutMs`. */
export async function framesSettled(timeoutMs = 4000): Promise<void> {
  const started = performance.now();
  for (;;) {
    for (const el of [...frames.keys()]) if (!el.isConnected) frames.delete(el);
    if ([...frames.values()].every(Boolean) || performance.now() - started > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 30));
  }
}

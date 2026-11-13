/**
 * What changed between two looks at Nearby's transfers (stage 188): an offer that started waiting for the person, one
 * that stopped waiting, an arrival, and how far everything moving has got. Runs on every update, whether or not a
 * window is open, and looks for "first seen as done" rather than a step from one state to the next, because updates
 * are merged and a short state can be skipped.
 */

export interface TransferLike {
  id: string;
  direction: "in" | "out";
  state: string;
  bytes: number;
  bytesDone: number;
}

export interface TransferEvents {
  /** Incoming offers seen waiting for the first time. */
  offered: string[];
  /** Offers that were waiting and no longer are (accepted, declined, cancelled, or gone). */
  ended: string[];
  /** Incoming transfers seen done for the first time. */
  arrived: string[];
  /** Everything moving, for the taskbar: a fraction from 0 to 1, paused while another transfer waits to resume; null when nothing moves. */
  progress: { fraction: number; mode: "normal" | "paused" } | null;
}

const MOVING = new Set(["connecting", "waiting", "sending", "receiving", "finishing"]);

/** Compares against `seen` (id to last state), returns what changed, and updates `seen` to now. */
export function transferEvents(seen: Map<string, string>, transfers: TransferLike[]): TransferEvents {
  const events: TransferEvents = { offered: [], ended: [], arrived: [], progress: null };
  const present = new Set<string>();
  let bytes = 0;
  let done = 0;
  let moving = 0;
  let paused = false;
  for (const t of transfers) {
    present.add(t.id);
    const before = seen.get(t.id);
    if (t.direction === "in") {
      if (t.state === "offered" && before !== "offered") events.offered.push(t.id);
      if (before === "offered" && t.state !== "offered") events.ended.push(t.id);
      if (t.state === "done" && before !== "done") events.arrived.push(t.id);
    }
    if (MOVING.has(t.state)) {
      moving += 1;
      bytes += t.bytes;
      done += Math.min(t.bytesDone, t.bytes);
    }
    if (t.state === "interrupted") paused = true;
    seen.set(t.id, t.state);
  }
  for (const [id, state] of [...seen]) {
    if (present.has(id)) continue;
    if (state === "offered") events.ended.push(id);
    seen.delete(id);
  }
  if (moving > 0) events.progress = { fraction: bytes > 0 ? done / bytes : 0, mode: paused ? "paused" : "normal" };
  return events;
}

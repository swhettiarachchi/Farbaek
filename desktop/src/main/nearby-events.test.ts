import { describe, expect, it } from "vitest";
import { transferEvents, type TransferLike } from "./nearby-events";

const incoming = (id: string, state: string, bytesDone = 0, bytes = 100): TransferLike => ({ id, direction: "in", state, bytes, bytesDone });
const outgoing = (id: string, state: string, bytesDone = 0, bytes = 100): TransferLike => ({ id, direction: "out", state, bytes, bytesDone });

describe("what changed in Nearby, for notifications and the taskbar (stage 188)", () => {
  it("tells of an offer once, and of its end once, however often it's looked at", () => {
    const seen = new Map<string, string>();
    expect(transferEvents(seen, [incoming("a", "offered")]).offered).toEqual(["a"]);
    expect(transferEvents(seen, [incoming("a", "offered")]).offered).toEqual([]);
    const accepted = transferEvents(seen, [incoming("a", "receiving", 10)]);
    expect(accepted.ended).toEqual(["a"]);
    expect(transferEvents(seen, [incoming("a", "receiving", 20)]).ended).toEqual([]);
  });

  it("tells of an arrival the first time it's seen done, even when the steps before it were never seen", () => {
    const seen = new Map<string, string>();
    // Updates are merged, so "offered" can go straight to "done" between two looks.
    transferEvents(seen, [incoming("a", "offered")]);
    const events = transferEvents(seen, [incoming("a", "done", 100)]);
    expect(events.arrived).toEqual(["a"]);
    expect(events.ended).toEqual(["a"]);
    expect(transferEvents(seen, [incoming("a", "done", 100)]).arrived).toEqual([]);
    // One first seen already done counts too.
    expect(transferEvents(seen, [incoming("a", "done", 100), incoming("b", "done", 100)]).arrived).toEqual(["b"]);
  });

  it("ends an offer that disappears, and forgets transfers that leave the list", () => {
    const seen = new Map<string, string>();
    transferEvents(seen, [incoming("a", "offered")]);
    expect(transferEvents(seen, []).ended).toEqual(["a"]);
    expect(seen.size).toBe(0);
  });

  it("never tells of a send as an arrival", () => {
    const seen = new Map<string, string>();
    const events = transferEvents(seen, [outgoing("x", "done", 100)]);
    expect(events.arrived).toEqual([]);
    expect(events.offered).toEqual([]);
  });

  it("adds up everything moving for the taskbar, paused while another waits to resume, and clears when nothing moves", () => {
    const seen = new Map<string, string>();
    expect(transferEvents(seen, [incoming("a", "receiving", 25, 100), outgoing("b", "sending", 75, 100)]).progress).toEqual({ fraction: 0.5, mode: "normal" });
    expect(transferEvents(seen, [incoming("a", "receiving", 50, 100), outgoing("b", "interrupted", 75, 100)]).progress).toEqual({ fraction: 0.5, mode: "paused" });
    expect(transferEvents(seen, [incoming("a", "done", 100, 100)]).progress).toBeNull();
    expect(transferEvents(seen, [incoming("c", "receiving", 0, 0)]).progress).toEqual({ fraction: 0, mode: "normal" });
  });
});

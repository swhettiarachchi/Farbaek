/** A Generate Plan run as a job (stage 229, ADR 0239). */
import { describe, expect, it } from "vitest";
import { JOB_STALE_MS, advance, allFinished, generateStages, jobState } from "./job";

describe("a Generate Plan job's stages", () => {
  it("starts importing, with drawing waiting and the sketches waiting or skipped", () => {
    expect(generateStages(2, 3).map((s) => [s.id, s.label, s.state])).toEqual([
      ["import", "Importing 2 files", "running"],
      ["draw", "Drawing the plan", "waiting"],
      ["sketches", "Reading 3 sketches with Claude", "waiting"],
    ]);
    expect(generateStages(1, 0)[2]).toEqual({ id: "sketches", label: "No sketches to read", state: "skipped" });
  });

  it("starts the next waiting stage when one is done, and says what happened", () => {
    let s = generateStages(1, 1);
    s = advance(s, "import", "done");
    expect(s.map((x) => x.state)).toEqual(["done", "running", "waiting"]);
    s = advance(s, "draw", "done", "Lot 1, the road and 14 lines.");
    expect(s[1]).toMatchObject({ state: "done", detail: "Lot 1, the road and 14 lines." });
    expect(s[2]!.state).toBe("running");
    expect(allFinished(s)).toBe(false);
    s = advance(s, "sketches", "failed", "The AI provider is busy.");
    expect(allFinished(s)).toBe(true);
  });

  it("starts the sketches after a failed draw too, and keeps a long detail without losing the stages", () => {
    let s = advance(generateStages(1, 1), "import", "done");
    s = advance(s, "draw", "failed", "x".repeat(400));
    expect(s.map((x) => x.state)).toEqual(["done", "failed", "running"]);
    expect(s[1]!.detail).toHaveLength(300);
  });

  it("shows a running job silent for over 15 minutes as interrupted", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(jobState({ state: "running", updated_at: new Date(now.getTime() - 60_000).toISOString() }, now)).toBe("running");
    expect(jobState({ state: "running", updated_at: new Date(now.getTime() - JOB_STALE_MS - 1).toISOString() }, now)).toBe("interrupted");
    expect(jobState({ state: "done", updated_at: "2026-01-01T00:00:00Z" }, now)).toBe("done");
  });
});

/** A Generate Plan run as a job (stage 229, ADR 0239). */
import { describe, expect, it } from "vitest";
import { JOB_STALE_MS, advance, allFinished, finishable, generateStages, jobState, stoppedBeforeDrawing, tookText, type JobStage } from "./job";

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

describe("a Generate Plan job, timed and finished (stage 235)", () => {
  const t0 = new Date("2026-11-23T12:00:00.000Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);

  it("records when each stage began and how long it took, measured with the clock it's given", () => {
    let s = generateStages(1, 1, t0);
    expect(s[0]).toMatchObject({ state: "running", startedAt: t0.toISOString() });
    s = advance(s, "import", "done", undefined, at(1_400));
    expect(s[0]).toMatchObject({ state: "done", ms: 1_400 });
    expect(s[1]).toMatchObject({ state: "running", startedAt: at(1_400).toISOString() });
    s = advance(s, "draw", "failed", "No lot.", at(2_000));
    expect(s[1]).toMatchObject({ state: "failed", ms: 600 });
    // Without a clock, nothing is timed: the stages are as before.
    expect(advance(generateStages(1, 1), "import", "done")[0]).toEqual({ id: "import", label: "Importing 1 file", state: "done" });
  });

  it("says a measured time as a reader would", () => {
    expect([tookText(400), tookText(9_940), tookText(9_960), tookText(12_400), tookText(125_000), tookText(120_000)]).toEqual(["0.4 s", "9.9 s", "10 s", "12 s", "2 min 5 s", "2 min"]);
    // Whole seconds first: never "60 s" or "1 min 60 s".
    expect([tookText(59_600), tookText(119_600)]).toEqual(["1 min", "2 min"]);
  });

  it("offers to finish only a cut-off run whose files were all imported and whose plan is still on its first version", () => {
    const now = at(JOB_STALE_MS + 60_000);
    const stages = (importing: JobStage["state"], drawing: JobStage["state"]): JobStage[] => [
      { id: "import", label: "Importing 1 file", state: importing },
      { id: "draw", label: "Drawing the plan", state: drawing },
      { id: "sketches", label: "No sketches to read", state: "skipped" },
    ];
    const job = (state: "running" | "done" | "interrupted", s: JobStage[], quiet = true) => ({ state, stages: s, updated_at: (quiet ? t0 : now).toISOString() });
    expect(finishable(job("running", stages("done", "running")), now, 1)).toBe(true);
    expect(finishable(job("interrupted", stages("done", "waiting")), now, 1)).toBe(true);
    // Still working, finished, drawn, or cut off before every file arrived: nothing to finish here.
    expect(finishable(job("running", stages("done", "running"), false), now, 1)).toBe(false);
    expect(finishable(job("done", stages("done", "done")), now, 1)).toBe(false);
    expect(finishable(job("interrupted", stages("done", "done")), now, 1)).toBe(false);
    expect(finishable(job("interrupted", stages("running", "waiting")), now, 1)).toBe(false);
    // The plan saved since (drawn from the Draft step, edited, or drawn just before the cut-off): never drawn over.
    expect(finishable(job("interrupted", stages("done", "waiting")), now, 2)).toBe(false);
    expect(stoppedBeforeDrawing(job("interrupted", stages("done", "waiting")), now)).toBe(true);
  });
});

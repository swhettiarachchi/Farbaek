import { describe, expect, it } from "vitest";
import { AGENT_SPLIT, OUTPUT_SPLIT, START_LAYOUT, clampSplit, parseLayout, stepSplit } from "./split";

describe("pane sizes", () => {
  it("stay between their limits", () => {
    expect(clampSplit(0.01, AGENT_SPLIT)).toBe(AGENT_SPLIT.min);
    expect(clampSplit(0.99, AGENT_SPLIT)).toBe(AGENT_SPLIT.max);
    expect(clampSplit(0.4, AGENT_SPLIT)).toBe(0.4);
  });

  it("fall back to the start for anything that isn't a number", () => {
    for (const v of [null, undefined, "0.4", Number.NaN, Number.POSITIVE_INFINITY, {}]) expect(clampSplit(v, AGENT_SPLIT)).toBe(AGENT_SPLIT.start);
  });

  it("move a small step with the arrow keys and stop at the limits", () => {
    expect(stepSplit(0.3, "ArrowRight", AGENT_SPLIT, "ArrowRight")).toBeCloseTo(0.32);
    expect(stepSplit(0.3, "ArrowLeft", AGENT_SPLIT, "ArrowRight")).toBeCloseTo(0.28);
    expect(stepSplit(AGENT_SPLIT.max, "ArrowRight", AGENT_SPLIT, "ArrowRight")).toBe(AGENT_SPLIT.max);
    expect(stepSplit(0.3, "ArrowUp", OUTPUT_SPLIT, "ArrowUp")).toBeCloseTo(0.32);
    expect(stepSplit(0.3, "ArrowDown", OUTPUT_SPLIT, "ArrowUp")).toBeCloseTo(0.28);
  });

  it("jump to the limits on Home and End, and ignore other keys", () => {
    expect(stepSplit(0.3, "Home", AGENT_SPLIT, "ArrowRight")).toBe(AGENT_SPLIT.min);
    expect(stepSplit(0.3, "End", AGENT_SPLIT, "ArrowRight")).toBe(AGENT_SPLIT.max);
    expect(stepSplit(0.3, "a", AGENT_SPLIT, "ArrowRight")).toBe(0.3);
  });
});

describe("the remembered layout", () => {
  it("starts from the defaults when nothing is remembered", () => {
    expect(parseLayout(null)).toEqual(START_LAYOUT);
    expect(parseLayout("")).toEqual(START_LAYOUT);
  });

  it("survives damage: not JSON, not an object, wrong kinds", () => {
    expect(parseLayout("{oops")).toEqual(START_LAYOUT);
    expect(parseLayout("[1,2]")).toEqual(START_LAYOUT);
    expect(parseLayout(JSON.stringify({ agent: "wide", output: null, outputOpen: "yes", view: "terminal" }))).toEqual(START_LAYOUT);
  });

  it("keeps what is sound and repairs the rest piece by piece", () => {
    expect(parseLayout(JSON.stringify({ agent: 0.9, output: 0.3, outputOpen: true, view: "code" }))).toEqual({ agent: AGENT_SPLIT.max, output: 0.3, outputOpen: true, view: "code" });
  });
});

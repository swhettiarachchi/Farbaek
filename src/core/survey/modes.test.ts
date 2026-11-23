/** Three ways through one survey project (stage 227, ADR 0238). */
import { describe, expect, it } from "vitest";
import { parseMode, stepsFor } from "./modes";

const ALL = ["import", "points", "draft", "boundary", "plan", "check", "export", "history", "settings"].map((id) => ({ id }));
const ids = (steps: { id: string }[]) => steps.map((s) => s.id);

describe("survey modes", () => {
  it("defaults to Express, and reads only a known mode", () => {
    expect(parseMode(undefined)).toBe("express");
    expect(parseMode("professional")).toBe("professional");
    expect(parseMode("admin")).toBe("express");
  });

  it("shows Express only what needs the surveyor: draw until drawn, then the plan and approval", () => {
    expect(ids(stepsFor("express", ALL, { drawn: false, current: "draft" }))).toEqual(["draft", "plan", "export"]);
    expect(ids(stepsFor("express", ALL, { drawn: true, current: "plan" }))).toEqual(["plan", "export"]);
  });

  it("shows Professional every step, and Manual CAD the drawing steps", () => {
    expect(ids(stepsFor("professional", ALL, { drawn: true, current: "plan" }))).toEqual(ids(ALL));
    expect(ids(stepsFor("cad", ALL, { drawn: true, current: "plan" }))).toEqual(["points", "boundary", "plan", "export"]);
  });

  it("always shows the step that's open, in its place, so no link leads nowhere", () => {
    expect(ids(stepsFor("express", ALL, { drawn: true, current: "history" }))).toEqual(["plan", "export", "history"]);
    expect(ids(stepsFor("express", ALL, { drawn: true, current: "check" }))).toEqual(["plan", "check", "export"]);
  });
});

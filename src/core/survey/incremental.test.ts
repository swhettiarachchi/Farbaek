/**
 * What a correction changes on the plan, and what it never touches (stage 250, ADR 0258). The plan is worked out again from its saved
 * inputs on every view, about 5 ms for a typical job (docs/survey/BENCHMARKS.md), so nothing is cached: these tests hold the guarantee
 * the owner's brief asks of incremental regeneration instead, that a correction changes only what depends on it. SYNTHETIC sample data.
 */
import { describe, expect, it } from "vitest";
import type { SurveyDocument } from "./document";
import { SAMPLE_POINTS, sampleDocument } from "./fixtures";
import type { SceneItem, SceneText } from "./sheet/scene";
import { buildPlan, type PlanInput, type PlanView } from "./view";

const input = (document: SurveyDocument = sampleDocument()): PlanInput => ({ points: SAMPLE_POINTS, document, crsId: "EPSG:5235", crsConfirmation: "Confirmed by the sample surveyor", surveyor: null, approval: null, version: 1 });
const items = (v: PlanView): SceneItem[] => v.sheet.pages.flatMap((p) => p.items);
const lines = (v: PlanView) => JSON.stringify(items(v).filter((i) => i.kind !== "text"));
const texts = (v: PlanView) => items(v).filter((i): i is SceneText => i.kind === "text");
/** Text outside the title paragraph, which wraps with what it names. */
const outside = (ts: SceneText[]) => ts.filter((t) => t.entity !== "title");
const geometry = (v: PlanView) => JSON.stringify(v.lots.lots.map((l) => [l.lot.id, l.parcel?.areaM2, l.parcel?.perimeterM, l.parcel?.vertices.map((p) => p.id)]));

describe("a correction changes only what depends on it", () => {
  it("draws the same plan from the same inputs, every time: nothing depends on when or how often it's worked out", () => {
    expect(JSON.stringify(buildPlan(input()))).toBe(JSON.stringify(buildPlan(input())));
  });

  it("renaming a lot leaves every lot's outline and area, and every line and mark on the sheet, exactly as they were", () => {
    const before = buildPlan(input());
    const doc = sampleDocument();
    doc.lots = doc.lots.map((l) => (l.id === "lot-b1" ? { ...l, label: "C" } : l));
    const after = buildPlan(input(doc));
    expect(geometry(after)).toBe(geometry(before));
    expect(lines(after)).toBe(lines(before));
    // The title paragraph names the lots, so it may wrap again. Every other piece of text stays where it was, give or take the width of
    // a letter (C isn't as wide as B), and the only words that change are the lot's own name, B to C.
    const [a, b] = [outside(texts(before)), outside(texts(after))];
    expect(b.length).toBe(a.length);
    a.forEach((t, i) => {
      expect(Math.abs(b[i]!.x - t.x)).toBeLessThan(0.1);
      expect(Math.abs(b[i]!.y - t.y)).toBeLessThan(0.1);
      expect(b[i]!.rotate).toBe(t.rotate);
    });
    const changed = a.flatMap((t, i) => (t.text !== b[i]!.text ? [[t.text, b[i]!.text]] : []));
    expect(changed.length).toBeGreaterThan(0);
    for (const [was, now] of changed) expect(now).toBe(was!.replace(/B/g, "C"));
  });

  it("moving one label moves that label alone: every other piece of text stays exactly where it was", () => {
    const before = buildPlan(input());
    const moved = texts(before).find((t) => t.entity?.startsWith("lot:"))!;
    const doc = sampleDocument();
    doc.labelOffsets = { [moved.entity!]: { dx: 4, dy: -3, ...(moved.slot !== undefined ? { slot: moved.slot } : {}) } };
    const after = buildPlan(input(doc));
    const others = (v: PlanView) => JSON.stringify(texts(v).filter((t) => t.entity !== moved.entity));
    expect(others(after)).toBe(others(before));
    expect(lines(after)).toBe(lines(before));
    expect(geometry(after)).toBe(geometry(before));
    expect(JSON.stringify(texts(after).filter((t) => t.entity === moved.entity))).not.toBe(JSON.stringify(texts(before).filter((t) => t.entity === moved.entity)));
  });

  it("changing the land's name in the title block changes its words alone: the same checks, outlines, lines and marks", () => {
    const before = buildPlan(input());
    const doc = sampleDocument();
    doc.sheet = { ...doc.sheet, landName: "Another sample land" };
    const after = buildPlan(input(doc));
    expect(JSON.stringify(after.findings)).toBe(JSON.stringify(before.findings));
    expect(geometry(after)).toBe(geometry(before));
    expect(lines(after)).toBe(lines(before));
    // The title paragraph is the only text that holds the name, so it alone may wrap again: everything else is exactly as it was.
    expect(JSON.stringify(outside(texts(after)))).toBe(JSON.stringify(outside(texts(before))));
    expect(texts(after).some((t) => t.entity === "title" && t.text === "ANOTHER SAMPLE LAND")).toBe(true);
  });
});

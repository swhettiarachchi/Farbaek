/** Only what needs the surveyor (stage 224, ADR 0235). Every point and plan here is SYNTHETIC. */
import { describe, expect, it } from "vitest";
import { autoDraft } from "./autodraft";
import { crsById } from "./crs";
import { emptyDocument, type SurveyDocument } from "./document";
import { autoDoubt, doubtContext, drawnWithoutDoubt, exceptionsFor, planStatus } from "./exceptions";
import { computeLots } from "./lots";
import type { SurveyPoint } from "./parcel";
import { checkSurvey, type Finding } from "./qc";

let seq = 0;
const pt = (pointId: string, e: number, n: number, code: string | null): SurveyPoint => ({ id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, pointId, e: 500_000 + e, n: 600_000 + n, z: null, code });

function rectangle(roadSouth = -6): SurveyPoint[] {
  seq = 0;
  return [
    pt("1", 0, 0, "CP"),
    pt("2", 40, 0, "CP"),
    pt("3", 40, 25, "CP MW"),
    pt("4", 20, 25.1, "MW"),
    pt("5", 0, 25, "CP MW"),
    pt("30", -5, -1, "RD1"),
    pt("31", 45, -1, "RD1"),
    pt("32", -5, roadSouth, "RD2"),
    pt("33", 45, -6, "RD2"),
  ];
}

const check = (points: SurveyPoint[], doc: SurveyDocument) => checkSurvey({ points, crs: crsById("EPSG:5235"), crsConfirmed: true, document: doc, lots: computeLots(points, doc.lots), surveyorProfile: true });
const finding = (f: Partial<Finding>): Finding => ({ code: "X", severity: "information", message: "m", target: { kind: "project" }, action: "a", blocks: [], ...f });

describe("doubts about what the automatic draft made", () => {
  it("has none for a rectangle observed in order, its lines, a steady road or the stated date", () => {
    const points = rectangle();
    const d = autoDraft({ points, document: emptyDocument(), surveyDate: "2026-11-20" }).document;
    for (const key of Object.keys(d.provenance)) expect(autoDoubt(d, points, key)).toBeNull();
    expect(drawnWithoutDoubt(d, points)).toEqual(["Lot 1", "the road", "the survey date", "1 line joined from the field codes"]);
  });

  it("asks about a lot that turns inward, naming the corner", () => {
    seq = 0;
    const ell = [pt("1", 0, 0, "CP"), pt("2", 40, 0, "CP"), pt("3", 40, 20, "CP"), pt("4", 20, 20, "CP"), pt("5", 20, 40, "CP"), pt("6", 0, 40, "CP")];
    const d = autoDraft({ points: ell, document: emptyDocument() }).document;
    expect(autoDoubt(d, ell, "lot:lot-1")).toBe("Lot 1 turns inward at point 4: a corner of the land, or a mark inside it?");
    expect(drawnWithoutDoubt(d, ell)).toEqual([]);
  });

  it("asks about a road whose edges aren't a steady width apart", () => {
    const points = rectangle(-7);
    const d = autoDraft({ points, document: emptyDocument() }).document;
    expect(autoDoubt(d, points, "road:road-1")).toMatch(/^The road is 5\.00 to 6\.0\d m wide between its surveyed edges: check each edge point is coded to the right side\.$/);
  });

  it("doesn't take a mark a centimetre off a straight leg for a corner", () => {
    seq = 0;
    const almost = [pt("1", 0, 0, "CP"), pt("2", 20, 0.01, "CP"), pt("3", 40, 0, "CP"), pt("4", 40, 25, "CP"), pt("5", 0, 25, "CP")];
    const d = autoDraft({ points: almost, document: emptyDocument() }).document;
    expect(d.lots[0]!.points).toHaveLength(5);
    expect(autoDoubt(d, almost, "lot:lot-1")).toBeNull();
  });

  it("asks about a drawn lot whose area differs from the stated extent: a mark outside the land may be a corner", () => {
    const points = rectangle();
    const d = autoDraft({ points, document: emptyDocument() }).document;
    expect(autoDoubt(d, points, "lot:lot-1", { extentDiffers: true })).toBe("Lot 1's area differs from the stated extent: check every boundary mark it runs through is a corner of this land.");
    expect(autoDoubt(d, points, "lot:lot-1", doubtContext([finding({ code: "STATED_EXTENT_DIFFERS", severity: "warning" })]))).not.toBeNull();
    // With other lots on the plan, the stated extent is the whole land's, not this lot's.
    const two = { ...d, lots: [...d.lots, { ...d.lots[0]!, id: "lot-2", label: "2" }] };
    expect(autoDoubt(two, points, "lot:lot-1", { extentDiffers: true })).toBeNull();
  });

  it("asks about a line joined from the codes with one leg far longer than the rest", () => {
    seq = 0;
    const walls = [pt("1", 0, 0, "MW"), pt("2", 5, 0, "MW"), pt("3", 10, 0, "MW"), pt("4", 10, 40, "MW"), pt("5", 15, 40, "MW")];
    const doc: SurveyDocument = { ...emptyDocument(), features: [{ id: "f-auto-1", layer: "WALLS", code: "MW", closed: false, points: walls.map((p) => p.id) }], provenance: { "feature:f-auto-1": { source: "auto", reviewed: false } } };
    expect(autoDoubt(doc, walls, "feature:f-auto-1")).toBe("The masonry wall line jumps 40.0 m from point 3 to point 4: one line, or two under the same code?");
    // Evenly spaced, or too short to tell, it carries no doubt.
    const even = { ...doc, features: [{ ...doc.features[0]!, points: walls.slice(0, 3).map((p) => p.id) }] };
    expect(autoDoubt(even, walls, "feature:f-auto-1")).toBeNull();
  });

  it("doubts nothing once the surveyor confirmed it, or that wasn't drawn by the draft", () => {
    seq = 0;
    const ell = [pt("1", 0, 0, "CP"), pt("2", 40, 0, "CP"), pt("3", 40, 20, "CP"), pt("4", 20, 20, "CP"), pt("5", 20, 40, "CP"), pt("6", 0, 40, "CP")];
    const d = autoDraft({ points: ell, document: emptyDocument() }).document;
    const typed = { ...d, provenance: {} };
    expect(autoDoubt(typed, ell, "lot:lot-1")).toBeNull();
    const confirmed = { ...d, provenance: { "lot:lot-1": { source: "auto" as const, reviewed: true } } };
    expect(check(ell, confirmed).some((f) => f.code === "AUTO_ITEMS_UNREVIEWED")).toBe(false);
  });
});

describe("the surveyor's list", () => {
  it("opens the two items-to-check findings into one entry per item, each with its own Confirm", () => {
    seq = 0;
    const ell = [pt("1", 0, 0, "CP"), pt("2", 40, 0, "CP"), pt("3", 40, 20, "CP"), pt("4", 20, 20, "CP"), pt("5", 20, 40, "CP"), pt("6", 0, 40, "CP")];
    const drawn = autoDraft({ points: ell, document: emptyDocument() }).document;
    const doc: SurveyDocument = { ...drawn, sheet: { ...drawn.sheet, landName: "Sample Watta" }, provenance: { ...drawn.provenance, "sheet.landName": { source: "ai_photo", reviewed: false } } };
    const list = exceptionsFor(doc, ell, check(ell, doc));
    const confirms = list.confirm.filter((e) => e.confirm && e.confirm !== "codes");
    expect(confirms.map((e) => [e.confirm, e.title, e.step])).toEqual([
      ["sheet.landName", "Land called: filled in from a photo, not confirmed yet.", "plan"],
      ["lot:lot-1", "Lot 1 turns inward at point 4: a corner of the land, or a mark inside it?", "boundary"],
    ]);
    expect(confirms[1]!.holds).toBe("Holds approval until it's resolved.");
    // The code list is confirmed with one press too.
    expect(list.confirm.find((e) => e.code === "LEGEND_UNREVIEWED")?.confirm).toBe("codes");
  });

  it("sorts what must be fixed, what holds approval and what's only for information, and sends each to its step", () => {
    const list = exceptionsFor(emptyDocument(), [], [
      finding({ code: "BOUNDARY_SELF_INTERSECTS", severity: "error", target: { kind: "lot", id: "lot-1" }, blocks: ["export", "approval"], detail: "Legs 1 and 3 cross." }),
      finding({ code: "CRS_NOT_CONFIRMED", severity: "professional_review", blocks: ["approval"] }),
      finding({ code: "POINTS_NEAR_DUPLICATE", severity: "warning", target: { kind: "point" }, keep: { key: "dup:a", kept: false } }),
      finding({ code: "RULES_REMINDER", severity: "information" }),
    ]);
    expect(list.fix.map((e) => [e.code, e.step, e.holds, e.evidence])).toEqual([["BOUNDARY_SELF_INTERSECTS", "boundary", "Holds export and approval until it's resolved.", "Legs 1 and 3 cross."]]);
    expect(list.confirm.map((e) => [e.code, e.step])).toEqual([["CRS_NOT_CONFIRMED", "settings"]]);
    expect(list.note.map((e) => [e.code, e.holds, e.keep])).toEqual([
      ["POINTS_NEAR_DUPLICATE", null, { key: "dup:a", kept: false }],
      ["RULES_REMINDER", null, null],
    ]);
  });

  it("keeps two findings of one code about one item apart", () => {
    const twice = [finding({ code: "LOTS_OVERLAP", target: { kind: "lot", id: "l1" }, blocks: ["export"] }), finding({ code: "LOTS_OVERLAP", target: { kind: "lot", id: "l1" }, blocks: ["export"] })];
    const ids = exceptionsFor(emptyDocument(), [], twice).fix.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("the plan's status", () => {
  const fix = finding({ severity: "error", blocks: ["export"] });
  const confirm = finding({ severity: "professional_review", blocks: ["approval"] });
  it("follows what's drawn, what the checks hold back, the approval and the exports", () => {
    expect(planStatus({ drawn: false, findings: [], approved: false, exported: false })).toBe("not_drawn");
    expect(planStatus({ drawn: true, findings: [confirm, fix], approved: false, exported: false })).toBe("needs_correction");
    expect(planStatus({ drawn: true, findings: [confirm], approved: false, exported: false })).toBe("needs_confirmation");
    expect(planStatus({ drawn: true, findings: [finding({})], approved: false, exported: false })).toBe("ready");
    expect(planStatus({ drawn: true, findings: [], approved: true, exported: false })).toBe("approved");
    expect(planStatus({ drawn: true, findings: [], approved: true, exported: true })).toBe("exported");
  });
});

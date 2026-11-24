/**
 * Crowded legs left to the boundaries schedule (stage 240, ADR 0248). SYNTHETIC: eight lots 8 m wide and 25 m deep in a row, with every
 * leg's bearing and distance on the face at 1:1000, as in the label tests.
 */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import { surveyDocumentSchema, type SurveyDocument } from "../document";
import { sampleDocument } from "../fixtures";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { fmt } from "../units";
import { composeSheet, overlappingLabels } from "./compose";
import type { SceneText } from "./scene";
import { SRI_LANKA_CADASTRAL_V1 } from "./template";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
interface Row {
  count: number;
  width: number;
  depth: number;
  scale: number | null;
  paper: "auto" | "A4" | "A3";
}
const EIGHT: Row = { count: 8, width: 8, depth: 25, scale: 1000, paper: "A4" };
const pointsOf = (r: Row): SurveyPoint[] =>
  Array.from({ length: r.count + 1 }, (_, k) => [
    { id: id(k + 1), pointId: String(k + 1), e: 500_000 + k * (r.width + 0.003), n: 600_000 + k * 0.011, z: null, code: "CP" },
    { id: id(k + 101), pointId: String(k + 101), e: 500_000 + k * (r.width - 0.003), n: 600_000 + r.depth + k * 0.009, z: null, code: "St" },
  ]).flat();
const pts = pointsOf(EIGHT);
// Since stage 251 the row of eight is lettered clear with leader lines; frontages of 5 mm on the sheet are still too tight to letter.
const TWELVE: Row = { count: 12, width: 5, depth: 18, scale: 1000, paper: "A4" };
const tight = pointsOf(TWELVE);
function rowOfLots(template: "classic" | "panel", choose: boolean, overleaf = true, r: Row = EIGHT): SurveyDocument {
  const doc = sampleDocument();
  doc.roads = [];
  doc.adjoining = [];
  doc.features = [];
  doc.lots = Array.from({ length: r.count }, (_, k) => ({ id: `lot-${k + 1}`, label: String(k + 1), sup: "", points: [id(k + 1), id(k + 2), id(k + 102), id(k + 101)], note: "" }));
  doc.settings = { ...doc.settings, template, scale: r.scale, paper: r.paper, faceDimensions: true, overleaf, ...(choose ? { crowdedLegsToSchedule: true as const } : {}) };
  return doc;
}
const compose = (doc: SurveyDocument, points: readonly SurveyPoint[] = pts) =>
  composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: doc, points, lots: computeLots(points, doc.lots), crs: crsById("EPSG:5235"), crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
const texts = (items: readonly { kind: string }[]) => items.filter((i): i is SceneText => i.kind === "text");

describe("legs too crowded to letter, left to the schedule", () => {
  for (const template of ["classic", "panel"] as const) {
    it(`clears overlapping leg labels on the ${template} layout, says which legs on the face, and keeps them in the schedule`, () => {
      const before = compose(rowOfLots(template, false, true, TWELVE), tight);
      const after = compose(rowOfLots(template, true, true, TWELVE), tight);
      expect(overlappingLabels(after.pages[0]!.items).length).toBeLessThan(overlappingLabels(before.pages[0]!.items).length);
      const finding = after.findings.find((f) => f.code === "LEGS_IN_SCHEDULE")!;
      expect(finding).toMatchObject({ severity: "information", blocks: [] });
      const front = texts(after.pages[0]!.items).map((t) => t.text).join(" ");
      expect(front).toContain("are in the boundaries schedule: there's no room to letter them clearly at this scale.");
      // Every leg left to the schedule is still there, with its distance, overleaf.
      const overleaf = texts(after.pages.slice(1).flatMap((p) => p.items)).map((t) => t.text);
      const lots = computeLots(tight, rowOfLots(template, true, true, TWELVE).lots);
      for (const r of lots.lots) for (const leg of r.parcel!.legs) expect(overleaf).toContain(fmt(leg.distance, 2));
      expect(before.findings.find((f) => f.code === "LEGS_IN_SCHEDULE")).toBeUndefined();
      console.info(`${template}: overlapping label pairs at 1:1000, ${overlappingLabels(before.pages[0]!.items).length} lettering every leg, ${overlappingLabels(after.pages[0]!.items).length} with ${finding.detail}`);
    });
  }

  // After the stage 240 review: the note took room from the drawing on the classic layout (a different scale or paper, or the export
  // blocked), and leaving labels off moved others into new overlaps.
  const cases: [string, "classic" | "panel", Row][] = [
    ["classic, four deep lots, automatic scale on A4", "classic", { count: 4, width: 5, depth: 73.2, scale: null, paper: "A4" }],
    ["classic, four deep lots, 1:500 on A4", "classic", { count: 4, width: 5, depth: 73.2, scale: 500, paper: "A4" }],
    ["classic, four deep lots, 1:500 on automatic paper", "classic", { count: 4, width: 5, depth: 73.2, scale: 500, paper: "auto" }],
    ["classic, four lots 103 m deep, automatic", "classic", { count: 4, width: 5, depth: 103, scale: null, paper: "auto" }],
    ["panel, eight lots 5 m wide, automatic scale", "panel", { count: 8, width: 5, depth: 25, scale: null, paper: "A4" }],
    ["classic, the row of eight", "classic", EIGHT],
  ];
  for (const [name, template, row] of cases) {
    it(`keeps the scale and paper, stops nothing new, and only keeps a clearer face: ${name}`, () => {
      const points = pointsOf(row);
      const before = compose(rowOfLots(template, false, true, row), points);
      const after = compose(rowOfLots(template, true, true, row), points);
      expect([after.scale, after.paper]).toEqual([before.scale, before.paper]);
      const stops = (x: typeof before) => x.findings.filter((f) => f.blocks.includes("export")).map((f) => f.code).sort();
      expect(stops(after)).toEqual(stops(before));
      const left = after.findings.find((f) => f.code === "LEGS_IN_SCHEDULE");
      console.info(`${name}: 1:${before.scale} on ${before.paper}, ${overlappingLabels(before.pages[0]!.items).length} overlapping pairs lettering every leg, ${overlappingLabels(after.pages[0]!.items).length} with the option (${left ? left.detail : after.findings.some((f) => f.code === "LEGS_NOT_SCHEDULED") ? "every leg kept on the face" : "nothing crowded"})`);
      if (left) {
        expect(overlappingLabels(after.pages[0]!.items).length).toBeLessThan(overlappingLabels(before.pages[0]!.items).length);
        // The note names every leg left off the face, never "and 2 more".
        const note = texts(after.pages[0]!.items).map((t) => t.text).join(" ");
        expect(note).not.toMatch(/and \d+ more/);
      } else if (overlappingLabels(before.pages[0]!.items).some(() => true) && after.findings.some((f) => f.code === "LEGS_NOT_SCHEDULED")) {
        expect(JSON.stringify(after.pages)).toBe(JSON.stringify(before.pages));
      }
    });
  }

  it("says the version comparison's change as on and off", async () => {
    const { compareDocuments } = await import("../compare");
    expect(compareDocuments(rowOfLots("classic", false), rowOfLots("classic", true), pts).map((c) => c.text)).toContain("Crowded legs left to the schedule changed from off to on.");
  });

  it("does nothing without the schedule overleaf, where the legs would be nowhere", () => {
    const sheet = compose(rowOfLots("classic", true, false));
    expect(sheet.findings.find((f) => f.code === "LEGS_IN_SCHEDULE")).toBeUndefined();
    expect(JSON.stringify(sheet.pages)).toBe(JSON.stringify(compose(rowOfLots("classic", false, false)).pages));
  });

  it("is absent from a document until chosen, so earlier plans and their approvals stand", () => {
    expect(JSON.stringify(surveyDocumentSchema.parse(sampleDocument())).includes("crowdedLegsToSchedule")).toBe(false);
    expect(surveyDocumentSchema.parse(rowOfLots("classic", true)).settings.crowdedLegsToSchedule).toBe(true);
  });
});

/**
 * The AI drafting contract (ADR 0202): synthetic briefs only. The model's
 * output is faked here; what's tested is the deterministic check that decides
 * what of it may enter a plan, and how the surveyor's review applies.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { acceptDraft, applyReview, DraftOutputSchema, fold, hasPhrase, isoDateOf, itemsInReview, quotes, rawTokens, type DraftOutput } from "./ai-draft";
import { emptyDocument, unreviewed, type SurveyDocument } from "./document";
import { sampleDocument, SAMPLE_POINTS } from "./fixtures";
import type { SurveyPoint } from "./parcel";

const id = (n: number | string) => SAMPLE_POINTS.find((p) => p.pointId === String(n))!.id;

const BRIEF = [
  "Sub division of lot B depicted in Plan No. SAMPLE-0 dated 15.01.2020 made by A. Sample, Licensed Surveyor.",
  "The land is called Sample Watta, at Sample Village in Sample Pattu of Sample Korale.",
  "Lot B1 is points 1 2 3 8 7. Lot B2 is points 7, 8, 5 and 6. Lot B3 is points 8 3 4 5.",
  "Sample Road runs along points 9 10 and 11 12, from Main Road to Houses.",
  "Between points 6 and 7 of lot B2 is land claimed by the sample owner.",
  "North by land of the sample neighbour. Surveyed on 15.11.2026.",
].join("\n");

const empty = (): DraftOutput => ({ lots: [], roads: [], adjoining: [], fields: [], notes: [], questions: [] });

function goodDraft(): DraftOutput {
  return {
    ...empty(),
    lots: [
      { label: "B", sup: "1", note: "", corners: ["1", "2", "3", "8", "7"], evidence: "Lot B1 is points 1 2 3 8 7" },
      { label: "B", sup: "2", note: "", corners: ["7", "8", "5", "6"], evidence: "Lot B2 is points 7, 8, 5 and 6" },
      { label: "B", sup: "3", note: "", corners: ["8", "3", "4", "5"], evidence: "Lot B3 is points 8 3 4 5" },
    ],
    roads: [{ name: "Sample Road", edgeA: ["9", "10"], edgeB: ["11", "12"], start: "From Main Road", end: "To Houses", evidence: "Sample Road runs along points 9 10 and 11 12, from Main Road to Houses" }],
    adjoining: [{ text: "Land claimed by the sample owner", lot: "B2", from: "6", to: "7", evidence: "Between points 6 and 7 of lot B2 is land claimed by the sample owner" }],
    fields: [
      { field: "operation", value: "subdivision", evidence: "Sub division of lot B" },
      { field: "parentLots", value: "B", evidence: "Sub division of lot B" },
      { field: "previousPlanNumber", value: "SAMPLE-0", evidence: "depicted in Plan No. SAMPLE-0" },
      { field: "previousPlanDate", value: "15.01.2020", evidence: "dated 15.01.2020" },
      { field: "previousPlanBy", value: "A. Sample", evidence: "made by A. Sample, Licensed Surveyor" },
      { field: "landName", value: "SAMPLE WATTA", evidence: "called Sample Watta" },
      { field: "village", value: "Sample", evidence: "at Sample Village" },
      { field: "pattu", value: "Sample Pattu", evidence: "in Sample Pattu" },
      { field: "korale", value: "Sample Korale", evidence: "of Sample Korale" },
      { field: "boundaryNorth", value: "Land of the sample neighbour", evidence: "North by land of the sample neighbour" },
      { field: "surveyDate", value: "15.11.2026", evidence: "Surveyed on 15.11.2026" },
    ],
    questions: ["Which district and province is the land in?"],
  };
}

const accept = (output: DraftOutput, source: "ai_brief" | "ai_photo" = "ai_brief", brief = BRIEF, document = emptyDocument(), points: readonly SurveyPoint[] = SAMPLE_POINTS) => acceptDraft(output, { document, points, source, brief });
const why = (r: ReturnType<typeof accept>) => r.dropped.map((d) => `${d.what}: ${d.why}`);

describe("folding, quoting and words", () => {
  it("matches a quote however it was typed, but only as whole words", () => {
    expect(fold("  Lot  B¹’s “corner”,  POINT 12A ")).toBe(fold("lot b1 s corner point 12a"));
    expect(quotes(BRIEF, "lot b2 is points 7 8 5 and 6")).toBe(true);
    expect(quotes("Plan No. 12345", "Plan No. 1234")).toBe(false);
    expect(quotes("Lot B12 is points 1 2 3 45", "Lot B12 is points 1 2 3 4")).toBe(false);
    expect(quotes(BRIEF, "")).toBe(false);
    expect(quotes(BRIEF, "a")).toBe(false);
    expect(hasPhrase("lot B12", "B1")).toBe(false);
  });

  it("keeps point numbers whole: BM-1 is not point 1", () => {
    expect(rawTokens("points BM-1, 2 and (4).")).toEqual(["points", "BM-1", "2", "and", "4"]);
  });

  it("reads only whole calendar dates", () => {
    expect(isoDateOf("15.01.2020")).toBe("2020-01-15");
    expect(isoDateOf("5/1/2020")).toBe("2020-01-05");
    expect(isoDateOf("2020-1-5")).toBe("2020-01-05");
    expect(isoDateOf("January 2020")).toBeNull();
    expect(isoDateOf("31.02.2020")).toBeNull();
  });
});

describe("the output the model fills", () => {
  it("has no field that can carry a number: areas, distances, bearings and scales come from the engine", () => {
    const json = JSON.stringify(z.toJSONSchema(DraftOutputSchema));
    expect(json).not.toMatch(/"type":"(number|integer)"/);
    expect(json).not.toMatch(/"(area|distance|bearing|scale|extent|width|length)"\s*:/i);
  });

  it("has no length limits that would fail a whole draft for one long quote, and drops anything extra", () => {
    const parsed = DraftOutputSchema.parse({ ...empty(), lots: [{ label: "B", sup: "1", note: "", corners: ["1"], evidence: "x".repeat(5000), areaM2: 100 }] });
    expect(parsed.lots[0]).not.toHaveProperty("areaM2");
    expect(DraftOutputSchema.safeParse({ ...empty(), fields: [{ field: "computedArea", value: "1", evidence: "x" }] }).success).toBe(false);
  });
});

describe("accepting a draft from a brief", () => {
  it("takes everything the brief says, under fresh ids, marked for the surveyor to check", () => {
    const r = accept(goodDraft());
    expect(r.dropped).toEqual([]);
    expect(r.document.lots.map((l) => `${l.label}${l.sup}`)).toEqual(["B1", "B2", "B3"]);
    expect(r.document.lots[0]!.points).toEqual(["1", "2", "3", "8", "7"].map(id));
    expect(r.document.roads).toHaveLength(1);
    expect(r.document.adjoining).toEqual([{ id: expect.any(String), text: "Land claimed by the sample owner", lot: r.document.lots[1]!.id, from: id(6), to: id(7) }]);
    const s = r.document.sheet;
    expect(s.operation).toBe("subdivision");
    expect(s.previousPlan).toMatchObject({ number: "SAMPLE-0", date: "2020-01-15", by: "A. Sample", byDesignation: "Licensed Surveyor" });
    expect(s.landName).toBe("SAMPLE WATTA");
    expect(s.surveyDate).toBe("2026-11-15");
    expect(r.questions).toEqual(["Which district and province is the land in?"]);
    // One mark per value: checking the earlier plan's number never checks its date.
    expect(Object.keys(r.document.provenance)).toEqual(expect.arrayContaining(["sheet.previousPlan.number", "sheet.previousPlan.date", "sheet.previousPlan.by"]));
    expect(unreviewed(r.document)).toHaveLength(r.accepted.length);
    expect(Object.values(r.document.provenance).every((p) => p.source === "ai_brief" && !p.reviewed)).toBe(true);
  });

  it("drops a quote that isn't in the brief, even as part of a longer word", () => {
    const r = accept({ ...empty(), lots: [{ label: "C", sup: "", note: "", corners: ["1", "2", "4", "1"], evidence: "Lot C is points 1 2 4 1" }] }, "ai_brief", "Lot C is points 1 2 4 16");
    expect(r.document.lots).toEqual([]);
    const f = accept({ ...empty(), fields: [{ field: "planNumber", value: "1234", evidence: "Plan No. 1234" }] }, "ai_brief", "Plan No. 12345");
    expect(f.document.sheet.planNumber).toBe("");
  });

  it("drops a value that isn't one phrase of its quote", () => {
    const brief = "North by land of A. Sample. East by land of K. Other.";
    const r = accept({ ...empty(), fields: [{ field: "boundaryNorth", value: "Land of K. Sample", evidence: brief }] }, "ai_brief", brief);
    expect(r.document.sheet.boundaries.north).toBe("");
    expect(why(r)).toEqual(["North by: It isn't in your description's words."]);
  });

  it("refuses a raised part or a note the brief doesn't write", () => {
    const brief = "Lot B is points 1 2 4 6";
    const sup = accept({ ...empty(), lots: [{ label: "B", sup: "7", note: "", corners: ["1", "2", "4", "6"], evidence: brief }] }, "ai_brief", brief);
    expect(sup.document.lots).toEqual([]);
    const note = accept({ ...empty(), lots: [{ label: "B", sup: "", note: "Res. for Access, 20ft. wide", corners: ["1", "2", "4", "6"], evidence: brief }] }, "ai_brief", brief);
    expect(note.document.lots.map((l) => [l.label, l.note])).toEqual([["B", ""]]);
    expect(why(note)).toEqual(["Lot B's note: It isn't in your description's words."]);
  });

  it("takes corners only as the brief lists them, from any corner, and never skipped or reordered", () => {
    const run = (corners: string[]) => accept({ ...empty(), lots: [{ label: "B", sup: "1", note: "", corners, evidence: "Lot B1 is points 1 2 3 8 7" }] }).document.lots.length;
    expect(run(["2", "3", "8", "7", "1"])).toBe(1);
    expect(run(["1", "2", "3", "7"])).toBe(0);
    expect(run(["1", "3", "2", "8", "7"])).toBe(0);
  });

  it("never reads BM-1 as point 1", () => {
    const points = [...SAMPLE_POINTS, { id: "00000000-0000-4000-8000-000000000099", pointId: "BM-1", e: 499_990, n: 599_990, z: null, code: null }];
    const r = accept({ ...empty(), lots: [{ label: "C", sup: "", note: "", corners: ["1", "2", "4"], evidence: "Lot C is points BM-1 2 4" }] }, "ai_brief", "Lot C is points BM-1 2 4", emptyDocument(), points);
    expect(r.document.lots).toEqual([]);
  });

  it("sets the kind of survey and 'my own plan' only when the words say so", () => {
    const brief = "Lot A is points 1 2 4 6. Depicted in Plan No. 77.";
    const r = accept(
      {
        ...empty(),
        fields: [
          { field: "operation", value: "amalgamation", evidence: "Lot A is points" },
          { field: "previousPlanMine", value: "yes", evidence: "Depicted in Plan No. 77" },
        ],
      },
      "ai_brief",
      brief,
    );
    expect(r.document.sheet.operation).toBe("resurvey");
    expect(r.document.sheet.previousPlan.mine).toBe(false);
    const mine = accept({ ...empty(), fields: [{ field: "previousPlanMine", value: "yes", evidence: "depicted in my Plan No. 77" }] }, "ai_brief", "Lot A depicted in my Plan No. 77.");
    expect(mine.document.sheet.previousPlan.mine).toBe(true);
  });

  it("refuses a point the project doesn't have, a ring that crosses itself or repeats a corner", () => {
    expect(why(accept({ ...empty(), lots: [{ label: "C", sup: "", note: "", corners: ["1", "2", "99"], evidence: "Lot C is points 1 2 99" }] }, "ai_brief", "Lot C is points 1 2 99"))).toEqual(["Lot C: Point 99 isn't in this project."]);
    const brief = "Lot X is points 1 4 2 6. Lot Y is points 1 2 3 2.";
    const r = accept(
      {
        ...empty(),
        lots: [
          { label: "X", sup: "", note: "", corners: ["1", "4", "2", "6"], evidence: "Lot X is points 1 4 2 6" },
          { label: "Y", sup: "", note: "", corners: ["1", "2", "3", "2"], evidence: "Lot Y is points 1 2 3 2" },
        ],
      },
      "ai_brief",
      brief,
    );
    expect(r.document.lots).toEqual([]);
    expect(r.dropped.map((x) => x.why)).toEqual(["Its corners in this order make the boundary cross itself.", "It names point 2 twice."]);
  });

  it("keeps the first of two lots with the same label", () => {
    const d = goodDraft();
    d.lots.push({ ...d.lots[0]! });
    const r = accept(d);
    expect(r.document.lots).toHaveLength(3);
    expect(why(r)).toEqual(["Lot B1: The draft named it twice; the first is kept."]);
  });

  it("puts adjoining land only beside a real leg whose points the quote names", () => {
    const d = goodDraft();
    d.adjoining = [{ text: "Land claimed by the sample owner", lot: "B2", from: "6", to: "8", evidence: "Between points 6 and 7 of lot B2 is land claimed by the sample owner" }];
    expect(accept(d).document.adjoining).toEqual([]);
    d.adjoining = [{ text: "Land claimed by the sample owner", lot: "B2", from: "5", to: "6", evidence: "Lot B2 is points 7, 8, 5 and 6" }];
    expect(accept(d).document.adjoining).toEqual([]);
  });

  it("gives drafted items new ids, so labels on the lots it replaces never land on a new lot", () => {
    const before = sampleDocument();
    before.lots = [{ id: "lot-A", label: "A", sup: "", points: [id(1), id(2), id(4), id(6)], note: "" }];
    before.adjoining = [{ id: "adj-road", text: "Road", lot: "lot-A", from: id(1), to: id(2) }];
    before.provenance["lot:lot-A"] = { source: "ai_brief", reviewed: false };
    before.sheet.extractOf = "lot-A";
    const r = accept({ ...empty(), lots: [{ label: "A", sup: "", note: "", corners: ["6", "4", "2", "1"], evidence: "Lot A is points 6 4 2 1" }] }, "ai_brief", "Lot A is points 6 4 2 1", before);
    expect(r.document.lots.map((l) => l.id)).not.toContain("lot-A");
    expect(r.document.adjoining).toEqual([]);
    expect(r.document.sheet.extractOf).toBe("");
    expect(r.document.provenance["lot:lot-A"]).toBeUndefined();
    expect(why(r)).toEqual(["1 adjoining land on the lots the draft replaces: Add them again beside the new lots on the Lots step."]);
    expect(before.lots).toHaveLength(1);
  });

  it("keeps fields within the plan's limits, and dates whole", () => {
    const brief = `North by ${"the land of a very long description ".repeat(7)}. Surveyed in January 2020.`;
    const r = accept(
      {
        ...empty(),
        fields: [
          { field: "boundaryNorth", value: "the land of a very long description ".repeat(7).trim(), evidence: brief },
          { field: "surveyDate", value: "January 2020", evidence: "Surveyed in January 2020" },
        ],
      },
      "ai_brief",
      brief,
    );
    expect(r.document.sheet.boundaries.north).toBe("");
    expect(r.document.sheet.surveyDate).toBe("");
    expect(why(r)).toEqual(["North by: It's longer than 200 characters.", "Surveyed on: It isn't a whole date with day, month and year."]);
    expect(r.questions[0]).toMatch(/full date for "Surveyed on"/);
  });
});

describe("accepting what was read from a photo", () => {
  it("fills the title without quotes, and never the geometry, notes or the new plan's own number", () => {
    const d = goodDraft();
    d.fields = [
      { field: "landName", value: "Sample Watta", evidence: "" },
      { field: "statedExtent", value: "0 A. 2 R. 04.60 P.", evidence: "" },
      { field: "planNumber", value: "SAMPLE-0", evidence: "" },
      { field: "previousPlanNumber", value: "SAMPLE-0", evidence: "" },
    ];
    d.notes = [{ text: "Road reservation 20 ft wide", evidence: "" }];
    const r = accept(d, "ai_photo", "");
    expect(r.document.lots).toEqual([]);
    expect(r.document.roads).toEqual([]);
    expect(r.document.notes).toEqual([]);
    expect(r.document.sheet.landName).toBe("Sample Watta");
    expect(r.document.sheet.planNumber).toBe("");
    expect(r.document.sheet.previousPlan.number).toBe("SAMPLE-0");
    // A stated extent stays text in its own field: the computed extent comes from the lots.
    expect(r.document.sheet.statedExtent).toBe("0 A. 2 R. 04.60 P.");
    expect(r.document.provenance["sheet.statedExtent"]).toEqual({ source: "ai_photo", reviewed: false });
    expect(r.dropped.map((x) => x.what)).toEqual(["Lots, roads and adjoining lands", "Notes", "Plan number"]);
  });
});

describe("the surveyor's review", () => {
  const base = (): SurveyDocument => {
    const d = sampleDocument();
    d.sheet.landName = "Old Name";
    d.provenance["sheet.landName"] = { source: "ai_photo", reviewed: false };
    return d;
  };
  const draftOn = (doc: SurveyDocument) => accept(goodDraft(), "ai_brief", BRIEF, doc);
  const none = { removed: new Set<string>(), confirmed: new Set<string>() };

  it("marks only what the surveyor confirmed, and never a removed item", () => {
    const r = draftOn(base());
    const lot = `lot:${r.document.lots[0]!.id}`;
    const doc = applyReview(base(), r, { removed: new Set(["sheet.village"]), confirmed: new Set([lot, "sheet.village"]) });
    expect(doc.provenance[lot]).toEqual({ source: "ai_brief", reviewed: true });
    expect(doc.provenance["sheet.village"]).toBeUndefined();
    expect(doc.sheet.village).toBe("Sample");
  });

  it("puts a removed field back as it was, with its own mark still waiting", () => {
    const r = draftOn(base());
    const doc = applyReview(base(), r, { removed: new Set(["sheet.landName"]), confirmed: new Set() });
    expect(doc.sheet.landName).toBe("Old Name");
    expect(doc.provenance["sheet.landName"]).toEqual({ source: "ai_photo", reviewed: false });
    expect(unreviewed(doc)).toContain("sheet.landName");
  });

  it("takes a lot's adjoining lands out with it, and brings the plan's own lots back when every drafted one is out", () => {
    const r = draftOn(base());
    const b2 = `lot:${r.document.lots[1]!.id}`;
    const one = applyReview(base(), r, { removed: new Set([b2]), confirmed: new Set() });
    expect(one.adjoining).toEqual([]);
    expect(itemsInReview(r, one, { removed: new Set([b2]), confirmed: new Set() }).some((a) => a.key.startsWith("adjoining:"))).toBe(false);
    const all = new Set(r.document.lots.map((l) => `lot:${l.id}`));
    const back = applyReview(base(), r, { removed: all, confirmed: new Set() });
    expect(back.lots.map((l) => l.id)).toEqual(["lot-b1", "lot-b2", "lot-b3"]);
    expect(back.adjoining.map((a) => a.id)).toEqual(["adj-west", "adj-north", "adj-east"]);
  });

  it("lists every drafted item until it's taken out", () => {
    const r = draftOn(base());
    expect(itemsInReview(r, applyReview(base(), r, none), none)).toHaveLength(r.accepted.length);
  });
});

describe("the first review's re-check (synthetic)", () => {
  const two = "Lot B1 is points 1 2 3 8 7. Lot B2 is points 7 8 5 6.";
  const lotDraft = (label: string, sup: string, corners: string[], evidence: string): DraftOutput => ({ ...empty(), lots: [{ label, sup, note: "", corners, evidence }] });

  it("takes a lot's corners only from its own list, never another lot's, and never a corner short", () => {
    expect(accept(lotDraft("B", "1", ["7", "8", "5", "6"], two), "ai_brief", two).document.lots).toEqual([]);
    expect(accept(lotDraft("B", "1", ["1", "2", "3", "8"], two), "ai_brief", two).document.lots).toEqual([]);
    expect(accept(lotDraft("B", "1", ["3", "8", "7", "1", "2"], two), "ai_brief", two).document.lots).toHaveLength(1);
    const run = "Lot A is points 1 2 4 6 and lot C is points 7 8 5.";
    expect(accept(lotDraft("A", "", ["4", "6", "7", "8"], run), "ai_brief", run).document.lots).toEqual([]);
  });

  it("names a lot only where the words say lot", () => {
    const brief = "Road along points 1 2 3.";
    expect(accept(lotDraft("3", "", ["1", "2", "3"], "points 1 2 3"), "ai_brief", brief).document.lots).toEqual([]);
  });

  it("refuses a description cut short", () => {
    const brief = "North by land of A. Perera's heirs. East by the road.";
    const cut = accept({ ...empty(), fields: [{ field: "boundaryNorth", value: "land of A. Perera", evidence: "North by land of A. Perera" }] }, "ai_brief", brief);
    expect(cut.document.sheet.boundaries.north).toBe("");
    const whole = accept({ ...empty(), fields: [{ field: "boundaryNorth", value: "land of A. Perera's heirs", evidence: "North by land of A. Perera's heirs" }] }, "ai_brief", brief);
    expect(whole.document.sheet.boundaries.north).toBe("land of A. Perera's heirs");
  });

  it("reads 'not my plan' as not mine, and a sub division as a sub division", () => {
    const brief = "Depicted in Plan No. 77 made by A. Sample, not my plan. Resurvey and sub division of lot B.";
    const r = accept(
      {
        ...empty(),
        fields: [
          { field: "previousPlanMine", value: "yes", evidence: "made by A. Sample, not my plan" },
          { field: "operation", value: "resurvey", evidence: "Resurvey and sub division of lot B" },
        ],
      },
      "ai_brief",
      brief,
    );
    expect(r.document.sheet.previousPlan.mine).toBe(false);
    expect(r.document.sheet.operation).toBe("resurvey");
    expect(r.dropped.map((d) => d.what)).toEqual(["My own earlier plan", "The survey"]);
  });

  it("asks which lot an adjoining land is beside when the leg is shared", () => {
    const d = goodDraft();
    d.adjoining = [{ text: "the drain", lot: "B1", from: "7", to: "8", evidence: "Between points 7 and 8 is the drain" }];
    const brief = BRIEF + "\nBetween points 7 and 8 is the drain.";
    expect(accept(d, "ai_brief", brief).document.adjoining).toEqual([]);
  });

  it("matches point numbers in their own case when two differ only by case", () => {
    const points = [...SAMPLE_POINTS, { id: "00000000-0000-4000-8000-0000000000a1", pointId: "A1", e: 500_010, n: 600_010, z: null, code: null }, { id: "00000000-0000-4000-8000-0000000000a2", pointId: "a1", e: 500_011, n: 600_011, z: null, code: null }];
    const brief = "Lot Q is points 1 2 A1.";
    const r = accept(lotDraft("Q", "", ["1", "2", "A1"], "Lot Q is points 1 2 A1"), "ai_brief", brief, emptyDocument(), points);
    expect(r.document.lots[0]!.points[2]).toBe("00000000-0000-4000-8000-0000000000a1");
  });
});

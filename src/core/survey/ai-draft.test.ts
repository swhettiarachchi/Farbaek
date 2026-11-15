/**
 * The AI drafting contract (ADR 0202): synthetic briefs only. The model's
 * output is faked here; what's tested is the deterministic check that decides
 * what of it may enter a plan.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { acceptDraft, DraftOutputSchema, fold, isoDateOf, mentions, quotes, type DraftOutput } from "./ai-draft";
import { unreviewed } from "./document";
import { sampleDocument, SAMPLE_POINTS } from "./fixtures";
import { emptyDocument } from "./document";

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

const accept = (output: DraftOutput, source: "ai_brief" | "ai_photo" = "ai_brief", brief = BRIEF, document = emptyDocument()) => acceptDraft(output, { document, points: SAMPLE_POINTS, source, brief });

describe("folding and quoting", () => {
  it("matches a quote however it was typed", () => {
    expect(fold("  Lot  B¹’s “corner”,  POINT 12A ")).toBe(fold("lot b¹ s corner point 12a"));
    expect(quotes(BRIEF, "lot b2 is points 7 8 5 and 6")).toBe(true);
    expect(quotes(BRIEF, "Lot B4 is points 1 2 3")).toBe(false);
    expect(quotes(BRIEF, "")).toBe(false);
    expect(quotes(BRIEF, "a")).toBe(false);
  });

  it("finds point numbers and labels only as words of their own", () => {
    expect(mentions("points 1 2 3 8 7", "8")).toBe(true);
    expect(mentions("points 12 13", "1")).toBe(false);
    expect(mentions("lot B1", "B1")).toBe(true);
    expect(mentions("lot B12", "B1")).toBe(false);
  });

  it("reads dates as written into yyyy-mm-dd, and leaves anything else alone", () => {
    expect(isoDateOf("15.01.2020")).toBe("2020-01-15");
    expect(isoDateOf("5/1/2020")).toBe("2020-01-05");
    expect(isoDateOf("2020-1-5")).toBe("2020-01-05");
    expect(isoDateOf("January 2020")).toBe("January 2020");
  });
});

describe("the output the model fills", () => {
  it("has no field that can carry a number: areas, distances, bearings and scales come from the engine", () => {
    const json = JSON.stringify(z.toJSONSchema(DraftOutputSchema));
    expect(json).not.toMatch(/"type":"(number|integer)"/);
    expect(json).not.toMatch(/"(area|distance|bearing|scale|extent|width|length)"\s*:/i);
  });

  it("drops anything outside the schema and refuses unknown fields", () => {
    const parsed = DraftOutputSchema.parse({ ...empty(), lots: [{ label: "B", sup: "1", note: "", corners: ["1"], evidence: "x", areaM2: 100 }] });
    expect(parsed.lots[0]).not.toHaveProperty("areaM2");
    expect(DraftOutputSchema.safeParse({ ...empty(), fields: [{ field: "computedArea", value: "1", evidence: "x" }] }).success).toBe(false);
  });
});

describe("accepting a draft from a brief", () => {
  it("takes everything the brief says, marked for the surveyor to check", () => {
    const r = accept(goodDraft());
    expect(r.dropped).toEqual([]);
    expect(r.document.lots.map((l) => `${l.label}${l.sup}`)).toEqual(["B1", "B2", "B3"]);
    expect(r.document.lots[0]!.points).toEqual(["1", "2", "3", "8", "7"].map((n) => SAMPLE_POINTS.find((p) => p.pointId === n)!.id));
    expect(r.document.roads).toHaveLength(1);
    expect(r.document.roads[0]!.width).toBe("feet");
    // Lot B2 runs 7, 8, 5, 6: the leg from 6 to 7 is its fourth.
    expect(r.document.adjoining).toEqual([{ id: "adj-0", text: "Land claimed by the sample owner", lot: r.document.lots[1]!.id, leg: 3 }]);
    const s = r.document.sheet;
    expect(s.operation).toBe("subdivision");
    expect(s.previousPlan).toMatchObject({ number: "SAMPLE-0", date: "2020-01-15", by: "A. Sample", byDesignation: "Licensed Surveyor" });
    expect(s.landName).toBe("SAMPLE WATTA");
    expect(s.boundaries.north).toBe("Land of the sample neighbour");
    expect(s.surveyDate).toBe("2026-11-15");
    expect(r.questions).toEqual(["Which district and province is the land in?"]);
    // Every item waits for the surveyor; nothing is reviewed on their behalf.
    const open = unreviewed(r.document);
    expect(open).toContain(`lot:${r.document.lots[0]!.id}`);
    expect(open).toContain("sheet.landName");
    expect(open).toContain("sheet.previousPlan");
    expect(Object.values(r.document.provenance).every((p) => p.source === "ai_brief" && !p.reviewed)).toBe(true);
  });

  it("drops a field whose quote isn't in the brief", () => {
    const d = goodDraft();
    d.fields = [{ field: "landName", value: "Imaginary Estate", evidence: "called Imaginary Estate" }];
    const r = accept(d);
    expect(r.document.sheet.landName).toBe("");
    expect(r.dropped).toEqual([{ what: "Land called", why: "It isn't in your description's words." }]);
  });

  it("drops a value its own quote doesn't support", () => {
    const d = goodDraft();
    d.fields = [
      { field: "landName", value: "Other Watta", evidence: "called Sample Watta" },
      { field: "district", value: "Sample", evidence: "at Sample Village" },
    ];
    const r = accept(d);
    expect(r.document.sheet.landName).toBe("");
    // "Sample" is in the quote: the words are the surveyor's, the field is for them to check.
    expect(r.document.sheet.district).toBe("Sample");
    expect(r.dropped.map((x) => x.what)).toEqual(["Land called"]);
  });

  it("refuses a point the project doesn't have", () => {
    const d = { ...empty(), lots: [{ label: "C", sup: "", note: "", corners: ["1", "2", "99"], evidence: "Lot C is points 1 2 99" }] };
    const r = accept(d, "ai_brief", "Lot C is points 1 2 99");
    expect(r.document.lots).toEqual([]);
    expect(r.dropped).toEqual([{ what: "Lot C", why: "Point 99 isn't in this project." }]);
  });

  it("refuses corners the brief didn't name", () => {
    const d = goodDraft();
    d.lots = [{ label: "B", sup: "1", note: "", corners: ["1", "2", "3", "4"], evidence: "Lot B1 is points 1 2 3 8 7" }];
    const r = accept(d);
    expect(r.document.lots).toEqual([]);
    expect(r.dropped[0]!.what).toBe("Lot B1");
  });

  it("refuses a ring that crosses itself or repeats a corner", () => {
    const brief = "Lot X is points 1 4 2 6. Lot Y is points 1 2 3 2.";
    const d = {
      ...empty(),
      lots: [
        { label: "X", sup: "", note: "", corners: ["1", "4", "2", "6"], evidence: "Lot X is points 1 4 2 6" },
        { label: "Y", sup: "", note: "", corners: ["1", "2", "3", "2"], evidence: "Lot Y is points 1 2 3 2" },
      ],
    };
    const r = accept(d, "ai_brief", brief);
    expect(r.document.lots).toEqual([]);
    expect(r.dropped.map((x) => x.why)).toEqual(["Its corners in this order make the boundary cross itself.", "It names point 2 twice."]);
  });

  it("keeps the first of two lots with the same label", () => {
    const d = goodDraft();
    d.lots.push({ ...d.lots[0]! });
    const r = accept(d);
    expect(r.document.lots).toHaveLength(3);
    expect(r.dropped).toEqual([{ what: "Lot B1", why: "The draft named it twice; the first is kept." }]);
  });

  it("puts adjoining land only beside a real leg of a lot", () => {
    const d = goodDraft();
    d.adjoining = [{ text: "Land claimed by the sample owner", lot: "B2", from: "6", to: "8", evidence: "Between points 6 and 7 of lot B2 is land claimed by the sample owner" }];
    expect(accept(d).document.adjoining).toEqual([]);
    d.adjoining = [{ text: "Land claimed by the sample owner", lot: "B2", from: "5", to: "6", evidence: "Lot B2 is points 7, 8, 5 and 6" }];
    // The quote names the points but doesn't say what adjoins.
    expect(accept(d).document.adjoining).toEqual([]);
  });

  it("replaces the plan's lots and takes their stale labels and marks with them", () => {
    const before = sampleDocument();
    before.provenance["lot:lot-b1"] = { source: "ai_brief", reviewed: false };
    before.sheet.extractOf = "lot-b2";
    const d = { ...empty(), lots: [{ label: "A", sup: "", note: "", corners: ["1", "2", "4", "6"], evidence: "Lot A is points 1 2 4 6" }] };
    const r = accept(d, "ai_brief", "Lot A is points 1 2 4 6", before);
    expect(r.document.lots.map((l) => l.label)).toEqual(["A"]);
    expect(r.document.adjoining).toEqual([]);
    expect(r.document.sheet.extractOf).toBe("");
    expect(r.document.provenance["lot:lot-b1"]).toBeUndefined();
    // The document passed in is never changed.
    expect(before.lots).toHaveLength(3);
  });
});

describe("accepting what was read from a photo", () => {
  it("fills the title without quotes, and never the geometry", () => {
    const d = goodDraft();
    d.fields = [
      { field: "landName", value: "Sample Watta", evidence: "" },
      { field: "statedExtent", value: "0 A. 2 R. 04.60 P.", evidence: "" },
    ];
    const r = accept(d, "ai_photo", "");
    expect(r.document.lots).toEqual([]);
    expect(r.document.roads).toEqual([]);
    expect(r.document.sheet.landName).toBe("Sample Watta");
    // A stated extent stays text in its own field: the computed extent comes from the lots.
    expect(r.document.sheet.statedExtent).toBe("0 A. 2 R. 04.60 P.");
    expect(r.document.provenance["sheet.statedExtent"]).toEqual({ source: "ai_photo", reviewed: false });
    expect(r.dropped[0]!.what).toBe("Lots, roads and adjoining lands");
  });

  it("keeps the earlier plan's own number and dates out of the new plan's", () => {
    const r = accept(
      {
        ...empty(),
        fields: [
          { field: "planNumber", value: "SAMPLE-0", evidence: "" },
          { field: "surveyDate", value: "15.01.2020", evidence: "" },
          { field: "previousPlanNumber", value: "SAMPLE-0", evidence: "" },
        ],
      },
      "ai_photo",
      "",
    );
    expect(r.document.sheet.planNumber).toBe("");
    expect(r.document.sheet.surveyDate).toBe("");
    expect(r.document.sheet.previousPlan.number).toBe("SAMPLE-0");
    expect(r.dropped.map((x) => x.what)).toEqual(["Plan number", "Surveyed on"]);
  });

  it("refuses a value longer than its field", () => {
    const r = accept({ ...empty(), fields: [{ field: "landName", value: "x".repeat(121), evidence: "" }] }, "ai_photo", "");
    expect(r.document.sheet.landName).toBe("");
    expect(r.dropped[0]!.why).toMatch(/longer than 120/);
  });
});

/**
 * The plan's details Farbaek fills in by itself (stage 304, ADR 0310). SYNTHETIC plans: their names, numbers and places are made up for
 * the test, never a real job's.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, type SurveyDocument } from "../document";
import { autoDoubt, exceptionsFor } from "../exceptions";
import type { SurveyPoint } from "../parcel";
import { buildPlan } from "../view";
import { defaultsFrom, withDefaults, type EarlierPlan } from "./defaults";
import { carriedDetails, detailDoubt, nextPlanNumber, sketchDates, withCarriedDetails, withSketchSurveyDate } from "./plan-details";

const plan = (name: string, sheet: Partial<SurveyDocument["sheet"]>): EarlierPlan => ({ name, document: { ...emptyDocument(), sheet: { ...emptyDocument().sheet, ...sheet } } });

describe("the next plan number", () => {
  it("follows the surveyor's latest numbered plan, keeping its lettering and zeros", () => {
    expect(nextPlanNumber(["2933", "2931"])).toEqual({ value: "2934", after: "2933" });
    expect(nextPlanNumber(["LS/12/0099", "LS/12/0098"])).toEqual({ value: "LS/12/0100", after: "LS/12/0099" });
    // The highest with the same lettering, though a lower one was saved later.
    expect(nextPlanNumber(["2930", "2933"])).toEqual({ value: "2934", after: "2933" });
    // Another lettering doesn't count.
    expect(nextPlanNumber(["A/15", "B/40"])).toEqual({ value: "A/16", after: "A/15" });
    // A number not ending in digits is passed over; none at all is nothing.
    expect(nextPlanNumber(["2933/A", "2932"])).toEqual({ value: "2933", after: "2932" });
    expect(nextPlanNumber(["", "draft"])).toBeNull();
    // A number ending in a year gives no next: the surveyor numbers a new year.
    expect(nextPlanNumber(["1234/2026"])).toBeNull();
    expect(nextPlanNumber(["1234/2026", "1199"])).toEqual({ value: "1200", after: "1199" });
  });
});

describe("what a new plan takes from the surveyor's plans", () => {
  const earlier = [
    plan("Sample job B", { planNumber: "", district: "" }),
    plan("Sample job A", { planNumber: "1201", village: "Sample village", gnDivision: "100A", district: "Sample district", province: "Sample province", dsDivision: "Sample DS", korale: "Sample Korale", pattu: "" }),
  ];

  it("takes the next number and where the latest land was, never its village or anything about the land", () => {
    const d = carriedDetails(earlier);
    expect(d.planNumber).toEqual({ value: "1202", after: "1201", from: "Sample job A" });
    expect(d.region).toEqual({ values: { district: "Sample district", province: "Sample province", dsDivision: "Sample DS", korale: "Sample Korale" }, from: "Sample job A" });
    const doc = withDefaults(emptyDocument(), defaultsFrom(earlier));
    expect(doc.sheet).toMatchObject({ planNumber: "1202", district: "Sample district", province: "Sample province", dsDivision: "Sample DS", korale: "Sample Korale", pattu: "", village: "", gnDivision: "", landName: "" });
    expect(doc.provenance["sheet.planNumber"]).toEqual({ source: "auto", reviewed: false });
    expect(doc.provenance["sheet.district"]).toEqual({ source: "auto", reviewed: false });
    expect(doc.provenance["sheet.village"]).toBeUndefined();
  });

  it("never fills a field over what's there, and fills nothing from no plans", () => {
    const typed = { ...emptyDocument(), sheet: { ...emptyDocument().sheet, planNumber: "77", district: "Typed" } };
    const doc = withCarriedDetails(typed, carriedDetails(earlier));
    expect(doc.sheet.planNumber).toBe("77");
    expect(doc.sheet.district).toBe("Typed");
    expect(doc.provenance["sheet.planNumber"]).toBeUndefined();
    expect(doc.sheet.province).toBe("Sample province");
    expect(withDefaults(emptyDocument(), defaultsFrom([])).sheet).toEqual(emptyDocument().sheet);
  });

  it("asks the surveyor to confirm a carried number and place on cards of their own", () => {
    const POINTS: SurveyPoint[] = [];
    const doc = { ...withDefaults(emptyDocument(), defaultsFrom(earlier)), codes: commonCodes() };
    expect(autoDoubt(doc, POINTS, "sheet.planNumber")).toBe("The plan number 1202 is the next after your latest plan's: check it's this plan's number.");
    expect(autoDoubt(doc, POINTS, "sheet.district")).toBe("The district, Sample district, is from your latest plan: check it's where this land is.");
    const plan = buildPlan({ points: POINTS, document: doc, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
    expect(plan.findings.find((f) => f.code === "AUTO_ITEMS_UNREVIEWED")?.message).toBe("5 items drawn from the field data need your confirmation.");
    const confirm = exceptionsFor(doc, POINTS, plan.findings).confirm.map((e) => `${e.title} ${e.item ?? ""}`);
    expect(confirm.join(" | ")).toContain("The plan number 1202 is the next after your latest plan's");
    expect(confirm.join(" | ")).toContain("The district, Sample district, is from your latest plan");
    // Once confirmed, it waits no more.
    const confirmed = { ...doc, provenance: { ...doc.provenance, "sheet.district": { source: "auto" as const, reviewed: true } } };
    expect(buildPlan({ points: POINTS, document: confirmed, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null }).findings.find((f) => f.code === "AUTO_ITEMS_UNREVIEWED")?.message).toBe("4 items drawn from the field data need your confirmation.");
  });
});

describe("the survey date written on the sketch", () => {
  const read = "2026-11-28T10:00:00.000Z";

  it("reads a day and month as the latest such day on or before the read", () => {
    expect(sketchDates(["14/10"], read)).toEqual([{ iso: "2026-10-14", written: "14/10" }]);
    expect(sketchDates(["14/10/"], read)).toEqual([{ iso: "2026-10-14", written: "14/10/" }]);
    // December hasn't come yet in November: last year's.
    expect(sketchDates(["5/12"], read)).toEqual([{ iso: "2025-12-05", written: "5/12" }]);
    expect(sketchDates(["14.10.2026", "3-1-26"], read).map((d) => d.iso)).toEqual(["2026-01-03", "2026-10-14"]);
  });

  it("takes nothing that isn't one date alone", () => {
    // A dot or a dash without a year is a measurement or a range ("4.10", "12.05", "3-4").
    expect(sketchDates(["4.10", "12.05", "3-4", "2.5"], read)).toEqual([]);
    expect(sketchDates(["1012.632 999.364 0104", "1.43", "biyan + janathamws", "31/02", "14/13", "0102 1013.983 1010.363"], read)).toEqual([]);
    // The day after the read is last year's.
    expect(sketchDates(["30/11"], read).map((d) => d.iso)).toEqual(["2025-11-30"]);
    // Read late on the 27th in UTC, it was already the 28th in Sri Lanka: the 28th is that day, not last year's.
    expect(sketchDates(["28/11"], "2026-11-27T23:30:00.000Z").map((d) => d.iso)).toEqual(["2026-11-28"]);
  });

  it("fills an empty survey date from the sketch, and asks when the sketch gives more than one", () => {
    const sketch = (notes: string[]): SurveyDocument => ({ ...emptyDocument(), sketch: { model: "claude-opus-5-5", readAt: read, files: ["s.jpg"], readings: notes.map((text, i) => ({ id: `r${i + 1}`, file: "s.jpg", kind: "note" as const, text, from: "", to: "", near: "" })), unreadable: [] } });
    const one = withSketchSurveyDate(sketch(["14/10", "biyan"]));
    expect(one.sheet.surveyDate).toBe("2026-10-14");
    expect(one.provenance["sheet.surveyDate"]).toEqual({ source: "auto", reviewed: false });
    // Read from handwriting, it is always the surveyor's to check.
    expect(detailDoubt(one, "sheet.surveyDate")).toBe("The survey date, 2026-10-14, is read from \"14/10\" written on the sketch: check it.");
    const two = withSketchSurveyDate(sketch(["15/10", "14/10"]));
    expect(two.sheet.surveyDate).toBe("2026-10-14");
    expect(detailDoubt(two, "sheet.surveyDate")).toBe("The sketch gives 2 dates (14/10, 15/10): the survey date is taken as the first, 2026-10-14. Check it.");
    // A date the survey files state isn't the sketch's: approving the plan confirms it.
    expect(detailDoubt({ ...one, sheet: { ...one.sheet, surveyDate: "2026-10-01" } }, "sheet.surveyDate")).toBeNull();
    // A date already there stays.
    const typed = sketch(["14/10"]);
    typed.sheet.surveyDate = "2026-10-20";
    expect(withSketchSurveyDate(typed).sheet.surveyDate).toBe("2026-10-20");
  });
});

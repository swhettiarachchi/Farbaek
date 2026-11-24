/**
 * The deed's extent on the face of a classic plan (stage 244, ADR 0252), on the SYNTHETIC sample plan: the surveyor's choice, the
 * computed extent kept in the schedule and the checks, and nothing changed for a plan that doesn't choose it.
 */
import { describe, expect, it } from "vitest";
import { compareDocuments } from "../compare";
import { deedExtentFace, writtenPerchDecimals } from "../deed-extent";
import { surveyDocumentSchema, type SurveyDocument } from "../document";
import { SAMPLE_POINTS, sampleDocument } from "../fixtures";
import { computeLots } from "../lots";
import { checkSurvey } from "../qc";
import { crsById } from "../crs";
import { approvalHash } from "../view";
import { composeSheet } from "./compose";
import { SRI_LANKA_CADASTRAL_V1 } from "./template";

const SLD99 = crsById("EPSG:5235")!;
const input = (d: SurveyDocument) => ({ template: SRI_LANKA_CADASTRAL_V1, document: d, points: SAMPLE_POINTS, lots: computeLots(SAMPLE_POINTS, d.lots), crs: SLD99, crsConfirmation: "Confirmed by Test Person on 2026-11-24", surveyor: null, approval: null });
const texts = (page: { items: { kind: string }[] }) => page.items.filter((i) => i.kind === "text").map((i) => (i as unknown as { text: string }).text);
const base = (): SurveyDocument => ({ ...sampleDocument(), sheet: { ...sampleDocument().sheet, statedExtent: "0 A. 2 R. 00.00 P." } });
const withDeed = (d = base()): SurveyDocument => ({ ...d, settings: { ...d.settings, deedExtentOnFace: true } });

describe("the deed's extent on the face", () => {
  it("prints the stated extent on the face when chosen, and keeps the computed one in the schedule", () => {
    const sheet = composeSheet(input(withDeed()));
    const front = texts(sheet.pages[0]!);
    expect(front.some((t) => t.startsWith("Containing in Extent 0.20234 Hectares ( 0 A. 2 R. 00.00 P. )"))).toBe(true);
    const overleaf = sheet.pages.slice(1).flatMap(texts).join(" ");
    expect(overleaf).toContain("Entire land: 2,267.41");
    expect(overleaf).toContain("The front of the plan gives the extent in the deed; the extent above is computed from this survey.");
  });

  it("prints the computed extent by default, and the document stays as it was", async () => {
    const front = texts(composeSheet(input(base())).pages[0]!);
    expect(front.some((t) => t.startsWith("Containing in Extent 0.22674 Hectares"))).toBe(true);
    expect("deedExtentOnFace" in base().settings).toBe(false);
    // Absent unless chosen, and removed again when turned off: an approval's fingerprint comes back to what it was.
    const hash = (d: SurveyDocument) => approvalHash({ document: d, crsId: "EPSG:5235", points: SAMPLE_POINTS });
    const off = withDeed();
    delete off.settings.deedExtentOnFace;
    expect(await hash(off)).toBe(await hash(base()));
    expect(await hash(withDeed())).not.toBe(await hash(base()));
    expect(surveyDocumentSchema.safeParse(withDeed()).success).toBe(true);
  });

  it("says in the checks which extent the face gives, and where the computed one is", () => {
    const check = (d: SurveyDocument) => checkSurvey({ points: SAMPLE_POINTS, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(SAMPLE_POINTS, d.lots), surveyorProfile: false }).filter((f) => f.code === "EXTENT_FROM_DEED");
    expect(check(withDeed())[0]).toMatchObject({ severity: "information", message: expect.stringContaining("the boundaries schedule overleaf gives the extent computed from this survey") });
    const noOverleaf = withDeed();
    noOverleaf.settings.overleaf = false;
    expect(check(noOverleaf)[0]).toMatchObject({ severity: "warning", message: expect.stringContaining("isn't on the plan") });
    const unreadable = withDeed({ ...base(), sheet: { ...base().sheet, statedExtent: "about half an acre" } });
    expect(check(unreadable)[0]).toMatchObject({ severity: "warning", message: expect.stringContaining("so it gives the computed extent") });
    expect(texts(composeSheet(input(unreadable)).pages[0]!).some((t) => t.startsWith("Containing in Extent 0.22674 Hectares"))).toBe(true);
    expect(check(base())).toEqual([]);
  });

  // The faults a fresh review found (stage 244): one rule now decides it for the face, the schedule and the checks.
  const check = (d: SurveyDocument) => checkSurvey({ points: SAMPLE_POINTS, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(SAMPLE_POINTS, d.lots), surveyorProfile: false });
  const overleafText = (d: SurveyDocument) => composeSheet(input(d)).pages.slice(1).flatMap(texts).join(" ");
  const NOTE = "The front of the plan gives the extent in the deed";

  it("says nothing about the deed's extent on the panel layout's schedule, and the checks say why", () => {
    const panel = withDeed();
    panel.settings.template = "panel";
    expect(overleafText(panel)).not.toContain(NOTE);
    expect(check(panel).find((f) => f.code === "EXTENT_FROM_DEED")).toMatchObject({ severity: "information", message: expect.stringContaining("classic layout only") });
  });

  it("gives an extract its lot's computed extent, and treats an extract of a lot no longer on the plan as the whole plan", () => {
    const lot = base().lots[0]!.id;
    const extract = withDeed({ ...base(), sheet: { ...base().sheet, extractOf: lot } });
    expect(texts(composeSheet(input(extract)).pages[0]!).some((t) => t.includes("0 A. 2 R. 00.00 P."))).toBe(false);
    expect(check(extract).find((f) => f.code === "EXTENT_FROM_DEED")?.message).toContain("An extract of one lot");
    expect(check(extract).find((f) => f.code === "STATED_EXTENT_DIFFERS")?.action).not.toContain("face gives it");
    // A stale extract: the classic layout draws the whole plan, so the face, the schedule and the checks all give the deed's extent.
    const stale = withDeed({ ...base(), sheet: { ...base().sheet, extractOf: "00000000-0000-4000-8000-00000000dead" } });
    expect(texts(composeSheet(input(stale)).pages[0]!).some((t) => t.startsWith("Containing in Extent 0.20234 Hectares"))).toBe(true);
    expect(overleafText(stale)).toContain(NOTE);
    expect(check(stale).find((f) => f.code === "EXTENT_FROM_DEED")?.severity).toBe("information");
  });

  it("prints the deed's perches to at least the decimals it writes them to, and says how it's printed", () => {
    const d = withDeed({ ...base(), sheet: { ...base().sheet, statedExtent: "0 A. 2 R. 05.25 P." } });
    d.settings.perchDecimals = 0;
    expect(texts(composeSheet(input(d)).pages[0]!).some((t) => t.includes("0 A. 2 R. 05.25 P."))).toBe(true);
    expect(check(d).find((f) => f.code === "EXTENT_FROM_DEED")?.detail).toContain('from "0 A. 2 R. 05.25 P." as written');
    expect(writtenPerchDecimals("0 A. 0 R. 05.00 P.")).toBe(2);
    expect(writtenPerchDecimals("A. 0 R. 2 P. 04.6")).toBe(1);
    expect(writtenPerchDecimals("10 perches")).toBe(0);
    expect(writtenPerchDecimals("0.02345 Hectares")).toBeNull();
  });

  it("words the stated-extent check by whether the schedule is on", () => {
    const off = withDeed();
    off.settings.overleaf = false;
    expect(check(off).find((f) => f.code === "STATED_EXTENT_DIFFERS")?.action).toContain("the computed extent isn't on the plan");
    expect(check(withDeed()).find((f) => f.code === "STATED_EXTENT_DIFFERS")?.action).toContain("the boundaries schedule overleaf gives the computed extent");
  });

  it("leaves the face blank, not the deed's, when the plan has no computed extent", () => {
    const empty = withDeed({ ...base(), lots: [] });
    expect(deedExtentFace(empty, computeLots(SAMPLE_POINTS, [])).shown).toBe(false);
    expect(texts(composeSheet(input(empty)).pages[0]!).some((t) => t.includes("0 A. 2 R. 00.00 P."))).toBe(false);
    expect(check(empty).find((f) => f.code === "EXTENT_FROM_DEED")?.message).toContain("left blank");
  });

  it("is listed when it changes between versions", () => {
    expect(compareDocuments(base(), withDeed(), SAMPLE_POINTS).map((c) => c.text).join(" ")).toMatch(/The deed's extent on the face changed from off to on/);
  });
});

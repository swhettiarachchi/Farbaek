/** The Sketch Intelligence Engine (stage 241, ADR 0249) on a SYNTHETIC job (fixture.ts): matching, classifying, interpreting, applying. */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "../document";
import { writeDxf } from "../export/dxf";
import { computeLots } from "../lots";
import { buildPlan } from "../view";
import { applySketch, sketchItemId } from "./apply";
import { classifyArea, classifyLine } from "./classify";
import { SketchDrawingOutput, acceptDrawing } from "./drawing";
import { interpretDocument, sketchEvidence, sketchQuestionFindings } from "./findings";
import { cornerIndexes, interpretSketch, writtenWidth, type LineProposal, type LotProposal } from "./interpret";
import { indexPoints, matchPoint } from "./match";
import { SYNTH_DRAWING, SYNTH_POINTS, synthId } from "./fixture";

const codes = commonCodes();
const run = (opts = {}) => interpretSketch(SYNTH_DRAWING, SYNTH_POINTS, codes, { widths: ["15'"], ...opts });
const line = (r: ReturnType<typeof run>, from: string) => r.proposals.find((p): p is LineProposal => p.kind === "line" && p.from[0] === from)!;
const lot = (r: ReturnType<typeof run>) => r.proposals.find((p): p is LotProposal => p.kind === "lot")!;
/** The id of the line the sketch's element (l1, l6…) drew. */
const lineId = (r: ReturnType<typeof run>, from: string) => line(r, from).id;
const nums = (ps: readonly { pointId: string }[]) => ps.map((p) => p.pointId);
/** The same ring, read from any point and either way round. */
const sameRing = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  const twice = [...a, ...a].join(",");
  return twice.includes(b.join(",")) || twice.includes([...b].reverse().join(","));
};

describe("matching a sketch's numbers to the survey", () => {
  const index = indexPoints([...SYNTH_POINTS, { ...SYNTH_POINTS[0]!, id: synthId("9005"), pointId: "A1" }]);
  it("matches exactly, then by leading zeros or letter case, and says so", () => {
    expect(matchPoint("40", index)).toMatchObject({ how: "exact", point: { pointId: "40" } });
    expect(matchPoint("040", index)).toMatchObject({ how: "leading zeros", point: { pointId: "40" } });
    expect(matchPoint("a1", index)).toMatchObject({ how: "case", point: { pointId: "A1" } });
    expect(matchPoint("40.", index)).toMatchObject({ how: "exact" });
  });
  it("never chooses between points, and never guesses a number", () => {
    const twice = indexPoints([...SYNTH_POINTS, { ...SYNTH_POINTS[1]!, id: synthId("9001") }]);
    expect(matchPoint("41", twice)).toMatchObject({ how: "ambiguous", point: null });
    expect(matchPoint("99", index)).toMatchObject({ how: "none", point: null });
    expect(matchPoint("4l", index)).toMatchObject({ how: "none" });
  });
});

describe("what a line, symbol or area is", () => {
  it("reads codes from the code list first, then words in English and Sinhala, then how it's drawn", () => {
    expect(classifyLine("MW", "double", codes)).toMatchObject({ kind: "wall", fromWriting: true, code: { code: "MW" } });
    expect(classifyLine("MW2", "single", codes)).toMatchObject({ kind: "wall", code: { code: "MW" } });
    expect(classifyLine("Station Road", "double", codes)).toMatchObject({ kind: "road", fromWriting: true });
    expect(classifyLine("jayanthamw5", "double", codes)).toMatchObject({ kind: "road" });
    expect(classifyLine("proposed drain", "single", codes)).toMatchObject({ kind: "drain" });
    expect(classifyLine("කාණුව", "single", codes)).toMatchObject({ kind: "drain" });
    expect(classifyLine("", "double", codes)).toMatchObject({ kind: "wall", fromWriting: false });
    expect(classifyLine("", "crossed", codes)).toMatchObject({ kind: "fence", fromWriting: false });
    expect(classifyLine("", "single", codes)).toMatchObject({ kind: "line", fromWriting: false });
  });
  it("tells a building from a lot from someone's land", () => {
    expect(classifyArea("P", codes)).toMatchObject({ kind: "building", code: { code: "P" } });
    expect(classifyArea("ගෙය", codes)).toMatchObject({ kind: "building" });
    expect(classifyArea("X", codes)).toMatchObject({ kind: "lot", name: "X" });
    expect(classifyArea("lot B2", codes)).toMatchObject({ kind: "lot", name: "B2" });
    expect(classifyArea("Land of A. Perera", codes)).toMatchObject({ kind: "land" });
  });
  it("reads a written road width in metres, by the international foot", () => {
    expect(writtenWidth("15'")).toBeCloseTo(4.572, 6);
    expect(writtenWidth("Road 15 ft")).toBeCloseTo(4.572, 6);
    expect(writtenWidth("4.5m")).toBe(4.5);
    expect(writtenWidth("Station Road")).toBeNull();
  });
});

describe("the sketch's drawing, joined to the surveyed points", () => {
  it("finds the lot as the outline the walls close round, by its corners, without choosing it by area", () => {
    const l = lot(run({ statedM2: 140 }));
    expect(sameRing(nums(l.corners), ["5", "40", "30", "31", "32", "60"])).toBe(true);
    // 63 and 65 turn by more than 10° between them, 0.20 m apart, but lie within 0.03 m of the east wall: points on its side.
    expect(new Set(nums(l.onSides))).toEqual(new Set(["41", "42", "43", "6", "62", "63", "65", "61"]));
    expect(l.areaM2).toBeCloseTo(155.7, 6);
    expect(l.label).toBe("X");
    expect(l.evidence.join(" ")).toMatch(/strip 1\.90 m wide/);
    expect(l.evidence.join(" ")).toContain("The stated extent is 140.00 m²: the outline is 11.2% larger. The outline wasn't chosen to match it.");
  });

  it("judges a corner by how far a point lies off its side, asks about one between the tolerances, and takes the tolerances as given", () => {
    const r = run();
    const q = r.questions.find((x) => x.text.startsWith("42 lies 0.15 m off the lot's side"))!;
    expect(q.text).toMatch(/from (5 to 40|40 to 5): it was taken as a point on that side, not a corner\.$/);
    // As a corner, 42 (0.15 m inside the west wall, 20 m long) takes a triangle of 1.5 m² off the lot.
    expect(q.evidence[0]).toMatch(/^As a corner, the lot's area would be 154\.20 m² \(1\.50 m² less\)/);
    // Only 42 lies between the two tolerances; 63 and 65 are well within the tight one.
    expect(r.questions.filter((x) => x.text.includes("off the lot's side"))).toHaveLength(1);
    // The tolerances are Farbaek's defaults, never a rule: with a tighter one, 42 is a corner.
    expect(nums(lot(run({ onLineM: 0.1 })).corners)).toContain("42");
    expect(cornerIndexes([{ e: 0, n: 0 }, { e: 0, n: 5 }, { e: 0.05, n: 5.2 }, { e: 0, n: 10 }], false, 0.25)).toEqual([0, 3]);
    expect(cornerIndexes([{ e: 0, n: 0 }, { e: 2, n: 5 }, { e: 0, n: 10 }], false, 0.25)).toEqual([0, 1, 2]);
  });

  it("tests each line drawn straight against the coordinates, and says how far each point lies off it", () => {
    const r = run();
    const west = line(r, "l1");
    expect(west).toMatchObject({ feature: "wall", code: "MW", layer: "WALLS", level: "check" });
    expect(nums(west.points)).toEqual(["5", "41", "42", "43", "40"]);
    expect(west.evidence.join(" ")).toContain("42 is more than 0.10 m off it");
    // A surveyed point on the wall that the sketch doesn't number is said, never added.
    expect(west.evidence.join(" ")).toMatch(/45 also lies on it .* not added/);
    expect(nums(west.points)).not.toContain("45");
    // East wall: every point within the tight tolerance, written clearly: strong.
    expect(line(r, "l4")).toMatchObject({ level: "strong" });
    // A number written with a leading zero matched, and said; the evidence is then only good enough to check.
    expect(line(r, "l5").evidence).toContain("060 read as point 60 (leading zeros)");
    expect(line(r, "l5").level).toBe("check");
    // A line drawn uncertain is only ever "check".
    expect(line(r, "l9").level).toBe("check");
  });

  it("asks instead of guessing: unknown numbers, unnamed lines, a building without corners", () => {
    const q = run().questions.map((x) => x.text);
    expect(q).toContain("The line 99 and 5 (\"MW\") wasn't drawn: 99 isn't a point number in the survey.");
    expect(q.some((t) => t.startsWith("What is the line 80, 81 and 82? Nothing is written along it."))).toBe(true);
    expect(q.some((t) => t.startsWith("What is the line 31 and 32?"))).toBe(true);
    expect(q.some((t) => t.includes('"P" is written on the sketch') && t.includes("corners aren't numbered"))).toBe(true);
    expect(run().proposals.some((p) => p.from.includes("l10"))).toBe(false);
  });

  it("says which side of its surveyed edge the road is on, from where the lot is, and never draws a far edge it can't place", () => {
    const r = run();
    const road = line(r, "l7");
    expect(road).toMatchObject({ feature: "road", layer: "ROADS" });
    expect(road.evidence.join(" ")).toMatch(/lies on the other side, to its north-east/);
    expect(r.questions.map((x) => x.text).some((t) => t.includes("written as 15' wide (4.57 m)") && t.includes("north-east"))).toBe(true);
    // Without a written width, it asks for one.
    expect(run({ widths: [] }).questions.map((x) => x.text)).toContain("The width of the road along 90, 91, 92 and 93 isn't written on the sketch.");
  });

  it("puts a well at the point the sketch draws it at", () => {
    const well = run().proposals.find((p) => p.kind === "symbol");
    expect(well).toMatchObject({ code: "Well", point: { pointId: "70" }, level: "strong" });
  });

  it("never invents a position: every proposal's points are the survey's own", () => {
    const surveyed = new Set(SYNTH_POINTS.map((p) => p.id));
    for (const p of run().proposals) {
      const pts = p.kind === "lot" ? [...p.corners, ...p.onSides] : p.kind === "symbol" ? [p.point] : p.points;
      for (const x of pts) expect(surveyed.has(x.id)).toBe(true);
    }
    // And the reader's answer has no place for a number other than which photo it's on.
    const numeric = (shape: Record<string, unknown>) => Object.entries(shape).filter(([, v]) => (v as { def?: { type?: string } }).def?.type === "number").map(([k]) => k);
    for (const part of Object.values(SketchDrawingOutput)) {
      const item = (part as unknown as { element: { shape: Record<string, unknown> } }).element;
      expect(numeric(item.shape)).toEqual(["image"]);
    }
  });
});

describe("the proposals on the plan", () => {
  const withSketch = (): SurveyDocument => ({
    ...emptyDocument(),
    codes,
    sheet: { ...emptyDocument().sheet, statedExtent: "140 m2" },
    sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-23T10:00:00Z", files: ["sketch.jpg"], readings: [{ id: "r1", file: "sketch.jpg", kind: "road", text: "15'", from: "", to: "", near: "91" }], unreadable: [], drawing: SYNTH_DRAWING },
  });

  it("adds each as an item read from a photo, waiting for the surveyor, and the document stays valid", () => {
    const doc = withSketch();
    const r = applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!);
    expect(surveyDocumentSchema.safeParse(r.document).success).toBe(true);
    expect(r.document.lots).toHaveLength(1);
    expect(r.document.lots[0]!.label).toBe("X");
    const ids = interpretDocument(doc, SYNTH_POINTS)!.proposals;
    expect(r.document.symbols).toEqual([{ id: ids.find((p) => p.kind === "symbol")!.id, code: "Well", point: synthId("70") }]);
    expect(r.document.features.map((f) => f.id).sort()).toEqual(ids.filter((p) => p.kind === "line").map((p) => p.id).sort());
    expect(r.document.features).toHaveLength(9);
    // Ids come from what each item is: its kind and its points, so they're short, valid and different.
    for (const p of ids) expect(p.id).toMatch(/^sk-(lot|l|s|b)-[0-9a-z]{14}$/);
    for (const a of r.added) expect(r.document.provenance[a.key]).toEqual({ source: "ai_photo", reviewed: false });
    // Applying again adds nothing twice.
    const again = applySketch(r.document, interpretDocument(r.document, SYNTH_POINTS)!);
    expect(again.added).toEqual([]);
  });

  it("never replaces a plan's own lots", () => {
    const doc = { ...withSketch(), lots: [{ id: "own", label: "A", sup: "", points: [synthId("5"), synthId("40"), synthId("60")], note: "" }] };
    const r = applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!);
    expect(r.document.lots.map((l) => l.id)).toEqual(["own"]);
    expect(r.skipped).toContain("The sketch's lot wasn't added: the plan already has lots.");
  });

  it("shows the plan with the well drawn, each item's evidence for its Confirm, and the open questions in the checks", () => {
    const doc = withSketch();
    const applied = applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!).document;
    const view = buildPlan({ points: SYNTH_POINTS, document: applied, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
    expect(view.sheet.pages[0]!.items.some((i) => i.kind === "circle" && i.entity === `pt:${synthId("70")}` && i.r > 1)).toBe(true);
    expect(view.findings.find((f) => f.code === "AI_ITEMS_UNREVIEWED")).toBeDefined();
    expect(view.findings.filter((f) => f.code === "SKETCH_QUESTION").length).toBeGreaterThanOrEqual(4);
    const interpretation = interpretDocument(applied, SYNTH_POINTS);
    expect(sketchEvidence(interpretation, `feature:${lineId(interpretation!, "l4")}`)).toMatchObject({ level: "strong", file: "sketch.jpg" });
    expect(sketchEvidence(interpretation, `lot:${lot(interpretation!).id}`)!.evidence.join(" ")).toMatch(/close round/);
    expect(sketchEvidence(interpretation, "feature:f-auto-1")).toBeNull();
    expect(sketchQuestionFindings(interpretation, applied)[0]).toMatchObject({ severity: "warning", blocks: [] });
    expect(sketchItemId(lot(interpretation!))).toBe(lot(interpretation!).id);
  });

  it("writes the well into the DXF as a point with its meaning, as the sheet draws it", () => {
    const doc = withSketch();
    const applied = applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!).document;
    const dxf = writeDxf({ document: applied, points: SYNTH_POINTS, lots: computeLots(SYNTH_POINTS, applied.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" });
    const well = SYNTH_POINTS.find((p) => p.pointId === "70")!;
    expect(dxf).toContain(`POINT\r\n8\r\nPOINTS\r\n10\r\n${well.e.toFixed(4)}\r\n20\r\n${well.n.toFixed(4)}`);
    expect(dxf).toMatch(/BOUNDARY_MARKS\r\n10\r\n[\d.]+\r\n20\r\n[\d.]+\r\n30\r\n[\d.]+\r\n40\r\n[\d.]+\r\n1\r\nWell\r\n/);
    // Without the symbol, the point carries no code: nothing is written for it.
    expect(writeDxf({ document: { ...applied, symbols: [] }, points: SYNTH_POINTS, lots: computeLots(SYNTH_POINTS, applied.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" })).not.toMatch(/\r\nWell\r\n/);
  });

  it("puts each open question on the Confirm of what it's about, and drops it once that's confirmed, removed or labelled", () => {
    const doc = withSketch();
    const applied = applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!).document;
    const asked = (d: SurveyDocument) => sketchQuestionFindings(interpretDocument(d, SYNTH_POINTS), d).map((f) => f.message);
    const inner = "What is the line 80, 81 and 82? Nothing is written along it.";
    expect(asked(applied)).toContain(inner);
    const l6 = lineId(interpretDocument(applied, SYNTH_POINTS)!, "l6");
    const lotKey = `lot:${lot(interpretDocument(applied, SYNTH_POINTS)!).id}`;
    expect(sketchEvidence(interpretDocument(applied, SYNTH_POINTS), `feature:${l6}`)!.questions[0]).toMatch(/^What is the line 80, 81 and 82\?/);
    // Confirmed: answered.
    expect(asked({ ...applied, provenance: { ...applied.provenance, [`feature:${l6}`]: { source: "ai_photo", reviewed: true } } })).not.toContain(inner);
    // Removed: answered too.
    expect(asked({ ...applied, features: applied.features.filter((f) => f.id !== l6) })).not.toContain(inner);
    // The lot's corner question goes with the lot's confirmation; a label it never had is answered by giving one.
    const corner = (msgs: string[]) => msgs.some((t) => t.startsWith("42 lies"));
    const unlabelled = { ...applied, lots: applied.lots.map((l) => ({ ...l, label: "" })) };
    expect(corner(asked(unlabelled))).toBe(true);
    expect(corner(asked({ ...unlabelled, provenance: { ...unlabelled.provenance, [lotKey]: { source: "ai_photo", reviewed: true } } }))).toBe(false);
    const noLetter: SurveyDocument = { ...doc, sketch: { ...doc.sketch!, drawing: { ...SYNTH_DRAWING, areas: SYNTH_DRAWING.areas.filter((a) => a.label !== "X") } } };
    const lettered = applySketch(noLetter, interpretDocument(noLetter, SYNTH_POINTS)!).document;
    const letter = "The lot's letter or number isn't written on the sketch.";
    expect(asked(lettered)).toContain(letter);
    expect(asked({ ...lettered, lots: lettered.lots.map((l) => ({ ...l, label: "B" })) })).not.toContain(letter);
    // Questions about nothing on the plan stay while the drawing says so.
    expect(asked({ ...applied, provenance: { ...applied.provenance, [`feature:${l6}`]: { source: "ai_photo", reviewed: true } } }).some((t) => t.includes('"P" is written on the sketch'))).toBe(true);
  });
});

describe("keeping what the reader returned", () => {
  const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
  const invisible = (s: string) => /[\u200B-\u200F\u202A-\u202E]/.test(s);
  it("drops what can't be trusted: another photo, an unknown style, hidden characters, a line of one number", () => {
    const kept = acceptDrawing(
      {
        lines: [
          { image: 0, points: ["1", "2"], label: " MW ", style: "double", closes: false, certain: true },
          { image: 3, points: ["1", "2"], label: "", style: "single", closes: false, certain: true },
          { image: 0, points: ["1", "2"], label: "", style: "wavy", closes: false, certain: true },
          { image: 0, points: ["1", "2\u200B"], label: "", style: "single", closes: false, certain: true },
          { image: 0, points: ["1"], label: "", style: "single", closes: false, certain: true },
        ],
        symbols: [{ image: 0, kind: "well", label: "", at: "19" }, { image: 0, kind: "dragon", label: "", at: "" }],
        areas: [{ image: 0, label: "", around: [] }, { image: 0, label: "P", around: ["3", "4"] }],
      },
      ["a.jpg"],
      clean,
      invisible,
    );
    expect(kept.lines).toEqual([{ id: "l1", file: "a.jpg", points: ["1", "2"], label: "MW", style: "double", closes: false, certain: true }]);
    expect(kept.symbols).toHaveLength(1);
    expect(kept.areas).toEqual([{ id: "a1", file: "a.jpg", label: "P", around: ["3", "4"] }]);
  });
});

/** The drafting assistant's core (stage 195), on the SYNTHETIC sample plan: checks, changes, answers and the conversation. */
import { describe, expect, it } from "vitest";
import { computeLots } from "../lots";
import { SAMPLE_AREA_M2, SAMPLE_POINTS, sampleDocument } from "../fixtures";
import { emptyDocument, surveyDocumentSchema } from "../document";
import { answer } from "./answer";
import { applyOps, revertPatch } from "./apply";
import { checkTurn, hasFigure } from "./check";
import { assistContext } from "./context";
import { describeOp, readBack } from "./describe";
import { browserFamily, scriptOf, voiceAvailability } from "./languages";
import { readCoordinateRows, readLegs } from "./measure";
import { tierOf, type AssistOp, type AssistOutput } from "./ops";
import { readCommand } from "./reader";
import { ambiguousNumbers, initialSession, sessionReducer } from "./session";
import { legFacing } from "./sides";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const none = { from: "none" as const, quote: "" };

function turn(instruction: string, ops: AssistOp[], opts: { say?: string; selection?: string[]; doc?: ReturnType<typeof sampleDocument>; inputMethod?: "voice" | "typed" } = {}) {
  const doc = opts.doc ?? sampleDocument();
  const ctx = assistContext({ doc, points: SAMPLE_POINTS, selection: opts.selection ?? [], recent: [], step: "plan" });
  const output: AssistOutput = { say: opts.say ?? "Done.", ops };
  return { doc, checked: checkTurn({ instruction, output, doc, points: SAMPLE_POINTS, selection: opts.selection ?? [], refs: ctx.refs, inputMethod: opts.inputMethod ?? "voice" }) };
}

describe("what the model is told", () => {
  it("gives refs, names and point numbers, never a coordinate or an area", () => {
    const ctx = assistContext({ doc: sampleDocument(), points: SAMPLE_POINTS, selection: [`pt:${id(3)}`, `leg:lot-b1:0`], recent: ["Applied: lot B4"], step: "plan" });
    const json = JSON.stringify(ctx.plan);
    expect(json).not.toMatch(/500\d{3}|600\d{3}|21\.43|1057/);
    expect(ctx.refs.L1).toBe("lot:lot-b1");
    expect(ctx.refs["P:12"]).toBe(`pt:${id(12)}`);
    expect((ctx.plan.selection as { ref: string }[]).map((s) => s.ref)).toEqual(["P:3", "L1 leg 1"]);
    expect((ctx.plan.adjoining as { text: unknown }[])[0]!.text).toEqual({ data: "Land claimed by the sample owner" });
  });
});

describe("checking a turn", () => {
  it("adds a lot from the points said, and from the points picked, in order", () => {
    const said = turn("add lot B4 from points 1 to 3 and 8", [{ op: "add_lot", label: "lot B4", corners: { from: "words", quote: "points 1 to 3 and 8" }, note: "", quote: "add lot B4 from points 1 to 3 and 8" }]);
    expect(said.checked.ops).toEqual([{ kind: "lot_add", lot: { id: "lot-a1", label: "B", sup: "4", points: [id(1), id(2), id(3), id(8)], note: "" }, quote: "add lot B4 from points 1 to 3 and 8" }]);
    const picked = turn("make lot C from these points", [{ op: "add_lot", label: "lot C", corners: { from: "selection", quote: "" }, note: "", quote: "make lot C from these points" }], { selection: [`pt:${id(4)}`, `mark:${id(5)}`, `pt:${id(8)}`] });
    expect(picked.checked.ops[0]).toMatchObject({ kind: "lot_add", lot: { label: "C", sup: "", points: [id(4), id(5), id(8)] } });
  });

  it("drops a value that isn't in the words, a point that isn't in the project, and a lot that's there already", () => {
    const invented = turn("add a lot from points 1 2 3", [{ op: "add_lot", label: "lot B9", corners: { from: "words", quote: "points 1 2 3" }, note: "", quote: "add a lot from points 1 2 3" }]);
    expect(invented.checked.ops).toEqual([]);
    expect(invented.checked.dropped[0]!.why).toMatch(/name/);
    const unknown = turn("add lot D from points 1 2 99", [{ op: "add_lot", label: "lot D", corners: { from: "words", quote: "points 1 2 99" }, note: "", quote: "add lot D from points 1 2 99" }]);
    expect(unknown.checked.dropped[0]!.why).toBe("Point 99 isn't in this project.");
    const twice = turn("add lot B1 from points 1 2 3", [{ op: "add_lot", label: "lot B1", corners: { from: "words", quote: "points 1 2 3" }, note: "", quote: "add lot B1 from points 1 2 3" }]);
    expect(twice.checked.dropped[0]!.why).toMatch(/already on the plan/);
    const notPicked = turn("make lot C from these points", [{ op: "add_lot", label: "lot C", corners: { from: "selection", quote: "" }, note: "", quote: "make lot C from these points" }]);
    expect(notPicked.checked.dropped[0]!.why).toMatch(/picked on the sheet/);
  });

  it("keeps the model's figures off the screen, and its questions free of figures", () => {
    const r = turn("what is the area", [{ op: "answer", topic: "total_area", target: "" }, { op: "ask", question: "Is it 2267 square metres?", choices: [] }], { say: "The area is 2267 m²." });
    expect(r.checked.say).toBe("");
    expect(r.checked.question).toBeNull();
    expect(hasFigure("about twenty metres")).toBe(true);
    expect(hasFigure("I'll add the lot.")).toBe(false);
    expect(hasFigure("lot B ൧")).toBe(true);
  });

  it("reads a scale and a date from the words, and refuses what isn't said", () => {
    const r = turn("set the scale to 1:500 and the survey date 12 November 2026", [
      { op: "set_number", setting: "scale", quote: "scale to 1:500" },
      { op: "set_field", field: "surveyDate", value: "12 November 2026", quote: "survey date 12 November 2026" },
      { op: "set_field", field: "landName", value: "Ambagahawatta", quote: "land name Ambagahawatta" },
    ]);
    expect(r.checked.ops).toEqual([
      { kind: "number", setting: "scale", value: 500, quote: "scale to 1:500" },
      { kind: "field", field: "surveyDate", value: "2026-11-12", quote: "survey date 12 November 2026" },
    ]);
    expect(r.checked.dropped).toHaveLength(1);
  });

  it("finds the leg facing a side by geometry, and asks when two face it equally", () => {
    const east = turn('write "Land of A. Perera" on the east of lot B1', [{ op: "add_adjoining", text: "Land of A. Perera", lot: "L1", side: "east", leg: none, quote: 'write "Land of A. Perera" on the east of lot B1' }]);
    expect(east.checked.ops[0]).toMatchObject({ kind: "adjoining_add", adjoining: { lot: "lot-b1", from: id(2), to: id(3) } });
    const north = turn('write "Temple land" on the north of lot B1', [{ op: "add_adjoining", text: "Temple land", lot: "L1", side: "north", leg: none, quote: 'write "Temple land" on the north of lot B1' }]);
    expect(north.checked.question?.choices).toEqual(["from 3 to 8", "from 8 to 7"]);
  });

  it("never removes a surveyed point, and caps the steps of one instruction", () => {
    const r = turn("remove point 3", [{ op: "remove", target: "P:3", quote: "remove point 3" }]);
    expect(r.checked.dropped[0]!.why).toMatch(/record of the survey/);
    const many = Array.from({ length: 14 }, (): AssistOp => ({ op: "history", action: "undo", quote: "undo" }));
    expect(turn("undo", many).checked.ops).toHaveLength(12);
    expect(turn("undo", many, { inputMethod: "typed" }).checked.ops).toHaveLength(14);
  });

  it("asks for a strip's width rather than assuming one, and hands a division over with the leg by its side", () => {
    const strip = turn("add an access road along the eastern boundary of lot B1", [{ op: "divide", lot: "L1", by: "width", count: "", values: "", unit: "", lines: "parallel", side: "east", quote: "access road along the eastern boundary" }]);
    expect(strip.checked.question?.text).toMatch(/How wide/);
    const four = turn("divide lot B1 into four lots", [{ op: "divide", lot: "L1", by: "area", count: "four", values: "", unit: "", lines: "", side: "", quote: "divide lot B1 into four lots" }]);
    expect(four.checked.ops[0]).toMatchObject({ kind: "divide", lotId: "lot-b1", count: 4, values: [] });
    const tenFeet = turn("a ten feet access strip along the east of lot B1", [{ op: "divide", lot: "L1", by: "width", count: "", values: "ten feet", unit: "ft", lines: "parallel", side: "east", quote: "a ten feet access strip along the east of lot B1" }]);
    expect(tenFeet.checked.ops[0]).toMatchObject({ kind: "divide", values: [10], unit: "ft", leg: 1 });
  });

  it("reads dictated legs and points for the typed tables, never onto the plan", () => {
    const words = "from 101 to 102 bearing forty five thirty fifteen distance twenty five point four zero then to 103 bearing 90 0 0 distance 10.5";
    const r = turn(words, [{ op: "enter_measurements", mode: "bearings", quote: words }]);
    expect(r.checked.ops[0]).toMatchObject({ kind: "measure", mode: "bearings", rows: [{ from: "101", to: "102", distance: "25.40" }, { from: "102", to: "103", bearing: "90 0 0", distance: "10.5" }] });
    expect(tierOf(r.checked.ops[0]!)).toBe("handoff");
  });
});

describe("applying changes", () => {
  it("applies as one change with marks and a patch, and takes it back", () => {
    const { checked, doc } = turn("add lot B4 from points 1 to 3 and 8, hide the point numbers, title land name Ambagahawatta", [
      { op: "add_lot", label: "lot B4", corners: { from: "words", quote: "points 1 to 3 and 8" }, note: "", quote: "add lot B4 from points 1 to 3 and 8" },
      { op: "set_layer", layer: "POINT_NUMBERS", visible: "off", locked: "keep", quote: "hide the point numbers" },
      { op: "set_field", field: "landName", value: "Ambagahawatta", quote: "title land name Ambagahawatta" },
    ]);
    const r = applyOps(doc, checked.ops, SAMPLE_POINTS);
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.lots.map((l) => l.label + l.sup)).toEqual(["B1", "B2", "B3", "B4"]);
    expect(r.doc.layers.POINT_NUMBERS?.visible).toBe(false);
    expect(r.doc.sheet.landName).toBe("Ambagahawatta");
    expect(r.doc.provenance["lot:lot-a1"]).toEqual({ source: "ai_assist", reviewed: true });
    expect(r.touched).toEqual(["lot:lot-a1"]);
    expect(doc.lots).toHaveLength(3);
    expect(surveyDocumentSchema.safeParse(r.doc).success).toBe(true);
    const back = revertPatch(r.doc, r.patch);
    expect(back.ok && back.doc.lots).toHaveLength(3);
    const edited = { ...r.doc, notes: [...r.doc.notes] };
    edited.sheet = { ...edited.sheet, landName: "Changed by hand" };
    expect(revertPatch(edited, r.patch)).toEqual({ ok: false, changedSince: ["sheet"] });
  });

  it("moves a label on paper within its bounds, shows face dimensions with their layer, and removes a lot with its adjoining lands", () => {
    const doc = sampleDocument();
    doc.layers.DIMENSIONS = { visible: false, locked: false };
    const r = applyOps(
      doc,
      [
        { kind: "label", entity: "lot:lot-b1", dx: -3, dy: 0, quote: "" },
        { kind: "sheet", setting: "faceDimensions", value: true, quote: "" },
        { kind: "remove", target: "lot", id: "lot-b3", quote: "" },
      ],
      SAMPLE_POINTS,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.labelOffsets["lot:lot-b1"]).toEqual({ dx: -3, dy: 0 });
    expect(r.doc.layers.DIMENSIONS).toEqual({ visible: true, locked: false });
    expect(r.doc.adjoining.map((a) => a.id)).toEqual(["adj-west"]);
  });
});

describe("answers from the engine", () => {
  it("gives the computed area with the stated extent beside it, never instead", () => {
    const doc = sampleDocument();
    doc.sheet.statedExtent = "0 A. 2 R. 10 P.";
    const a = answer({ kind: "answer", topic: "total_area", lotId: null, quote: "" }, { doc, points: SAMPLE_POINTS, findings: [], scale: 500, suggestedScale: 500 });
    const m2 = computeLots(SAMPLE_POINTS, doc.lots).outlineAreaM2!;
    expect(m2).toBeCloseTo(SAMPLE_AREA_M2, 2);
    expect(a.rows[0]![1]).toBe(`0.22674 ha (0 A. 2 R. 09.65 P.), ${m2.toFixed(2)} m²`);
    expect(a.rows[1]).toEqual(["Stated in the title", "0 A. 2 R. 10 P."]);
    expect(a.speak).toBe("The land is zero decimal two two six seven four hectares.");
    expect(answer({ kind: "answer", topic: "total_area", lotId: null, quote: "" }, { doc: emptyDocument(), points: SAMPLE_POINTS, findings: [], scale: null, suggestedScale: null }).rows).toEqual([]);
  });
});

describe("the local reader", () => {
  it("reads commands, controls and questions, in English and Sinhala", () => {
    expect(readCommand("Please zoom in")).toEqual({ kind: "output", output: { say: "", ops: [{ op: "view", action: "zoom_in", target: "", points: none, quote: "Please zoom in" }] } });
    expect(readCommand("Apply")).toEqual({ kind: "control", control: "apply" });
    expect(readCommand("stop listening")).toEqual({ kind: "control", control: "stop" });
    expect(readCommand("go to the export step")).toEqual({ kind: "control", control: "goto", step: "export" });
    expect(readCommand("Prepare this plan for A3 printing")).toMatchObject({ output: { ops: [{ op: "set_sheet", setting: "paper", value: "A3" }] } });
    expect(readCommand("hide the point numbers")).toMatchObject({ output: { ops: [{ op: "set_layer", layer: "POINT_NUMBERS", visible: "off" }] } });
    expect(readCommand("Show the dimensions of every boundary line")).toMatchObject({ output: { ops: [{ op: "set_sheet", setting: "faceDimensions", value: "on" }] } });
    expect(readCommand("Move this label slightly to the left")).toMatchObject({ output: { ops: [{ op: "move_label", target: "selection", direction: "left", amount: "slight" }] } });
    expect(readCommand("Calculate the total land area")).toMatchObject({ output: { ops: [{ op: "answer", topic: "total_area" }] } });
    expect(readCommand("Add the north arrow")).toMatchObject({ output: { ops: [{ op: "answer", topic: "always_printed" }] } });
    expect(readCommand("විශාල කරන්න")).toMatchObject({ output: { ops: [{ op: "view", action: "zoom_in" }] } });
    expect(readCommand("හරි")).toEqual({ kind: "control", control: "apply" });
    expect(readCommand("Create the boundary using these survey points")).toBeNull();
  });

  it("feeds the same checks as the model", () => {
    const set = readCommand("set the scale to 1:500");
    if (set?.kind !== "output") throw new Error("not read");
    const doc = sampleDocument();
    const ctx = assistContext({ doc, points: SAMPLE_POINTS, selection: [], recent: [], step: "plan" });
    const checked = checkTurn({ instruction: "set the scale to 1:500", output: set.output, doc, points: SAMPLE_POINTS, selection: [], refs: ctx.refs, inputMethod: "voice" });
    expect(checked.ops).toEqual([{ kind: "number", setting: "scale", value: 500, quote: "scale to 1:500" }]);
  });
});

describe("words for the screen and for speech", () => {
  it("describes changes with their values, and reads figures back digit by digit", () => {
    const doc = sampleDocument();
    const op = { kind: "lot_add" as const, lot: { id: "lot-a1", label: "B", sup: "4", points: [id(1), id(2), id(3), id(8)], note: "" }, quote: "" };
    expect(describeOp(op, { doc, points: SAMPLE_POINTS })).toEqual({ text: "Add lot B4", values: [{ role: "Corners, in order", value: "1, 2, 3, 8", mono: true }] });
    expect(readBack([op, { kind: "number", setting: "scale", value: 500, quote: "" }], { doc, points: SAMPLE_POINTS })).toEqual(["Lot B four, corners one, two, three, eight.", "Scale one to five zero zero."]);
  });
});

describe("sides, measurements, languages and the conversation", () => {
  it("names the leg facing each side of a lot turned in any direction", () => {
    const ring = [SAMPLE_POINTS[0]!, SAMPLE_POINTS[1]!, SAMPLE_POINTS[2]!, SAMPLE_POINTS[6]!].map((p) => ({ ...p }));
    expect(legFacing(ring, "east")).toEqual({ leg: 1 });
    expect(legFacing(ring, "south")).toEqual({ leg: 0 });
    expect(legFacing([...ring].reverse(), "east")).toEqual({ leg: 1 });
    const turned = ring.map((p) => ({ ...p, e: p.e - p.n, n: p.e + p.n }));
    expect(legFacing(turned, "north")).not.toBeNull();
  });

  it("reads legs and coordinate rows, naming what it can't read", () => {
    expect(readLegs("from 1 to 2 distance 5 bearing 45").problems[0]).toMatch(/bearing, then the distance/);
    expect(readLegs("from 1 to 2 bearing 45 75 0 distance 5").problems[0]).toMatch(/bearing/);
    expect(readCoordinateRows("point 215 northing 600004.21 easting 450012.345 height 21.4 code CP; point 216 northing 1").rows).toEqual([{ point: "215", n: "600004.21", e: "450012.345", z: "21.4", code: "CP" }]);
  });

  it("says honestly which browser hears which language", () => {
    expect(browserFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1")).toBe("safari");
    expect(browserFamily("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0")).toBe("edge");
    expect(voiceAvailability("si", "chrome", true)).toEqual({ ok: true, tag: "si-LK", where: "cloud", company: "Google", unconfirmed: false });
    expect(voiceAvailability("si", "safari", true)).toMatchObject({ ok: false, reason: expect.stringMatching(/Apple's dictation doesn't hear Sinhala/) });
    expect(voiceAvailability("en", "firefox", true)).toMatchObject({ ok: true, where: "device", company: null });
    expect(voiceAvailability("ta", "chrome", true)).toMatchObject({ ok: false });
    expect(scriptOf("ලොට් B1 සාදන්න")).toBe("si");
  });

  it("runs push to talk, live talk and review through one set of states", () => {
    let s = initialSession("push");
    s = sessionReducer(s, { type: "listen" });
    s = sessionReducer(s, { type: "interim", text: "add lot" });
    expect(s.interim).toBe("add lot");
    s = sessionReducer(s, { type: "final", text: "add lot B4 from points 1 2 3", review: false });
    expect(s.phase).toBe("working");
    s = sessionReducer(s, { type: "result", phase: "suggested" });
    s = sessionReducer(s, { type: "decided" });
    expect(s.phase).toBe("idle");
    let live = sessionReducer(initialSession("live"), { type: "listen" });
    live = sessionReducer(live, { type: "final", text: "zoom in", review: false });
    expect(live.phase).toBe("countdown");
    live = sessionReducer(sessionReducer(live, { type: "countdown_done" }), { type: "result", phase: "applied" });
    live = sessionReducer(live, { type: "decided" });
    expect(live).toMatchObject({ phase: "listening", live: true });
    expect(sessionReducer(live, { type: "stop_live" })).toMatchObject({ phase: "idle", live: false });
    const unclear = sessionReducer(sessionReducer(initialSession(), { type: "listen" }), { type: "final", text: "points 2 to 4", review: false });
    expect(unclear.phase).toBe("heard");
    expect(ambiguousNumbers("zoom in")).toBe(false);
  });
});

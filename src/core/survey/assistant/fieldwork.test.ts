/**
 * The drafting assistant used as a surveyor uses it (stage 195 field test), on the SYNTHETIC sample plan: the instructions a land
 * surveyor gives while preparing a plan, typed or as a recogniser writes them said aloud, read by the local rules (instant, no AI)
 * and checked by the same code as the model's.
 */
import { describe, expect, it } from "vitest";
import { SAMPLE_POINTS, sampleDocument } from "../fixtures";
import { answer } from "./answer";
import { checkTurn } from "./check";
import { assistContext } from "./context";
import { readLegs } from "./measure";
import type { PlanOp } from "./ops";
import { readCommand } from "./reader";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Reads the words by the local rules (they must read without AI) and checks them. */
function local(words: string, opts: { selection?: string[]; doc?: ReturnType<typeof sampleDocument> } = {}) {
  const r = readCommand(words);
  if (r?.kind !== "output") throw new Error(`not read locally: ${words}`);
  const doc = opts.doc ?? sampleDocument();
  const selection = opts.selection ?? [];
  const ctx = assistContext({ doc, points: SAMPLE_POINTS, selection, recent: [], step: "plan" });
  return checkTurn({ instruction: words, output: r.output, doc, points: SAMPLE_POINTS, selection, refs: ctx.refs, inputMethod: "voice" });
}
const fields = (ops: PlanOp[]) => ops.filter((o) => o.kind === "field").map((o) => [(o as { field: string }).field, (o as { value: unknown }).value]);

describe("the title block, said as a surveyor says it", () => {
  it("fills each field from the surveyor's own words", () => {
    expect(fields(local("land name Ambagahawatta").ops)).toEqual([["landName", "Ambagahawatta"]]);
    expect(fields(local("the land is called Ambagahawatta").ops)).toEqual([["landName", "Ambagahawatta"]]);
    expect(fields(local("plan no 1234").ops)).toEqual([["planNumber", "1234"]]);
    expect(fields(local("plan number 1234/2026").ops)).toEqual([["planNumber", "1234/2026"]]);
    expect(fields(local("the village is Udugampola").ops)).toEqual([["village", "Udugampola"]]);
    expect(fields(local("GN division Udugampola North").ops)).toEqual([["gnDivision", "Udugampola North"]]);
    expect(fields(local("DS division Minuwangoda").ops)).toEqual([["dsDivision", "Minuwangoda"]]);
    expect(fields(local("surveyed on 12.11.2026").ops)).toEqual([["surveyDate", "2026-11-12"]]);
    expect(fields(local("survey date twelfth of November twenty twenty six").ops)).toEqual([["surveyDate", "2026-11-12"]]);
    expect(fields(local("the stated extent is 2 roods 10 perches").ops)).toEqual([["statedExtent", "2 roods 10 perches"]]);
    expect(fields(local("previous plan number 567 dated 01.02.2019").ops)).toEqual([
      ["previousPlanNumber", "567"],
      ["previousPlanDate", "2019-02-01"],
    ]);
  });

  it("reads several fields in one breath, but keeps a value with 'and' in it whole", () => {
    expect(fields(local("village Udugampola, district Gampaha").ops)).toEqual([
      ["village", "Udugampola"],
      ["district", "Gampaha"],
    ]);
    expect(fields(local("north by Lot 4 in Plan 1234, east by road, south by land claimed by A Perera, west by a stream").ops)).toEqual([
      ["boundaryNorth", "Lot 4 in Plan 1234"],
      ["boundaryEast", "road"],
      ["boundarySouth", "land claimed by A Perera"],
      ["boundaryWest", "a stream"],
    ]);
    expect(fields(local("north by land of A and B").ops)).toEqual([["boundaryNorth", "land of A and B"]]);
    expect(fields(local("survey date 12th November, 2026").ops)).toEqual([["surveyDate", "2026-11-12"]]);
    // "north arrow" is never a boundary.
    expect(local("north arrow").ops[0]).toMatchObject({ kind: "answer", topic: "always_printed" });
  });
});

describe("lots, adjoining lands and notes", () => {
  it("makes, renames, notes and removes lots, by name", () => {
    expect(local("add lot B4 from points one two three and eight").ops[0]).toMatchObject({ kind: "lot_add", lot: { label: "B", sup: "4", points: [id(1), id(2), id(3), id(8)] } });
    expect(local("lot A from 1, 2, 3, 4").ops[0]).toMatchObject({ kind: "lot_add", lot: { label: "A" } });
    expect(local("make lot B4 from points 1 2 3 8, lot C from points 4 5 6").ops.map((o) => o.kind)).toEqual(["lot_add", "lot_add"]);
    expect(local("rename lot B3 to C").ops[0]).toMatchObject({ kind: "lot_edit", id: "lot-b3", label: "C", sup: "" });
    expect(local("add a note to lot B1 saying garden").ops[0]).toMatchObject({ kind: "lot_edit", id: "lot-b1", note: "garden" });
    expect(local("remove lot B3").ops[0]).toMatchObject({ kind: "remove", target: "lot", id: "lot-b3" });
    expect(local("note: the drain is outside the land").ops[0]).toMatchObject({ kind: "note_add", text: "the drain is outside the land" });
  });

  it("asks which leg when two face the side, and takes the answer as the leg's two points", () => {
    const asked = local("the land on the north of lot B1 is Lot 4 in Plan 1234");
    expect(asked.question?.choices).toEqual(["between 3 and 8", "between 8 and 7"]);
    const answered = local(`the land on the north of lot B1 is Lot 4 in Plan 1234. ${asked.question!.choices[0]}`);
    expect(answered.ops[0]).toMatchObject({ kind: "adjoining_add", adjoining: { text: "Lot 4 in Plan 1234", lot: "lot-b1", from: id(3), to: id(8) } });
    expect(local("lot B one is bounded on the east by a road").ops[0]).toMatchObject({ kind: "adjoining_add", adjoining: { text: "a road", lot: "lot-b1" } });
  });
});

describe("subdivision and access roads", () => {
  it("hands divisions to the divide panel, however they're said", () => {
    expect(local("split lot B1 in half").ops[0]).toMatchObject({ kind: "divide", lotId: "lot-b1", count: 2 });
    expect(local("divide B1 into four lots").ops[0]).toMatchObject({ kind: "divide", lotId: "lot-b1", count: 4 });
    expect(local("subdivide lot B1 into three lots").ops[0]).toMatchObject({ kind: "divide", count: 3 });
    expect(local("add a 10 ft access road along the eastern boundary of lot B2").ops[0]).toMatchObject({ kind: "divide", lotId: "lot-b2", by: "width", values: [10], unit: "ft" });
    expect(local("reserve a 12 feet road along the east of lot B1").ops[0]).toMatchObject({ kind: "divide", lotId: "lot-b1", values: [12], unit: "ft" });
    expect(local("leave a 12 foot road along the east side of lot B1").ops[0]).toMatchObject({ kind: "divide", values: [12], unit: "ft" });
  });
});

describe("the sheet", () => {
  it("sets paper, orientation and scale, as said in Sri Lanka", () => {
    expect(local("A3 landscape at 1:500").ops).toMatchObject([{ kind: "sheet", value: "A3" }, { kind: "sheet", value: "landscape" }, { kind: "number", setting: "scale", value: 500 }]);
    expect(local("print on a three landscape").ops).toMatchObject([{ kind: "sheet", value: "A3" }, { kind: "sheet", value: "landscape" }]);
    expect(local("set the scale to one is to five hundred").ops[0]).toMatchObject({ kind: "number", setting: "scale", value: 500 });
    expect(local("automatic scale").ops[0]).toMatchObject({ kind: "number", setting: "scale", value: null });
    expect(local("show the overleaf schedule").ops[0]).toMatchObject({ kind: "sheet", setting: "overleaf", value: true });
    expect(local("show bearings and distances on the lines").ops[0]).toMatchObject({ kind: "sheet", setting: "faceDimensions", value: true });
    expect(local("hide the walls and fences").ops.map((o) => (o as { layer?: string }).layer)).toEqual(["WALLS", "FENCES"]);
    expect(local("A3 landscape and hide the point numbers").ops).toHaveLength(3);
    expect(local("add lot B4 from points 1, 2, 3 and 8, then hide the point numbers").ops.map((o) => o.kind)).toEqual(["lot_add", "layer"]);
  });

  it("nudges the picked label, and puts it back", () => {
    const sel = ["lot:lot-b1"];
    expect(local("nudge it right", { selection: sel }).ops[0]).toMatchObject({ kind: "label", dx: 3, dy: 0 });
    expect(local("move it down a little", { selection: sel }).ops[0]).toMatchObject({ kind: "label", dx: 0, dy: 1 });
    expect(local("put it back", { selection: sel }).ops[0]).toMatchObject({ kind: "label_back" });
  });
});

describe("questions about the plan", () => {
  const ask = (words: string) => {
    const doc = sampleDocument();
    const op = local(words, { doc }).ops[0] as Extract<PlanOp, { kind: "answer" }>;
    return answer(op, { doc, points: SAMPLE_POINTS, findings: [{ code: "X", severity: "error", message: "No surveyor is responsible for this plan yet.", blocks: ["approval"] }] as never, scale: 500, suggestedScale: 500 });
  };

  it("gives the extent in acres, roods and perches, and says it that way", () => {
    for (const words of ["what is the extent", "what is the area in perches", "total extent"]) expect(ask(words).rows[0]![1], words).toContain("A. 2 R. 09.65 P.");
    expect(ask("what is the extent").speak).toMatch(/^The land is two roods, nine decimal six five perches; that's zero decimal two two six seven four hectares\.$/);
    expect(ask("what is the extent of lot B2").speak).toMatch(/^Lot B2 is twenty three decimal one three perches/);
  });

  it("says what's missing by what it is, not just how many", () => {
    const a = ask("can I approve it");
    expect(a.rows).toContainEqual(["Stops approval", "No surveyor is responsible for this plan yet."]);
    expect(a.speak).toMatch(/^(One thing is|[a-z]+ things are) still needed/);
    expect(ask("what scale is it").title).toBe("The scale");
  });
});

describe("dictated field books", () => {
  it("reads legs separated only by commas, as recognisers write them", () => {
    const r = readLegs("from 101 to 102 bearing 45° 30' 15\" distance 25.40 m, to 103 bearing 135° 00' 00\" distance 30.10 m");
    expect(r.problems).toEqual([]);
    expect(r.rows).toMatchObject([
      { from: "101", to: "102", bearing: "45 30 15", distance: "25.40" },
      { from: "102", to: "103", bearing: "135 00 00", distance: "30.10" },
    ]);
    expect(readCommand("point 101 northing 600004.123 easting 450012.456 height 12.3")).toMatchObject({ output: { ops: [{ op: "enter_measurements", mode: "coordinates" }] } });
  });
});

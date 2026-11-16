/**
 * The stage 195 field test's review (2026-11-16), on the SYNTHETIC sample plan: instructions that the local rules read wrongly, each
 * now read right or handed to the model, never swallowed into a value. Speech recognisers usually leave the commas out, so most of
 * these are said without them.
 */
import { describe, expect, it } from "vitest";
import { SAMPLE_POINTS, sampleDocument } from "../fixtures";
import { answer } from "./answer";
import { checkTurn } from "./check";
import { assistContext } from "./context";
import { describeTurn } from "./describe";
import { readLegs } from "./measure";
import type { AssistOp, PlanOp } from "./ops";
import { readCommand } from "./reader";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function turn(instruction: string, ops: AssistOp[], opts: { selection?: string[]; doc?: ReturnType<typeof sampleDocument> } = {}) {
  const doc = opts.doc ?? sampleDocument();
  const selection = opts.selection ?? [];
  const ctx = assistContext({ doc, points: SAMPLE_POINTS, selection, recent: [], step: "plan" });
  return checkTurn({ instruction, output: { say: "", ops }, doc, points: SAMPLE_POINTS, selection, refs: ctx.refs, inputMethod: "typed" });
}
/** Read by the local rules (they must read without AI), then checked. */
function local(words: string, opts: { selection?: string[]; doc?: ReturnType<typeof sampleDocument> } = {}) {
  const r = readCommand(words);
  if (r?.kind !== "output") throw new Error(`not read locally: ${words}`);
  return turn(words, r.output.ops, opts);
}
const ops = (words: string) => {
  const r = readCommand(words);
  return r?.kind === "output" ? r.output.ops : null;
};
const fields = (list: PlanOp[]) => list.filter((o) => o.kind === "field").map((o) => [(o as { field: string }).field, (o as { value: unknown }).value]);

describe("a value ends where the next field starts", () => {
  it("parts title fields said without commas", () => {
    expect(fields(local("village Udugampola district Gampaha").ops)).toEqual([
      ["village", "Udugampola"],
      ["district", "Gampaha"],
    ]);
    expect(fields(local("village Udugampola, Gampaha district").ops)).toEqual([
      ["village", "Udugampola"],
      ["district", "Gampaha"],
    ]);
    expect(fields(local("village Udugampola and district Gampaha").ops)).toEqual([
      ["village", "Udugampola"],
      ["district", "Gampaha"],
    ]);
    expect(fields(local("Western Province").ops)).toEqual([["province", "Western"]]);
  });

  it("parts the four boundaries, with or without commas", () => {
    const four = [
      ["boundaryNorth", "Lot 4"],
      ["boundaryEast", "road"],
      ["boundarySouth", "land of A Perera"],
      ["boundaryWest", "a stream"],
    ];
    expect(fields(local("north by Lot 4 east by road south by land of A Perera west by a stream").ops)).toEqual(four);
    expect(fields(local("north by Lot 4 in Plan 1234, east by road, south by land of A Perera, and a stream on the west").ops)).toEqual([
      ["boundaryNorth", "Lot 4 in Plan 1234"],
      ...four.slice(1),
    ]);
  });

  it("takes a land said before its side, but not a sentence or a part of the sheet", () => {
    expect(fields(local("Crown land to the north").ops)).toEqual([["boundaryNorth", "Crown land"]]);
    for (const words of ["the well is on the west", "there is a stream on the west", "the label on the west", "move the label to the west"]) expect(readCommand(words), words).toBeNull();
  });

  it("keeps words that only look like a field inside a boundary or a note", () => {
    expect(fields(local("east by a stream and village road").ops)).toEqual([["boundaryEast", "a stream and village road"]]);
    expect(fields(local("south by paddy field and the village tank").ops)).toEqual([["boundarySouth", "paddy field and the village tank"]]);
    expect(ops("add a note saying access is from the main road and the village road")).toEqual([
      { op: "add_note", text: "access is from the main road and the village road", quote: "add a note saying access is from the main road and the village road" },
    ]);
    expect(ops("note: the land is bounded north by road and east by a canal")?.map((o) => o.op)).toEqual(["add_note"]);
  });

  it("reads a plan number with its date or author, and leaves other sentences about it to the model", () => {
    expect(fields(local("plan number 1234 dated 12.11.2026").ops)).toEqual([
      ["planNumber", "1234"],
      ["planDate", "2026-11-12"],
    ]);
    expect(fields(local("previous plan number 567 by K Silva").ops)).toEqual([
      ["previousPlanNumber", "567"],
      ["previousPlanBy", "K Silva"],
    ]);
    expect(readCommand("Plan No. 1234 is my own")).toBeNull();
    expect(fields(local("plan no 1234").ops)).toEqual([["planNumber", "1234"]]);
  });
});

describe("lots, notes and divisions", () => {
  it("keeps a note on its lot, however it's said", () => {
    for (const [words, note] of [
      ["add a note on lot B1 saying garden", "garden"],
      ["add a note to lot B1 garden", "garden"],
      ["add a note to lot B1 that the well is shared", "the well is shared"],
      ["add the note to lot B1 saying garden", "garden"],
      ["add a note for lot B1 saying garden", "garden"],
    ])
      expect(local(words!).ops[0], words).toMatchObject({ kind: "lot_edit", id: "lot-b1", note });
    expect(local("put a note on lot B2 well").ops[0]).toMatchObject({ kind: "lot_edit", id: "lot-b2", note: "well" });
    // A name said in words with the note straight after can't be parted by rule: the model reads it, never a plan note.
    expect(readCommand("add a note on lot B one garden")).toBeNull();
  });

  it("divides a lot 'changed into two lots', and still renames one 'to 2'", () => {
    expect(local("change lot B1 into two lots").ops[0]).toMatchObject({ kind: "divide", lotId: "lot-b1", count: 2 });
    expect(local("change lot B1 into two").ops[0]).toMatchObject({ kind: "divide", lotId: "lot-b1", count: 2 });
    expect(local("change lot B1 to 2 lots").ops[0]).toMatchObject({ kind: "divide", lotId: "lot-b1", count: 2 });
    expect(ops("rename lot B1 to 2")?.[0]).toMatchObject({ op: "edit_lot", change: "label" });
  });

  it("never names lot A from an article, or a lot written like a paper size from the paper", () => {
    const sel = [`pt:${id(4)}`, `pt:${id(5)}`, `pt:${id(8)}`];
    const garden = turn("make a lot from these points as a garden", [{ op: "add_lot", label: "a", corners: { from: "selection", quote: "" }, note: "", quote: "make a lot from these points as a garden" }], { selection: sel });
    expect(garden.ops.some((o) => o.kind === "lot_add")).toBe(false);
    const joined = turn("join these points to a new lot", [{ op: "add_lot", label: "a", corners: { from: "selection", quote: "" }, note: "", quote: "join these points to a new lot" }], { selection: sel });
    expect(joined.ops.some((o) => o.kind === "lot_add")).toBe(false);
    expect(local("rename lot B1 to C").ops[0]).toMatchObject({ kind: "lot_edit", id: "lot-b1", label: "C" });

    const base = sampleDocument();
    const doc = { ...base, lots: [...base.lots, { ...base.lots[0]!, id: "lot-a3", label: "A", sup: "3" }] };
    const paper = turn("print on A3 and remove the last lot", [{ op: "remove", target: "lot A3", quote: "remove the last lot" }], { doc });
    expect(paper.ops.some((o) => o.kind === "remove")).toBe(false);
    expect(turn("remove lot A3", [{ op: "remove", target: "lot A3", quote: "remove lot A3" }], { doc }).ops[0]).toMatchObject({ kind: "remove", id: "lot-a3" });
  });

  it("reads 'half acre lots' as a size, never as two halves", () => {
    const half = turn("divide lot B1 into half acre lots", [{ op: "divide", lot: "lot B1", by: "area", count: "half", values: "", unit: "", lines: "", side: "", quote: "divide lot B1 into half acre lots" }]);
    expect(half.ops.some((o) => o.kind === "divide")).toBe(false);
    expect(half.question?.text).toMatch(/how many/i);
    expect(local("split lot B1 in half").ops[0]).toMatchObject({ kind: "divide", count: 2 });
  });
});

describe("refusals, legs, layers and lines", () => {
  it("refuses only a surveyed point's own change", () => {
    for (const words of ["remove point 8 from lot B1", "remove the point numbers", "delete the point numbers", "move the point numbers to the left", "change the points layer", "change point names"])
      expect(ops(words)?.some((o) => o.op === "cannot"), words).not.toBe(true);
    for (const words of ["delete point 12", "move point 5 2 metres north", "change the coordinates of point 5", "remove points 3 and 4"])
      expect(ops(words), words).toEqual([{ op: "cannot", reason: "points" }]);
  });

  it("takes a leg said with 'points' or 'point … and point …', and never place names as a leg", () => {
    const leg = { kind: "adjoining_add", adjoining: { text: "Lot 4 in Plan 1234", lot: "lot-b1", from: id(3), to: id(8) } };
    const a = local("the land on the north of lot B1 is Lot 4 in Plan 1234 between points 3 and 8");
    expect(a.dropped).toEqual([]);
    expect(a.ops[0]).toMatchObject(leg);
    expect(local("the land on the north of lot B1 is Lot 4 in Plan 1234 between point 3 and point 8").ops[0]).toMatchObject(leg);
    const road = local("the land on the north of lot B1 is the road between Kandy and Galle");
    expect(road.dropped).toEqual([]);
    expect(road.question?.choices).toEqual(["between 3 and 8", "between 8 and 7"]);
  });

  it("answers 'show lot areas', and leaves other 'show lot …' words to the model", () => {
    expect(ops("show lot areas")).toEqual([{ op: "answer", topic: "lot_area", target: "" }]);
    expect(ops("show lot extents")).toEqual([{ op: "answer", topic: "lot_area", target: "" }]);
    for (const words of ["show lot boundaries", "show lot corners"]) expect(readCommand(words), words).toBeNull();
    expect(ops("show lot B1")?.[0]).toMatchObject({ op: "view", action: "focus" });
  });

  it("never guesses a line's layer, and 'show the wall' isn't a new wall", () => {
    expect(readCommand("draw a line between 3 and 8")).toBeNull();
    expect(readCommand("show the wall between 3 and 4")).toBeNull();
    expect(local("draw a wall between 3 and 4").ops[0]).toMatchObject({ kind: "feature_add" });
  });

  it("reads several layers with commas or none", () => {
    for (const words of ["hide the walls, fences and drains", "hide walls fences and drains", "hide the walls, the fences and the drains"])
      expect(ops(words)?.map((o) => (o as { layer?: string }).layer), words).toEqual(["WALLS", "FENCES", "DRAINS"]);
    expect(readCommand("hide the walls and the grid")).toBeNull();
  });

  it("keeps the scale said with the paper", () => {
    const a3 = local("A3 landscape at one to five hundred").ops;
    expect(a3.map((o) => o.kind)).toEqual(["sheet", "sheet", "number"]);
    expect(a3[2]).toMatchObject({ setting: "scale", value: 500 });
    expect(local("A3 at 1:1,000").ops[1]).toMatchObject({ setting: "scale", value: 1000 });
    expect(local("A3 at scale 1 to 1000").ops[1]).toMatchObject({ setting: "scale", value: 1000 });
  });
});

describe("the field book, the answers and the cards", () => {
  it("reads a leg whose 'from' is followed by a comma", () => {
    const r = readLegs("from 101, to 102 bearing 45 30 15 distance 25.40");
    expect(r.problems).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ from: "101", to: "102" });
  });

  it("counts every blocking check when it says how many things are needed", () => {
    const doc = sampleDocument();
    const findings = Array.from({ length: 9 }, (_, i) => ({ code: `x${i}`, severity: "error", message: `Check ${i}`, target: { kind: "project" }, blocks: ["approval"] })) as never;
    const a = answer({ kind: "answer", topic: "missing", lotId: null, quote: "" }, { doc, points: SAMPLE_POINTS, findings, scale: 500, suggestedScale: 500 } as never);
    // Six checks are listed and three more are on the Check step: all of them are counted aloud.
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen"];
    expect(a.note).toContain("And 3 more checks");
    expect(a.speak.toLowerCase()).toBe(`${words[a.rows.length + 3]} things are still needed; they're on the screen.`);
  });

  it("warns when two new lots in one turn overlap each other", () => {
    const doc = { ...sampleDocument(), lots: [] };
    const turned = local("make lot D from points 1 2 3 8, lot E from points 1 2 3 8", { doc });
    expect(turned.ops.filter((o) => o.kind === "lot_add")).toHaveLength(2);
    const described = describeTurn(turned.ops, { doc, points: SAMPLE_POINTS });
    expect(described[0]!.warnings).toEqual(["It overlaps lot E. Check the corners before applying."]);
    expect(described[1]!.warnings).toEqual(["It overlaps lot D. Check the corners before applying."]);
  });
});

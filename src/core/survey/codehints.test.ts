/** Suggestions for codes the library doesn't know (stage 238). Points are SYNTHETIC. */
import { describe, expect, it } from "vitest";
import { adoptCode, codeHints, oneApart, unknownCodes } from "./codehints";
import { commonCodes, dsrCodes } from "./codes";
import type { SurveyPoint } from "./parcel";

const lib = commonCodes();
const at = (pointId: string, code: string): SurveyPoint => ({ id: `id-${pointId}`, pointId, e: 450_000 + Number(pointId), n: 700_000, z: null, code });

describe("codes the library doesn't know", () => {
  it("lists each with how many points carry it, most used first, and leaves known codes out", () => {
    const points = [at("1", "St"), at("2", "TREE"), at("3", "TREE / mango"), at("4", "st"), at("5", "Wel")];
    expect(unknownCodes(points, lib)).toEqual([
      { code: "TREE", count: 2 },
      { code: "Wel", count: 1 },
    ]);
  });

  it("offers numbered strings of one code once, as that code, and leaves road edges out", () => {
    const points = [at("1", "TREE1"), at("2", "TREE2"), at("3", "TREE2"), at("4", "RD1"), at("5", "RD2"), at("6", "RDL")];
    expect(unknownCodes(points, lib)).toEqual([{ code: "TREE", count: 3 }]);
  });

  // After the stage 238 review.
  it("never offers a road edge's letters, which would capture the road: RD3 stays RD3, and a bare RD can't be added", () => {
    const points = [at("1", "RD1"), at("2", "RD1"), at("3", "RD2"), at("4", "RD2"), at("5", "RD3"), at("6", "RD"), at("7", "ROAD3")];
    expect(unknownCodes(points, lib)).toEqual([
      { code: "RD", count: 1, not: "road" },
      { code: "RD3", count: 1 },
      { code: "ROAD3", count: 1 },
    ]);
  });

  it("marks a line word written with no code before it, which adding would make a code under Carlson", async () => {
    const { GRAMMAR } = await import("./grammar");
    const points = [at("1", "MW1"), at("2", "MW1 END"), at("3", "END"), at("4", "PC")];
    expect(unknownCodes(points, lib, GRAMMAR.carlson)).toEqual([
      { code: "END", count: 1, not: "word" },
      { code: "PC", count: 1, not: "word" },
    ]);
  });
});

describe("what an unknown code might be", () => {
  it("offers the same code from the Survey Department's list first", () => {
    expect(codeHints("WoP", lib).map((h) => [h.entry.code, h.entry.meaning, h.why])).toEqual([
      ["WoP", "Wooden Fence Post", "in the Survey Department's list"],
      ["CoP", "Concrete Fence Post", "one letter from CoP"],
    ]);
  });

  it("offers both meanings when the two lists disagree, so the surveyor chooses", () => {
    const withoutMw = lib.filter((e) => e.code !== "MW");
    expect(codeHints("MW", withoutMw).map((h) => [h.entry.meaning, h.why])).toEqual([
      ["Mark on Wall", "in the Survey Department's list"],
      ["Masonry Wall", "in the common list"],
    ]);
  });

  it("offers library codes whose meaning holds the word, the project's own first, three at most", () => {
    expect(codeHints("WALL", lib).map((h) => [h.entry.code, h.entry.meaning, h.why])).toEqual([
      ["MW", "Masonry Wall", 'its meaning has "WALL" in it'],
      ["RW", "Retaining Wall", 'its meaning has "WALL" in it'],
      ["MW", "Mark on Wall", 'its meaning has "WALL" in it'],
    ]);
    expect(codeHints("TREE", lib).map((h) => [h.entry.code, h.entry.meaning])).toEqual([["Tr", "Tree"]]);
  });

  it("never offers two suggestions that add the same entry, and names the thing before what only mentions it", () => {
    const drain = codeHints("DRAIN", lib).map((h) => h.entry.meaning);
    expect(new Set(drain).size).toBe(drain.length);
    expect(drain).toEqual(["Earth Drain", "Masonry Drain"]);
    expect(codeHints("FENCE", dsrCodes()).map((h) => h.entry.meaning)).toEqual(["Live Fence", "Wire Fence", "Wire Live Fence"]);
  });

  it("offers a code one letter away, only for codes of three letters or more", () => {
    expect(codeHints("Wel", lib).map((h) => [h.entry.code, h.why])).toEqual([["Well", "one letter from Well"]]);
    // Two-letter codes differ by one letter all the time (CP and EP): no guess.
    expect(codeHints("CQ", lib)).toEqual([]);
  });

  it("offers nothing for a known code, a blank, or one too long for the library", () => {
    expect(codeHints("WELL", lib)).toEqual([]);
    expect(codeHints("  ", lib)).toEqual([]);
    expect(codeHints("ABCDEFGHIJKLM", lib)).toEqual([]);
    expect(codeHints("Q7Z", dsrCodes())).toEqual([]);
  });

  it("counts one letter added, dropped, changed or two swapped as one apart, ignoring case", () => {
    expect([oneApart("Wel", "Well"), oneApart("Wlel", "Well"), oneApart("Wall", "Well"), oneApart("WELLS", "well")]).toEqual([true, true, true, true]);
    expect([oneApart("Well", "well"), oneApart("Walls", "Well"), oneApart("Wl", "Well")]).toEqual([false, false, false]);
  });
});

describe("adding an unknown code to the library", () => {
  it("copies the suggestion's meaning and drawing under the code as the points carry it", () => {
    const [hint] = codeHints("WALL", lib);
    expect(adoptCode("WALL", hint!)).toEqual({ code: "WALL", meaning: "Masonry Wall", kind: "line", line: "solid", legend: true });
  });

  it("adds a blank to fill in when there's no suggestion", () => {
    expect(adoptCode("Q7Z", null)).toEqual({ code: "Q7Z", meaning: "Describe it", kind: "mark", line: "solid", legend: true });
  });
});

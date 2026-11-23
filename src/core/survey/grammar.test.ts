/**
 * Field code grammars and the code report (stage 234, ADR 0243). Points are SYNTHETIC; each case follows the convention as its
 * vendor's published help describes it (Carlson's BEG, END, CLO, JPN, PC and PT), and Farbaek's own reading is unchanged.
 */
import { describe, expect, it } from "vitest";
import { commonCodes, type CodeEntry } from "./codes";
import { crsById } from "./crs";
import { emptyDocument } from "./document";
import { codeReport, suggestFeatures, type CodeProblem } from "./fieldToFinish";
import { SAMPLE_POINTS, sampleDocument } from "./fixtures";
import { GRAMMAR, controlOf, grammarForLibrary } from "./grammar";
import { computeLots } from "./lots";
import type { SurveyPoint } from "./parcel";
import { checkSurvey } from "./qc";
import { approvalHash } from "./view";

const pt = (n: number, code: string): SurveyPoint => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, pointId: String(n), e: 1000 + n, n: 2000 + (n % 3), z: null, code });
const lines = (points: SurveyPoint[], g = GRAMMAR.carlson, codes: CodeEntry[] = commonCodes(), problems: CodeProblem[] = []) =>
  suggestFeatures(points, codes, g, problems).map((f) => `${f.code}${f.closed ? " closed" : ""}: ${f.pointNumbers.join(" ")}`);

describe("field code grammars", () => {
  it("reads Carlson's words, ignoring case, and nothing else", () => {
    expect(["BEG", "end", "Clo", "JPN", "PC", "PT", "ST", "EL"].map((w) => controlOf(GRAMMAR.carlson, w))).toEqual(["begin", "end", "close", "join", "arcStart", "arcEnd", null, null]);
    expect(["BEG", "END", "CLO", "JPN"].map((w) => controlOf(GRAMMAR.farbaek, w))).toEqual([null, "end", "close", null]);
  });

  it("runs a Carlson line through other codes until END, where Farbaek's stops at the first other code", () => {
    const pts = [pt(1, "MW BEG"), pt(2, "TREE"), pt(3, "MW"), pt(4, "CP"), pt(5, "MW END"), pt(6, "MW")];
    expect(lines(pts)).toEqual(["MW: 1 3 5"]);
    // Farbaek's: BEG is a description, and the line breaks at each other code; one-point lines aren't drawn.
    expect(lines(pts, GRAMMAR.farbaek)).toEqual([]);
  });

  it("starts a fresh line at BEG, closes at CLO, and keeps numbered strings apart", () => {
    expect(lines([pt(1, "MW"), pt(2, "MW"), pt(3, "MW BEG"), pt(4, "MW")])).toEqual(["MW: 1 2", "MW: 3 4"]);
    expect(lines([pt(1, "NF BEG"), pt(2, "NF"), pt(3, "NF"), pt(4, "NF CLO")])).toEqual(["NF closed: 1 2 3 4"]);
    expect(lines([pt(1, "MW1 BEG"), pt(2, "MW2 BEG"), pt(3, "MW1"), pt(4, "MW2 END"), pt(5, "MW1 END")])).toEqual(["MW: 2 4", "MW: 1 3 5"]);
  });

  it("joins a point to another with JPN, and says when that point isn't in the survey", () => {
    const problems: CodeProblem[] = [];
    expect(lines([pt(1, "MW BEG"), pt(2, "MW"), pt(3, "MW JPN 1"), pt(4, "MW JPN 99 END")], GRAMMAR.carlson, commonCodes(), problems)).toEqual(["MW: 3 1", "MW: 1 2 3 4"]);
    expect(problems.map((p) => p.message)).toEqual(["Point 4 joins to point 99, which isn't in the survey, so that segment isn't drawn."]);
  });

  it("reads PC and PT, draws the arc as straight segments, and says so", () => {
    const problems: CodeProblem[] = [];
    expect(lines([pt(1, "MW BEG"), pt(2, "MW PC"), pt(3, "MW"), pt(4, "MW PT END")], GRAMMAR.carlson, commonCodes(), problems)).toEqual(["MW: 1 2 3 4"]);
    expect(problems.map((p) => p.message)).toEqual(["The arc from point 2 to point 4 is drawn as straight segments between its surveyed points: curves aren't drawn yet."]);
  });

  it("keeps a library code a code where the grammar would read it as a word, and never reads a stake as a begin", () => {
    // An office whose library has PC (a power cable line): PC stays that code under Carlson's words.
    const codes = [...commonCodes(), { code: "PC", meaning: "Power Cable", kind: "line" as const, line: "dashed" as const, legend: true }];
    expect(lines([pt(1, "PC"), pt(2, "PC"), pt(3, "PC END")], GRAMMAR.carlson, codes)).toEqual(["PC: 1 2 3"]);
    // "MW ST" is a wall at a stake under every grammar: ST is SurvPC's begin, which isn't taken.
    expect(lines([pt(1, "MW"), pt(2, "MW ST"), pt(3, "MW END")])).toEqual(["MW: 1 2 3"]);
  });

  it("reads Farbaek's grammar exactly as before: consecutive points, END and CLO", () => {
    expect(lines([pt(1, "MW"), pt(2, "MW"), pt(3, "CP"), pt(4, "MW"), pt(5, "MW END"), pt(6, "MW")], GRAMMAR.farbaek)).toEqual(["MW: 1 2", "MW: 4 5"]);
    expect(lines([pt(1, "NF"), pt(2, "NF"), pt(3, "NF CLO")], GRAMMAR.farbaek)).toEqual(["NF closed: 1 2 3"]);
  });

  it("takes Carlson's words from a Carlson code library, and nothing from any other", () => {
    expect([grammarForLibrary("office.fcl"), grammarForLibrary("OFFICE.FCL "), grammarForLibrary("office.csv")]).toEqual(["carlson", "carlson", null]);
  });
});

describe("what reading says, after the stage 234 review", () => {
  const said = (points: SurveyPoint[], g = GRAMMAR.carlson) => {
    const problems: CodeProblem[] = [];
    const drawn = suggestFeatures(points, commonCodes(), g, problems).map((f) => `${f.code}${f.closed ? " closed" : ""}: ${f.pointNumbers.join(" ")}`);
    return { drawn, said: problems.map((p) => p.message) };
  };

  it("doesn't call a point that only joins to another a line of one point", () => {
    expect(said([pt(1, "CP"), pt(2, "MW JPN 1 END")])).toEqual({ drawn: ["MW: 2 1"], said: [] });
  });

  it("ends an arc with its line, and says an arc that a second one replaced", () => {
    expect(said([pt(1, "MW BEG"), pt(2, "MW PC"), pt(3, "MW END"), pt(4, "MW BEG"), pt(5, "MW PT"), pt(6, "MW END")]).said).toEqual([
      "The arc that begins at point 2 has no end before its line ends, so it's drawn as straight segments.",
      "Point 5 ends an arc that no point began, so nothing is drawn as an arc.",
    ]);
    expect(said([pt(1, "MW BEG"), pt(2, "MW PC"), pt(3, "MW PC"), pt(4, "MW PT END")]).said).toEqual([
      "The arc that begins at point 2 has no end before point 3 begins another, so it's drawn as straight segments.",
      "The arc from point 3 to point 4 is drawn as straight segments between its surveyed points: curves aren't drawn yet.",
    ]);
  });

  it("says a join with nothing to draw with, a join with no point, and a point joined to itself", () => {
    expect(said([pt(1, "MW BEG"), pt(2, "CP JPN 1"), pt(3, "MW JPN"), pt(4, "MW JPN 4 END")]).said).toEqual([
      "Point 2 joins to point 1 but carries no line code to draw it with, so nothing is joined.",
      "Point 3 has JPN with no point number after it, so nothing is joined.",
      "Point 4 joins to itself, so nothing is joined.",
    ]);
  });

  it("keeps Farbaek's reading exactly: the last of END and CLO counts, and END is always its word", () => {
    expect(said([pt(1, "NF"), pt(2, "NF"), pt(3, "NF CLO END")], GRAMMAR.farbaek).drawn).toEqual(["NF: 1 2 3"]);
    expect(said([pt(1, "NF"), pt(2, "NF"), pt(3, "NF END CLO")], GRAMMAR.farbaek).drawn).toEqual(["NF closed: 1 2 3"]);
    const withEnd = [...commonCodes(), { code: "END", meaning: "Endpoint", kind: "mark" as const, line: "solid" as const, legend: true }];
    expect(suggestFeatures([pt(1, "MW"), pt(2, "MW END"), pt(3, "MW")], withEnd, GRAMMAR.farbaek).map((f) => f.pointNumbers.join(" "))).toEqual(["1 2"]);
  });

  it("says a line code a description hid, and reads no arc word in a lower-case description", () => {
    expect(said([pt(1, "MW BEG"), pt(2, "CP MW gate"), pt(3, "MW END")]).said).toEqual([
      `Point 2's code "CP MW gate" reads as CP with a description, so MW in it isn't taken as a line. Write the codes on their own, with any description after a slash.`,
    ]);
    expect(said([pt(1, "MW BEG"), pt(2, "MW gate pt 23"), pt(3, "MW END")]).said).toEqual([]);
  });
});

describe("the code report", () => {
  it("knows a library code with a number in it, counts a code once a point, and lists a corner code only once", () => {
    const codes = [...commonCodes(), { code: "BM1", meaning: "Bench Mark 1", kind: "mark" as const, line: "solid" as const, legend: true }];
    const r = codeReport([pt(1, "BM1"), pt(2, "BM1"), pt(3, "MW1 MW2"), pt(4, "MW1 MW2 END")], codes, GRAMMAR.farbaek);
    expect(r.counts.find((c) => c.code === "BM1")).toEqual({ code: "BM1", count: 2, kind: "mark", meaning: "Bench Mark 1" });
    expect(r.counts.find((c) => c.code === "MW")?.count).toBe(2);
    expect(r.counts.some((c) => c.kind === null)).toBe(false);
    // A corner coded XY1: listed by the corner finding, and not again by the code report.
    const doc = sampleDocument();
    const points = SAMPLE_POINTS.map((p) => (p.pointId === "2" ? { ...p, code: "XY1" } : p));
    const findings = checkSurvey({ points, crs: crsById("EPSG:5235"), crsConfirmed: true, document: doc, lots: computeLots(points, doc.lots), surveyorProfile: true });
    expect(findings.find((f) => f.code === "MARK_CODE_NOT_IN_LEGEND")?.message).toBe("Corner codes not in the code library: XY1.");
    expect(findings.find((f) => f.code === "CODES_NOT_IN_LIBRARY")).toBeUndefined();
  });

  it("counts every code, says which the library doesn't know, and what reading the lines found", () => {
    const r = codeReport([pt(1, "MW BEG"), pt(2, "TREE"), pt(3, "MW"), pt(4, "TREE / mango"), pt(5, "MW END"), pt(6, "NF")], commonCodes(), GRAMMAR.carlson);
    expect(r.counts).toEqual([
      { code: "MW", count: 3, kind: "line", meaning: "Masonry Wall" },
      { code: "TREE", count: 2, kind: null, meaning: null },
      { code: "NF", count: 1, kind: "line", meaning: "Net Fence" },
    ]);
    expect(r.lines).toBe(1);
    expect(r.problems.map((p) => p.message)).toEqual(["The net fence line at point 6 has only that point, so it isn't drawn."]);
  });

  it("puts unknown codes and line findings in the plan's checks, for information, without repeating corner codes", () => {
    const doc = sampleDocument();
    const points = [...SAMPLE_POINTS, pt(90, "TREE"), pt(91, "TREE"), pt(92, "MW")];
    const findings = checkSurvey({ points, crs: crsById("EPSG:5235"), crsConfirmed: true, document: doc, lots: computeLots(points, doc.lots), surveyorProfile: true });
    const codes = findings.find((f) => f.code === "CODES_NOT_IN_LIBRARY");
    expect(codes).toMatchObject({ severity: "information", blocks: [], target: { kind: "field", id: "codes" } });
    expect(codes!.message).toBe("A code the points carry isn't in the code library, so the plan can't say what it is or draw it as a line or symbol: TREE (2 points).");
    expect(findings.find((f) => f.code === "CODE_LINES_TO_CHECK")).toMatchObject({ severity: "information", message: "Reading the line words with Farbaek (END, CLO) found one thing to check." });
  });

  it("keeps the approval of a plan read with Farbaek's words, and covers another grammar once chosen", async () => {
    const doc = emptyDocument();
    const before = await approvalHash({ document: doc, crsId: "EPSG:5235", points: [] });
    expect(await approvalHash({ document: { ...doc, grammar: "farbaek" }, crsId: "EPSG:5235", points: [] })).toBe(before);
    expect(await approvalHash({ document: { ...doc, grammar: "carlson" }, crsId: "EPSG:5235", points: [] })).not.toBe(before);
  });
});

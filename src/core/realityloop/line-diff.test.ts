import { describe, expect, it } from "vitest";
import { diffLines, splitLines, type Hunk } from "./line-diff";

const L = (...lines: string[]) => `${lines.join("\n")}\n`;

/** Applies hunks to the old text, to check they really describe the change. */
function apply(before: string, hunks: Hunk[]): string {
  const lines = splitLines(before);
  // From the bottom, so earlier line numbers stay valid.
  for (const h of [...hunks].reverse()) lines.splice(h.oldStart - 1, h.oldLines, ...h.added);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

describe("diffLines", () => {
  it("finds nothing in identical files", () => {
    expect(diffLines(L("a", "b"), L("a", "b"))).toEqual([]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("describes a one-line edit by its place in both files", () => {
    expect(diffLines(L("a", "b", "c"), L("a", "B", "c"))).toEqual([{ oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, removed: ["b"], added: ["B"] }]);
  });

  it("handles inserts at the start and end, and a deletion", () => {
    expect(diffLines(L("b", "c"), L("a", "b", "c"))).toEqual([{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, removed: [], added: ["a"] }]);
    expect(diffLines(L("a", "b"), L("a", "b", "c"))).toEqual([{ oldStart: 3, oldLines: 0, newStart: 3, newLines: 1, removed: [], added: ["c"] }]);
    expect(diffLines(L("a", "b", "c"), L("a", "c"))).toEqual([{ oldStart: 2, oldLines: 1, newStart: 2, newLines: 0, removed: ["b"], added: [] }]);
  });

  it("keeps separate changes as separate hunks", () => {
    const before = L("one", "two", "three", "four", "five", "six");
    const after = L("one", "TWO", "three", "four", "FIVE", "six", "seven");
    const hunks = diffLines(before, after);
    expect(hunks.map((h) => [h.newStart, h.removed, h.added])).toEqual([
      [2, ["two"], ["TWO"]],
      [5, ["five"], ["FIVE"]],
      [7, [], ["seven"]],
    ]);
    expect(apply(before, hunks)).toBe(after);
  });

  it("describes a new file as one hunk of every line", () => {
    expect(diffLines("", L("x", "y"))).toEqual([{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 2, removed: [], added: ["x", "y"] }]);
  });

  it("always describes the real change, on scrambled inputs", () => {
    const words = ["alpha", "beta", "gamma", "delta", "epsilon"];
    let seed = 7;
    const rand = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    for (let round = 0; round < 50; round += 1) {
      const make = () => L(...Array.from({ length: Math.floor(rand() * 12) + 1 }, () => words[Math.floor(rand() * words.length)]!));
      const before = make();
      const after = make();
      expect(apply(before, diffLines(before, after))).toBe(after);
    }
  });

  it("falls back to one hunk past its limits", () => {
    const before = L(...Array.from({ length: 30 }, (_, i) => `line ${i}`));
    const after = L(...Array.from({ length: 30 }, (_, i) => `changed ${i}`));
    expect(diffLines(before, after, { maxLines: 10, maxEdits: 2_000 })).toHaveLength(1);
    expect(diffLines(before, after, { maxLines: 5_000, maxEdits: 5 })).toHaveLength(1);
    expect(apply(before, diffLines(before, after, { maxLines: 10, maxEdits: 2_000 }))).toBe(after);
  });
});

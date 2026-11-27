import { describe, expect, it } from "vitest";
import { checksLine, researchLine, sitesLine } from "@/core/research/library";
import { sampleResearch } from "./research-samples";

describe("the demo's sample research (stage 288)", () => {
  it("has a row to show, so the demo never says there is no research yet", () => {
    const items = sampleResearch();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.title.startsWith("Sample")).toBe(true);
      expect(researchLine(item).length).toBeGreaterThan(0);
      expect(sitesLine(item)).toMatch(/^From /);
    }
  });

  it("says of the sample what Chat says of it: the pages it cites, not every page it found", () => {
    const [item] = sampleResearch();
    // The sample cites three of the four pages it kept; the fourth is one that was found and not used.
    expect(item).toMatchObject({ pages: 4, cited: 3 });
    expect(researchLine(item!)).toBe("A search: 3 sources cited, of 4 pages checked.");
    expect(sitesLine(item!)).toBe("From example.org, example.com and example.net.");
    expect(checksLine(item!.checks)).toBe("The names and numbers cited were found on 2 of 3 cited pages.");
  });
});

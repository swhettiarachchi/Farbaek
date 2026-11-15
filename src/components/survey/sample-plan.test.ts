import { describe, expect, it } from "vitest";
import { SAMPLE_AREA_M2 } from "@/core/survey/fixtures";
import { samplePlan } from "./sample-plan";

describe("the Sample plan shown on the home page and /survey", () => {
  const plan = samplePlan();

  it("frames the extent block, not the whole sheet", () => {
    const [x, y, w, h] = plan.detail;
    expect(w).toBeLessThan(plan.page.widthMm / 4);
    expect(w / h).toBeCloseTo(4 / 3, 2);
    const inside = plan.page.items.filter((i) => i.kind === "text" && i.x >= x && i.x <= x + w && i.y >= y && i.y <= y + h).map((i) => (i.kind === "text" ? i.text : ""));
    expect(inside).toContain("Extent");
    expect(inside).toContain("Boundaries");
    expect(inside).not.toContain("References");
    // The close-up carries only what its window shows.
    const texts = plan.detailPage.items.filter((i) => i.kind === "text");
    expect(texts.length).toBeLessThan(plan.page.items.filter((i) => i.kind === "text").length / 3);
    expect(texts.every((t) => t.kind === "text" && t.x >= x && t.x <= x + w)).toBe(true);
  });

  it("shows the engine's own figures for the synthetic points", () => {
    expect(plan.legs).toHaveLength(5);
    expect(plan.legs[0]).toEqual({ from: "1", to: "2", bearing: "083°21′41″", distance: "31.78" });
    expect(plan.area?.m2).toBe("1,311.12");
    expect(plan.area?.arp).toBe("0A 1R 11.84P");
    expect(SAMPLE_AREA_M2).toBeCloseTo(1311.118096, 6);
  });
});

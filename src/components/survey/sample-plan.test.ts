import { describe, expect, it } from "vitest";
import { SAMPLE_AREA_M2 } from "@/core/survey/fixtures";
import { samplePlan } from "./sample-plan";

describe("the Sample plan shown on the home page and /survey", () => {
  const plan = samplePlan();

  it("frames a close-up of the lots and road, not the whole sheet", () => {
    const [x, y, w, h] = plan.detail;
    expect(w).toBeLessThan(plan.page.widthMm * 0.8);
    expect(w / h).toBeCloseTo(4 / 3, 2);
    const inside = plan.detailPage.items.filter((i) => i.kind === "text").map((i) => (i.kind === "text" ? i.text : ""));
    expect(inside).toEqual(expect.arrayContaining(["B", "1", "2", "3", "Sample Road"]));
    // The close-up carries only what its window shows.
    expect(plan.detailPage.items.length).toBeLessThan(plan.page.items.length);
    for (const t of plan.detailPage.items) if (t.kind === "text") expect(t.x >= x && t.x <= x + w && t.y >= y && t.y <= y + h).toBe(true);
  });

  it("shows the engine's own figures for the synthetic points", () => {
    expect(plan.paper).toBe("A4");
    expect(plan.scale).toBe(500);
    expect(plan.lots.map((l) => l.name)).toEqual(["B1", "B2", "B3"]);
    expect(plan.lots[0]!.legs).toHaveLength(5);
    expect(plan.lots[0]!.legs[0]).toMatchObject({ from: "1", to: "2" });
    expect(plan.total).toEqual({ m2: "2,267.41", ha: "0.22674", arp: "0 A. 2 R. 09.65 P." });
    expect(SAMPLE_AREA_M2).toBeCloseTo(2267.41, 6);
  });
});

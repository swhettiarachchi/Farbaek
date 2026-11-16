/** Comparing two plan versions in words. SYNTHETIC data only. */
import { describe, expect, it } from "vitest";
import { compareDocuments } from "./compare";
import { sampleDocument, SAMPLE_POINTS } from "./fixtures";

const id = (n: number) => SAMPLE_POINTS.find((p) => p.pointId === String(n))!.id;

describe("comparing two versions", () => {
  it("says nothing changed when nothing did", () => {
    expect(compareDocuments(sampleDocument(), sampleDocument(), SAMPLE_POINTS)).toEqual([]);
  });

  it("names lots, roads, adjoining lands, title fields and settings that changed", () => {
    const before = sampleDocument();
    const after = sampleDocument();
    after.lots[1]!.points = [id(7), id(8), id(5), id(6)].reverse();
    after.lots = after.lots.filter((l) => l.sup !== "3");
    after.lots.push({ id: "lot-c", label: "C", sup: "", points: [id(8), id(3), id(4), id(5)], note: "Res. for Access" });
    after.roads[0]!.name = "Sample Lane";
    after.adjoining = after.adjoining.filter((a) => a.id !== "adj-north");
    after.adjoining[0]!.from = id(8);
    after.adjoining[0]!.to = id(7);
    after.sheet.landName = "Sample Estate";
    after.sheet.boundaries.north = "";
    after.sheet.previousPlan.number = "SAMPLE-9";
    after.settings.scale = 1000;
    after.settings.slant = false;
    after.notes = ["Sample note"];
    after.provenance["sheet.landName"] = { source: "ai_brief", reviewed: false };
    const texts = compareDocuments(before, after, SAMPLE_POINTS).map((c) => `${c.area}: ${c.text}`);
    expect(texts).toEqual([
      "Lots: Lot B2's corners changed from 7 8 5 6 to 6 5 8 7.",
      "Lots: Lot C added, corners 8 3 4 5.",
      "Lots: Lot B3 removed.",
      "Roads: Sample Road is now called Sample Lane.",
      "Adjoining lands: Land claimed by the sample owner moved to lot B2 between 8 and 7.",
      "Adjoining lands: Lot 2 in Plan No. SAMPLE-0 is left beside a lot that's no longer on the plan.",
      "Adjoining lands: Land of the sample neighbour removed.",
      "Title: Land called changed from Sample Watta to Sample Estate.",
      "Title: Earlier plan number changed from SAMPLE-0 to SAMPLE-9.",
      "Title: North by cleared (was Land of the sample neighbour).",
      "Sheet: Scale changed from automatic to 1:1000.",
      "Sheet: Slanted lettering changed from on to off.",
      "Notes: Added: Sample note",
      "Notes: Removed: Sample data made up for Farbaek: not a real survey.",
      "Checks: 1 item was filled in by the AI, waiting to be checked.",
    ]);
  });

  it("counts lines by code and AI items the surveyor checked", () => {
    const before = sampleDocument();
    before.provenance["lot:lot-b1"] = { source: "ai_brief", reviewed: false };
    const after = sampleDocument();
    after.provenance["lot:lot-b1"] = { source: "ai_brief", reviewed: true };
    after.features.push({ id: "f3", layer: "WALLS", code: "MW", closed: false, points: [id(5), id(6)] });
    after.features[0]!.points = [id(13), id(14), id(15)];
    after.labelOffsets["lot:lot-b1"] = { dx: 2, dy: 1 };
    expect(compareDocuments(before, after, SAMPLE_POINTS).map((c) => c.text)).toEqual(["MW: 1 before, 2 now.", "1 line runs through different points.", "1 label was moved on paper.", "1 item filled in by the AI was checked."]);
  });

  it("tells two labels with the same words apart, and says when an item needs checking again", () => {
    const before = sampleDocument();
    before.adjoining.push({ id: "adj-road-2", text: "Road", lot: "lot-b1", from: id(1), to: id(2) }, { id: "adj-road-3", text: "Road", lot: "lot-b3", from: id(3), to: id(4) });
    before.provenance["sheet.landName"] = { source: "ai_brief", reviewed: true };
    const after = structuredClone(before);
    after.adjoining = after.adjoining.filter((a) => a.id !== "adj-road-3");
    after.provenance["sheet.landName"] = { source: "ai_brief", reviewed: false };
    after.provenance["sheet.village"] = { source: "ai_photo", reviewed: true };
    expect(compareDocuments(before, after, SAMPLE_POINTS).map((c) => c.text)).toEqual(["Road removed.", "1 item was filled in by the AI, all checked.", "1 item needs checking again."]);
  });

  it("names what the drafting assistant added, applied after the surveyor saw it", () => {
    const before = sampleDocument();
    const after = structuredClone(before);
    after.notes.push("Boundary walls are the owner's.");
    after.lots.push({ id: "lot-a1", label: "B", sup: "4", points: [id(1), id(2), id(3)], note: "" });
    after.provenance["lot:lot-a1"] = { source: "ai_assist", reviewed: true };
    expect(compareDocuments(before, after, SAMPLE_POINTS).map((c) => c.text)).toContain("1 item was added or changed with the drafting assistant, each applied after you saw it.");
  });
});

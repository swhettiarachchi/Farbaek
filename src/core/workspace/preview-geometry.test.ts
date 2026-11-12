import { describe, expect, it } from "vitest";
import { defaultDevice, frameGeometry } from "./preview-geometry";

describe("a site preview in the space it has", () => {
  it("fills a phone's width for the phone view, so the site sees the real width", () => {
    expect(frameGeometry("phone", 375)).toEqual({ width: 375, scale: 1 });
    expect(frameGeometry("phone", 343)).toEqual({ width: 343, scale: 1 });
  });

  it("shows a phone-sized window on wider screens", () => {
    expect(frameGeometry("phone", 900)).toEqual({ width: 390, scale: 1 });
  });

  it("draws the real desktop layout on a phone, scaled to fit", () => {
    const g = frameGeometry("desktop", 375);
    expect(g.width).toBe(1280);
    expect(g.width * g.scale).toBeCloseTo(375);
  });

  it("fills wide space for the desktop view, with nothing scaled", () => {
    expect(frameGeometry("desktop", 1100)).toEqual({ width: 1100, scale: 1 });
  });

  it("scales a tablet only when it doesn't fit", () => {
    expect(frameGeometry("tablet", 1000)).toEqual({ width: 820, scale: 1 });
    expect(frameGeometry("tablet", 410)).toEqual({ width: 820, scale: 0.5 });
  });

  it("draws nothing until there's space, and starts on the phone view on a phone", () => {
    expect(frameGeometry("desktop", 0)).toEqual({ width: 0, scale: 1 });
    expect(defaultDevice(343)).toBe("phone");
    expect(defaultDevice(800)).toBe("desktop");
    expect(defaultDevice(0)).toBe("desktop");
  });
});

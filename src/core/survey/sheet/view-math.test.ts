import { describe, expect, it } from "vitest";
import type { SheetPage } from "./scene";
import { drawingView, pinchView, scaleIn, sheetPoint, type Box, type View } from "./view-math";

const box: Box = { left: 10, top: 20, width: 300, height: 400 };
const start: View = [0, 0, 297, 420];
const limits = { minWidth: 8, maxWidth: 297 * 1.2 };
const close = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 6));

describe("looking at the sheet (stage 196)", () => {
  it("turns a screen point into sheet millimetres, centred as the SVG draws it", () => {
    const k = scaleIn(start, box);
    // The page is 297 wide in a 300px box: about 1.01px a millimetre, the height deciding the fit.
    expect(k).toBeCloseTo(Math.min(300 / 297, 400 / 420), 9);
    const centre = sheetPoint(start, box, box.left + 150, box.top + 200);
    close(centre, [148.5, 210]);
  });

  it("leaves the view as it was when the fingers haven't moved", () => {
    const fingers = [[60, 200], [200, 260]] as const;
    close(pinchView(start, box, fingers, fingers, limits), start);
  });

  it("moves the view with both fingers when they move together", () => {
    const from = [[60, 200], [200, 260]] as const;
    const to = [[90, 240], [230, 300]] as const;
    const v = pinchView(start, box, from, to, limits);
    const k = scaleIn(start, box);
    close(v, [start[0] - 30 / k, start[1] - 40 / k, start[2], start[3]]);
  });

  it("zooms about the point between the fingers, which stays under them", () => {
    const from = [[110, 200], [190, 200]] as const;
    const to = [[70, 200], [230, 200]] as const;
    const v = pinchView(start, box, from, to, limits);
    // The fingers twice as far apart: half the width, twice the size.
    expect(v[2]).toBeCloseTo(start[2] / 2, 9);
    close(sheetPoint(v, box, 150, 200), sheetPoint(start, box, 150, 200));
  });

  it("keeps the zoom within its limits", () => {
    const from = [[149, 200], [151, 200]] as const;
    const to = [[0, 200], [300, 200]] as const;
    expect(pinchView(start, box, from, to, limits)[2]).toBe(8);
    expect(pinchView(start, box, to, from, limits)[2]).toBeCloseTo(limits.maxWidth, 9);
  });

  it("opens on the drawing, not the frame or the title", () => {
    const page = {
      widthMm: 297,
      heightMm: 420,
      items: [
        { kind: "path", layer: "SHEET", points: [[0, 0], [297, 420]], closed: false, color: "ink", width: 0.5, entity: "frame" },
        { kind: "path", layer: "BOUNDARY", points: [[100, 100], [140, 100], [140, 130], [100, 130]], closed: true, color: "ink", width: 0.5, entity: "lot:a" },
        { kind: "circle", layer: "POINTS", cx: 150, cy: 140, r: 0.5, color: "ink", width: 0.2, entity: "pt:1" },
      ],
    } as unknown as SheetPage;
    const v = drawingView(page);
    // The lot and the point fit inside, and the view is much smaller than the page.
    expect(v[0]).toBeLessThan(100);
    expect(v[1]).toBeLessThan(100);
    expect(v[0] + v[2]).toBeGreaterThan(150);
    expect(v[1] + v[3]).toBeGreaterThan(140);
    expect(v[2]).toBeLessThan(150);
    expect(v[2] / v[3]).toBeCloseTo(297 / 420, 6);
  });

  it("opens on the whole sheet when nothing is drawn", () => {
    expect(drawingView({ widthMm: 297, heightMm: 420, items: [] } as unknown as SheetPage)).toEqual([0, 0, 297, 420]);
  });
});

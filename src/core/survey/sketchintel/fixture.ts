/**
 * A SYNTHETIC job for the Sketch Intelligence Engine's tests: made up, on a local grid, shaped like the jobs it's built for (a walled lot
 * reaching a road by a narrow strip, a well, an inner line, neighbours' walls) and carrying none of any real job's coordinates or names.
 * Laid out across and along the lot, then turned 30° and moved to 5000, 5000.
 */
import type { SurveyPoint } from "../parcel";
import type { SketchDrawing } from "./drawing";

export const synthId = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const T = (30 * Math.PI) / 180;
const at = (pointId: string, x: number, y: number): SurveyPoint => ({
  id: synthId(pointId),
  pointId,
  e: 5000 + x * Math.cos(T) + y * Math.sin(T),
  n: 5000 - x * Math.sin(T) + y * Math.cos(T),
  z: null,
  code: null,
});

/** Across the lot (x) and along it (y), metres. */
export const SYNTH_POINTS: SurveyPoint[] = [
  at("5", 0, 0), // south-west corner
  at("41", 0.01, 6), // west wall
  at("42", 0.15, 12), // west wall, 0.15 m off its line
  at("43", 0.02, 16),
  at("45", -0.03, 9), // on the west wall, not written on the sketch
  at("40", 0, 20), // north-west corner
  at("30", 5.6, 20), // where the north side turns up to the strip
  at("31", 5.6, 23), // the strip's corner by the road
  at("32", 7.5, 23), // the north-east corner
  at("62", 7.48, 15), // east wall
  at("63", 7.47, 11.1), // two points 0.20 m apart on the east wall, turning more than 10° between them but within 0.03 m of its line
  at("65", 7.51, 10.9),
  at("61", 7.52, 8),
  at("60", 7.5, 0), // south-east corner
  at("6", 3.0, 0.03), // on the south wall
  at("70", 1.5, 18), // the well
  at("80", 2, 1), // an inner line
  at("81", 2.5, 5),
  at("82", 5, 10),
  at("90", -6, 24.5), // the road's surveyed edge
  at("91", 0, 24.52),
  at("92", 7, 24.48),
  at("93", 14, 24.5),
  at("44", -4, 20), // a neighbour's wall, west of the lot
  at("64", 11, 23), // a neighbour's wall, east of the lot
  at("100", 4, 12), // the instrument's station
];

/** What a reader returns for the sketch of that job, as drawn and written (numbers as text, one with a leading zero, one unknown). */
export const SYNTH_DRAWING: SketchDrawing = {
  lines: [
    { id: "l1", file: "sketch.jpg", points: ["5", "41", "42", "43", "40"], label: "MW", style: "double", closes: false, certain: true },
    { id: "l2", file: "sketch.jpg", points: ["40", "30", "31"], label: "MW", style: "double", closes: false, certain: true },
    { id: "l3", file: "sketch.jpg", points: ["31", "32"], label: "", style: "single", closes: false, certain: true },
    { id: "l4", file: "sketch.jpg", points: ["32", "62", "63", "65", "61", "60"], label: "MW", style: "double", closes: false, certain: true },
    { id: "l5", file: "sketch.jpg", points: ["060", "6", "5"], label: "MW", style: "double", closes: false, certain: true },
    { id: "l6", file: "sketch.jpg", points: ["80", "81", "82"], label: "", style: "single", closes: false, certain: true },
    { id: "l7", file: "sketch.jpg", points: ["90", "91", "92", "93"], label: "Station Road", style: "double", closes: false, certain: true },
    { id: "l8", file: "sketch.jpg", points: ["44", "40"], label: "MW", style: "double", closes: false, certain: true },
    { id: "l9", file: "sketch.jpg", points: ["32", "64"], label: "MW", style: "double", closes: false, certain: false },
    { id: "l10", file: "sketch.jpg", points: ["99", "5"], label: "MW", style: "double", closes: false, certain: true },
  ],
  symbols: [{ id: "s1", file: "sketch.jpg", kind: "well", label: "well", at: "70" }],
  areas: [
    { id: "a1", file: "sketch.jpg", label: "P", around: [] },
    { id: "a2", file: "sketch.jpg", label: "X", around: [] },
  ],
};

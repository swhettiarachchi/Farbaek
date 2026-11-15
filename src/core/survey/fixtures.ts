/**
 * SYNTHETIC test and sample data. None of these coordinates, names or
 * numbers describe real land: they were made up for tests and for the
 * labelled Sample project. Never present them as a real survey.
 */
import type { SurveyDocument } from "./document";
import { emptyDocument } from "./document";
import type { SurveyPoint } from "./parcel";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A synthetic five-sided parcel near the middle of the SLD99 grid, plus a building outline and a wall line. */
export const SAMPLE_POINTS: SurveyPoint[] = [
  { id: id(1), pointId: "1", e: 500_012.345, n: 600_004.21, z: 21.43, code: "CP" },
  { id: id(2), pointId: "2", e: 500_043.912, n: 600_007.884, z: 21.88, code: "CP" },
  { id: id(3), pointId: "3", e: 500_048.105, n: 600_036.47, z: 22.61, code: "St" },
  { id: id(4), pointId: "4", e: 500_027.66, n: 600_049.902, z: 22.95, code: "MW" },
  { id: id(5), pointId: "5", e: 500_009.004, n: 600_033.118, z: 22.04, code: "CP" },
  { id: id(6), pointId: "B1", e: 500_020.5, n: 600_015.0, z: null, code: "P" },
  { id: id(7), pointId: "B2", e: 500_034.5, n: 600_015.0, z: null, code: "P" },
  { id: id(8), pointId: "B3", e: 500_034.5, n: 600_026.0, z: null, code: "P" },
  { id: id(9), pointId: "B4", e: 500_020.5, n: 600_026.0, z: null, code: "P" },
];

export function sampleDocument(): SurveyDocument {
  const doc = emptyDocument();
  doc.boundary = [id(1), id(2), id(3), id(4), id(5)];
  doc.features = [
    { id: "f1", layer: "BUILDINGS", code: "P", closed: true, points: [id(6), id(7), id(8), id(9)] },
    { id: "f2", layer: "WALLS", code: "MW", closed: false, points: [id(3), id(4)] },
  ];
  doc.sheet.lot = "1";
  doc.sheet.landName = "Sample Watta (sample data)";
  doc.sheet.village = "Sample village";
  doc.sheet.district = "Sample";
  doc.sheet.province = "Sample";
  doc.sheet.boundaries = { north: "Lot 2 (sample)", east: "Road (sample)", south: "Lot 4 (sample)", west: "Drain (sample)" };
  doc.sheet.surveyDate = "2026-11-15";
  doc.sheet.planDate = "2026-11-15";
  doc.sheet.planNumber = "SAMPLE-1";
  doc.sheet.previousPlans = "None. Sample data.";
  return doc;
}

/**
 * The sample parcel's area, m², computed independently of the engine: the
 * coordinate method in exact integer millimetres (BigInt), twice-area
 * 2,622,236,192 mm², so 1,311,118,096 mm² = 1,311.118096 m² exactly.
 */
export const SAMPLE_AREA_M2 = 1311.118096;

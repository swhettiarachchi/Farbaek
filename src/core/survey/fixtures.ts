/**
 * SYNTHETIC test and sample data. None of these coordinates, names or
 * numbers describe real land: they were made up for tests and for the
 * labelled Sample project. Never present them as a real survey.
 *
 * The Sample is a three-lot sub division near the middle of the SLD99 grid,
 * laid out like the plans studied in docs/survey/REFERENCE_PLANS_ANALYSIS.md:
 * lots B¹, B² and B³ sharing their partition legs, a road along the south
 * with two surveyed edges, a building, a wall, a well, an electric post and
 * labels for the adjoining lands.
 */
import { emptyDocument, type SurveyDocument } from "./document";
import type { SurveyPoint } from "./parcel";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const pt = (n: number, e: number, nn: number, z: number | null, code: string | null): SurveyPoint => ({ id: id(n), pointId: String(n), e, n: nn, z, code });

export const SAMPLE_POINTS: SurveyPoint[] = [
  pt(1, 500_000.0, 600_000.0, 21.43, "CP"),
  pt(2, 500_048.2, 600_001.5, 21.6, "CP"),
  pt(3, 500_050.1, 600_022.4, 22.1, "St"),
  pt(4, 500_052.3, 600_044.8, 22.8, "CP"),
  pt(5, 500_024.6, 600_046.2, 22.9, "St"),
  pt(6, 499_998.2, 600_043.1, 22.4, "MW"),
  pt(7, 499_999.1, 600_021.7, 21.9, "St"),
  pt(8, 500_024.1, 600_022.1, 22.0, "St"),
  // The road's two edges: its north edge runs along the land's south boundary.
  pt(9, 499_994.0, 599_999.813, 21.3, null),
  pt(10, 500_056.0, 600_001.743, 21.5, null),
  pt(11, 499_994.0, 599_995.393, 21.2, null),
  pt(12, 500_056.0, 599_997.173, 21.4, null),
  // A building in lot B¹.
  pt(13, 500_012.0, 600_006.0, null, "P"),
  pt(14, 500_030.0, 600_006.5, null, "P"),
  pt(15, 500_029.6, 600_016.0, null, "P"),
  pt(16, 500_011.7, 600_015.5, null, "P"),
  // A well in B², an electric post on the road verge.
  pt(17, 500_008.0, 600_034.0, null, "Well"),
  pt(18, 500_040.0, 599_998.9, null, "EP"),
];

export function sampleDocument(): SurveyDocument {
  const doc = emptyDocument();
  doc.lots = [
    { id: "lot-b1", label: "B", sup: "1", points: [id(1), id(2), id(3), id(8), id(7)], note: "" },
    { id: "lot-b2", label: "B", sup: "2", points: [id(7), id(8), id(5), id(6)], note: "" },
    { id: "lot-b3", label: "B", sup: "3", points: [id(8), id(3), id(4), id(5)], note: "" },
  ];
  doc.roads = [{ id: "road-1", name: "Sample Road", edgeA: [id(9), id(10)], edgeB: [id(11), id(12)], width: "feet", start: "From Main Road", end: "To Houses" }];
  doc.adjoining = [
    { id: "adj-west", text: "Land claimed by the sample owner", lot: "lot-b2", leg: 3 },
    { id: "adj-north", text: "Land of the sample neighbour", lot: "lot-b3", leg: 2 },
    { id: "adj-east", text: "Lot 2 in Plan No. SAMPLE-0", lot: "lot-b3", leg: 1 },
  ];
  doc.features = [
    { id: "f1", layer: "BUILDINGS", code: "P", closed: true, points: [id(13), id(14), id(15), id(16)] },
    { id: "f2", layer: "WALLS", code: "MW", closed: false, points: [id(6), id(7)] },
  ];
  doc.notes = ["Sample data made up for Farbaek: not a real survey."];
  const s = doc.sheet;
  s.planNumber = "SAMPLE-1";
  s.planDate = "2026-11-15";
  s.landName = "Sample Watta";
  s.operation = "subdivision";
  s.parentLots = "B";
  s.previousPlan = { number: "SAMPLE-0", date: "2020-01-15", by: "A. Sample", byDesignation: "Licensed Surveyor", mine: false, filing: "" };
  s.village = "Sample";
  s.pattu = "Sample Pattu";
  s.korale = "Sample Korale";
  s.district = "Sample";
  s.province = "Sample";
  s.boundaries = { north: "Land of the sample neighbour", east: "Lot 2 in Plan No. SAMPLE-0", south: "Sample Road", west: "Land claimed by the sample owner" };
  s.surveyDate = "2026-11-15";
  s.partitionDate = "2026-11-15";
  return doc;
}

/**
 * The sample's areas, m², computed independently of the engine: the
 * coordinate method in exact integer millimetres (BigInt). Twice-areas:
 * B¹ 2,114,760,000 mm², B² 1,170,050,000 mm², B³ 1,250,010,000 mm²; the
 * outline 4,534,820,000 mm², equal to their sum.
 */
export const SAMPLE_LOT_AREAS_M2 = { "lot-b1": 1057.38, "lot-b2": 585.025, "lot-b3": 625.005 } as const;
export const SAMPLE_AREA_M2 = 2267.41;

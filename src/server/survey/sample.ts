import { SAMPLE_POINTS, sampleDocument } from "@/core/survey/fixtures";
import type { SurveyProjectData } from "./read";

export const SAMPLE_PROJECT_ID = "sample";

/**
 * The Sample project: SYNTHETIC data from src/core/survey/fixtures.ts, the
 * same for everyone, read-only and never stored. It lets anyone see a whole
 * plan before importing their own points. Every screen labels it Sample.
 */
export function sampleProject(): SurveyProjectData {
  const now = "2026-11-15T00:00:00.000Z";
  return {
    project: { id: SAMPLE_PROJECT_ID, name: "Sample land survey", planType: "cadastral", crsId: "EPSG:5235", crsConfirmedBy: null, crsConfirmedAt: now, createdBy: null, createdAt: now, updatedAt: now, archivedAt: null },
    points: SAMPLE_POINTS,
    sources: [{ id: "sample-source", file_name: "sample-points.csv (sample data)", format: "delimited", sha256: "0".repeat(64), size_bytes: 0, point_count: SAMPLE_POINTS.length, settings: {}, created_by: null, created_at: now }],
    drawing: { id: "sample-drawing", version: 1, document: sampleDocument(), readable: true, note: "Sample", createdBy: null, createdAt: now },
    versions: [{ version: 1, note: "Sample", createdBy: null, createdAt: now }],
    approvals: [],
    exports: [],
    profiles: [],
  };
}

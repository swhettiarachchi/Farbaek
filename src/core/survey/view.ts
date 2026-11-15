/**
 * Everything a plan's screens and exports show, computed one way: the
 * parcel, the checks and the composed sheet, from the immutable points and
 * one drawing version. The approval hash covers exactly what a surveyor sees:
 * the document, the coordinates it uses and the engine version.
 */
import { canonicalize, sha256Hex } from "../trust/canonical-json";
import { crsById, type CrsRecord } from "./crs";
import type { SurveyDocument } from "./document";
import { computeParcel, type ParcelResult, type SurveyPoint } from "./parcel";
import { blocked, checkSurvey, SEVERITY_ORDER, type Finding } from "./qc";
import { composeSheet, type ComposedSheet, type SurveyorDetails } from "./sheet/compose";
import { SRI_LANKA_CADASTRAL_V1 } from "./sheet/template";
import { SURVEY_ENGINE_VERSION } from "./version";

export interface PlanInput {
  points: readonly SurveyPoint[];
  document: SurveyDocument;
  crsId: string;
  /** Who confirmed the CRS and when, already in words; null when nobody has. */
  crsConfirmation: string | null;
  surveyor: SurveyorDetails | null;
  approval: { by: string; at: string } | null;
}

export interface PlanView {
  crs: CrsRecord | null;
  parcel: ParcelResult | null;
  parcelMissing: string[];
  findings: Finding[];
  sheet: ComposedSheet;
  blocksExport: Finding[];
  /**
   * The export blockers that concern the coordinates or the parcel itself, not
   * the printed sheet: these alone hold back the GeoJSON, which has no sheet.
   * A missing boundary doesn't, since the points still export.
   */
  blocksData: Finding[];
  blocksApproval: Finding[];
}

export function buildPlan(input: PlanInput): PlanView {
  const crs = crsById(input.crsId);
  const result = input.document.boundary.length > 0 ? computeParcel(input.points, input.document.boundary) : null;
  const parcel = result && result.ok ? result.parcel : null;
  const sheet = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: input.document, points: input.points, parcel, crs, crsConfirmation: input.crsConfirmation, surveyor: input.surveyor, approval: input.approval });
  const findings = [...checkSurvey({ points: input.points, crs, crsConfirmed: input.crsConfirmation !== null, document: input.document, parcel: result, surveyorProfile: input.surveyor !== null }), ...sheet.findings].sort(
    (x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity),
  );
  const blocksExport = blocked(findings, "export");
  const blocksData = blocksExport.filter((f) => f.target.kind !== "sheet" && f.target.kind !== "field" && f.code !== "BOUNDARY_NOT_SET");
  return { crs, parcel, parcelMissing: result && !result.ok ? result.missing : [], findings, sheet, blocksExport, blocksData, blocksApproval: blocked(findings, "approval") };
}

/** The SHA-256 of what a surveyor approves: canonical JSON (RFC 8785) of the document, the CRS and every point it uses. */
export async function approvalHash(input: { document: SurveyDocument; crsId: string; points: readonly SurveyPoint[] }): Promise<string> {
  const used = new Set([...input.document.boundary, ...input.document.features.flatMap((f) => f.points)]);
  const points = input.points
    .filter((p) => used.has(p.id))
    .map((p) => ({ id: p.id, point: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sha256Hex(canonicalize({ engine: SURVEY_ENGINE_VERSION, crs: input.crsId, document: input.document, points }));
}

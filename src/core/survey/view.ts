/**
 * Everything a plan's screens and exports show, computed one way: the lots,
 * the checks and the composed sheet, from the immutable points and one
 * drawing version. The approval hash covers exactly what a surveyor sees:
 * the document (with what the AI filled and whether it was reviewed), the
 * coordinates it uses and the engine version.
 */
import { canonicalize, sha256Hex } from "../trust/canonical-json";
import { crsById, type CrsRecord } from "./crs";
import { withConstructed } from "./construct";
import { usedPointIds, type SurveyDocument } from "./document";
import { computeLots, type PlanLots } from "./lots";
import type { ParcelResult, SurveyPoint } from "./parcel";
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
  /** The drawing version this plan is, for the plot stamp; absent for previews of unsaved edits. */
  version?: number;
}

export interface PlanView {
  crs: CrsRecord | null;
  lots: PlanLots;
  /** The one lot's parcel when the plan has exactly one (or is an extract of one), for single-parcel exports. */
  parcel: ParcelResult | null;
  findings: Finding[];
  sheet: ComposedSheet;
  blocksExport: Finding[];
  /**
   * The export blockers that concern the coordinates or the lots themselves,
   * not the printed sheet: these alone hold back the GeoJSON, which has no
   * sheet. A missing lot doesn't, since the points still export.
   */
  blocksData: Finding[];
  blocksApproval: Finding[];
}

export function buildPlan(input: PlanInput): PlanView {
  const crs = crsById(input.crsId);
  const doc = input.document;
  // Lines' constructed corners (ADR 0270), worked out from the surveyed points; lots are computed from surveyed points only.
  const points = withConstructed(input.points, doc);
  const lots = computeLots(input.points, doc.lots);
  const single = doc.sheet.extractOf ? lots.lots.find((r) => r.lot.id === doc.sheet.extractOf) : lots.lots.length === 1 ? lots.lots[0] : undefined;
  const parcel = single?.parcel ?? null;
  const sheet = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: doc, points, lots, crs, crsConfirmation: input.crsConfirmation, surveyor: input.surveyor, approval: input.approval, version: input.version });
  const findings = [...checkSurvey({ points, crs, crsConfirmed: input.crsConfirmation !== null, document: doc, lots, surveyorProfile: input.surveyor !== null }), ...sheet.findings].sort(
    (x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity),
  );
  const blocksExport = blocked(findings, "export");
  const blocksData = blocksExport.filter((f) => f.target.kind !== "sheet" && f.target.kind !== "field" && f.code !== "BOUNDARY_NOT_SET");
  return { crs, lots, parcel, findings, sheet, blocksExport, blocksData, blocksApproval: blocked(findings, "approval") };
}

/** The SHA-256 of what a surveyor approves: canonical JSON (RFC 8785) of the document, the CRS and every point it uses. */
export async function approvalHash(input: { document: SurveyDocument; crsId: string; points: readonly SurveyPoint[] }): Promise<string> {
  const used = usedPointIds(input.document);
  const points = input.points
    .filter((p) => used.has(p.id))
    .map((p) => ({ id: p.id, point: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // A document with no kept near misses, no planning rules and no sketch readings hashes as one saved before those fields existed,
  // so earlier approvals still match.
  // The same for the code grammar while it's Farbaek's own (ADR 0243).
  const { kept, rules, sketch, grammar, ...rest } = input.document;
  const document = { ...rest, ...(kept.length > 0 ? { kept } : {}), ...(rules ? { rules } : {}), ...(sketch ? { sketch } : {}), ...(grammar && grammar !== "farbaek" ? { grammar } : {}) };
  return sha256Hex(canonicalize({ engine: SURVEY_ENGINE_VERSION, crs: input.crsId, document, points }));
}

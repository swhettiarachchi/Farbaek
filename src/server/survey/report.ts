import "server-only";
import { checkSketch, readerName } from "@/core/survey/autosurvey/sketch";
import { provenanceLive } from "@/core/survey/document";
import { filledCounts, sourceNotes, type ReportInput } from "@/core/survey/export/report";
import { SURVEY_ENGINE_VERSION } from "@/core/survey/version";
import type { PlanView } from "@/core/survey/view";
import type { ApprovalStatus } from "./present";
import { EXPORTS_READ, VERSIONS_READ, type SurveyExport, type SurveyProjectData } from "./read";

/** What an export record holds, as people call it. */
export function exportName(x: Pick<SurveyExport, "kind" | "options">): string {
  const content = x.options["content"];
  if (content === "lots") return "Lot schedule (CSV)";
  if (content === "blockout") return "Block-out plan (PDF)";
  if (content === "report") return "Checks and sources report (PDF)";
  if (x.kind === "pdf") return "Plan (PDF)";
  if (x.kind === "dxf") return "Drawing (DXF)";
  if (x.kind === "csv") return "Points (CSV)";
  if (x.kind === "geojson") return "Points and lots (GeoJSON)";
  return x.kind.toUpperCase();
}

/**
 * The checks and sources report's contents (stage 236, ADR 0245), from what the project records for one version: nothing is worked
 * out for the report alone. The sketch readings are checked against the points only on a confirmed coordinate system, as the plan's
 * own checks do; otherwise every reading counts as not checked.
 */
export function reportInputFor(data: SurveyProjectData, input: { crsConfirmation: string | null; approval: { by: string; at: string } | null; approvalStatus: ApprovalStatus }, view: PlanView, now: Date): ReportInput {
  const doc = data.drawing.document;
  const filled = filledCounts(doc, (key) => provenanceLive(doc, key));
  const crs = view.crs;
  let sketch: ReportInput["sketch"] = null;
  if (doc.sketch) {
    const checks = crs && input.crsConfirmation !== null ? checkSketch(doc.sketch, data.points, crs) : [];
    const count = (s: string) => checks.filter((c) => c.status === s).length;
    const [agree, close, differ, unmatched] = [count("agrees"), count("close"), count("differs"), count("unmatched")];
    sketch = { reader: readerName(doc.sketch.model), at: doc.sketch.readAt, photos: doc.sketch.files.length, readings: doc.sketch.readings.length, agree, close, differ, unmatched, unchecked: doc.sketch.readings.length - agree - close - differ - unmatched, unreadable: doc.sketch.unreadable.length };
  }
  const current = input.approvalStatus.current;
  return {
    projectName: data.project.name,
    version: data.drawing.version,
    versionAt: data.drawing.createdAt,
    madeAt: now.toISOString(),
    crs: { name: crs ? `${crs.name} (${crs.id})` : `${data.project.crsId}, which this version of Farbaek doesn't know`, confirmation: input.crsConfirmation },
    approval: input.approval && current ? { by: input.approval.by, at: input.approval.at, sha256: current.content_sha256 } : null,
    lapsed: input.approvalStatus.lapsed?.reason ?? null,
    // The engine that checks the plan now. The draft's own engine version isn't recorded with the document, so it isn't named.
    engines: [SURVEY_ENGINE_VERSION],
    sources: data.sources.map((s) => ({ name: s.file_name, format: s.format, sha256: s.sha256, sizeBytes: s.size_bytes, points: s.point_count, at: s.created_at, notes: sourceNotes(s.settings) })),
    filled,
    sketch,
    findings: view.findings,
    versions: [...data.versions].sort((a, b) => b.version - a.version).map((v) => ({ version: v.version, note: v.note, at: v.createdAt })),
    versionsCut: data.versions.length >= VERSIONS_READ,
    exports: [...data.exports].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((x) => ({ what: exportName(x), version: x.drawing_version, sha256: x.sha256, at: x.created_at })),
    exportsCut: data.exports.length >= EXPORTS_READ,
  };
}

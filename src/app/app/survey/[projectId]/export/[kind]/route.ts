import { createHash } from "node:crypto";
import { writeDxf } from "@/core/survey/export/dxf";
import { pointsCsv, surveyGeoJson } from "@/core/survey/export/points";
import { lotScheduleCsv } from "@/core/survey/export/schedule";
import { buildPlan } from "@/core/survey/view";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { renderPdf } from "@/server/survey/pdf";
import { planInputFor } from "@/server/survey/present";
import { loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { SAMPLE_PROJECT_ID, sampleProject } from "@/server/survey/sample";
import { surveyStore } from "@/server/survey/store";
import { loadAppContext } from "@/server/workspace/context";

/**
 * GET /app/survey/<project>/export/<pdf|dxf|csv|geojson|lots>[?version=N][&inline=1]
 *
 * Builds the file from one drawing version, the immutable points and the
 * tested engine, records it (kind, version, SHA-256, size) in the project's
 * audit trail, then sends it. Members only: the project is read as the
 * signed-in person, through row level security. A plan with a check that
 * blocks export is refused with the reasons, never printed half-right. If the
 * export can't be recorded, it isn't sent.
 */

const KINDS = {
  pdf: { type: "application/pdf", ext: "pdf" },
  dxf: { type: "application/dxf", ext: "dxf" },
  csv: { type: "text/csv; charset=utf-8", ext: "csv" },
  geojson: { type: "application/geo+json", ext: "geojson" },
  // The lot schedule: a CSV, recorded as one with what it holds in its options.
  lots: { type: "text/csv; charset=utf-8", ext: "csv" },
} as const;
type Kind = keyof typeof KINDS;

const plain = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** A file name of plain ASCII letters, digits and hyphens. */
function fileStem(data: SurveyProjectData, approved: boolean): string {
  const base = (data.drawing.document.sheet.planNumber.trim() || data.project.name).normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "survey-plan";
  return `${base}-v${data.drawing.version}${approved ? "" : "-draft"}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; kind: string }> }) {
  const { projectId, kind: rawKind } = await params;
  if (!(rawKind in KINDS)) return plain(404, "There's no such export.");
  const kind = rawKind as Kind;
  const url = new URL(request.url);
  const versionParam = url.searchParams.get("version");
  const version = versionParam === null ? undefined : Number(versionParam);
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) return plain(400, "That version number isn't valid.");

  const ctx = await loadAppContext();
  if (!ctx?.current) return plain(404, "There's no such survey project.");
  let data: SurveyProjectData | null;
  if (projectId === SAMPLE_PROJECT_ID) data = sampleProject();
  else if (ctx.mode === "demo") data = null;
  else {
    const client = await createSupabaseServerClient();
    data = client ? await loadSurveyProject(client, ctx.current.id, projectId, version) : null;
  }
  if (!data) return plain(404, "There's no such survey project, or it isn't in this workspace.");

  const input = await planInputFor(data);
  const view = buildPlan(input);
  // The CSV is the points exactly as imported. The GeoJSON waits for checks on the coordinates and the parcel;
  // the PDF and DXF also wait for the sheet's.
  const blockers = kind === "csv" ? [] : kind === "geojson" || kind === "lots" ? view.blocksData : view.blocksExport;
  if (blockers.length > 0) {
    return plain(409, `This plan can't be exported yet:\n${blockers.map((f) => `- ${f.message} ${f.action}`).join("\n")}`);
  }

  const status = input.approval
    ? `Approved in Farbaek by ${input.approval.by} on ${input.approval.at}, version ${data.drawing.version}. Approval records a review; the signed print certifies the plan.`
    : `DRAFT, version ${data.drawing.version}. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet.`;
  const crsStatus = input.crsConfirmation ? `Coordinate system: ${input.crsConfirmation}.` : "Coordinate system: not confirmed by a person.";
  let body: Buffer;
  if (kind === "pdf") {
    body = await renderPdf(view.sheet.pages, {
      title: `${data.drawing.document.sheet.planNumber.trim() || data.project.name} (version ${data.drawing.version})`,
      subject: input.approval ? `Approved in Farbaek by ${input.approval.by} on ${input.approval.at}` : "Draft survey plan, not certified",
      createdAt: new Date(data.drawing.createdAt),
    });
  } else if (kind === "dxf") {
    body = Buffer.from(writeDxf({ document: data.drawing.document, points: data.points, lots: view.lots, crs: view.crs, scale: view.sheet.scale ?? 500, projectName: data.project.name, status: `${status} ${crsStatus}` }), "ascii");
  } else if (kind === "csv") {
    body = Buffer.from(pointsCsv(data.points), "utf8");
  } else if (kind === "lots") {
    body = Buffer.from(lotScheduleCsv(view.lots, data.drawing.document.settings.perchDecimals), "utf8");
  } else {
    body = Buffer.from(surveyGeoJson({ points: data.points, lots: view.lots, crs: view.crs, crsConfirmed: input.crsConfirmation !== null, status, projectName: data.project.name }), "utf8");
  }
  const sha256 = createHash("sha256").update(body).digest("hex");

  if (projectId !== SAMPLE_PROJECT_ID) {
    const admin = createSupabaseAdminClient();
    if (!admin) return plain(503, "Farbaek's server isn't set up to record exports, so none is made.");
    const recorded = await surveyStore.recordExport(admin, { orgId: ctx.current.id, userId: ctx.user.id }, {
      projectId,
      version: data.drawing.version,
      kind: kind === "lots" ? "csv" : kind,
      sha256,
      size: body.length,
      options: { paper: data.drawing.document.settings.paper, orientation: data.drawing.document.settings.orientation, scale: view.sheet.scale, ...(kind === "lots" ? { content: "lots" } : {}) },
    });
    if (!recorded.ok) return plain(recorded.code === "FORBIDDEN" ? 403 : 500, recorded.message);
  }

  const name = `${fileStem(data, input.approval !== null)}${kind === "lots" ? "-lots" : ""}.${KINDS[kind].ext}`;
  const inline = kind === "pdf" && url.searchParams.get("inline") === "1";
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": KINDS[kind].type,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "content-length": String(body.length),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-farbaek-sha256": sha256,
    },
  });
}

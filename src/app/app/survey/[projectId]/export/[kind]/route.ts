import { createHash } from "node:crypto";
import { blockOutSheet, readDivision } from "@/core/survey/blockout";
import { crsById } from "@/core/survey/crs";
import { writeDxf } from "@/core/survey/export/dxf";
import { pointsCsv, surveyGeoJson } from "@/core/survey/export/points";
import { reportPages } from "@/core/survey/export/report";
import { lotScheduleCsv } from "@/core/survey/export/schedule";
import { buildPlan } from "@/core/survey/view";
import { SRI_LANKA_CADASTRAL_V1 } from "@/core/survey/sheet/template";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { renderPdf } from "@/server/survey/pdf";
import { planInputFor } from "@/server/survey/present";
import { loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { reportInputFor } from "@/server/survey/report";
import { SAMPLE_PROJECT_ID, sampleProject } from "@/server/survey/sample";
import { surveyStore } from "@/server/survey/store";
import { loadAppContext } from "@/server/workspace/context";

/**
 * GET /app/survey/<project>/export/<pdf|dxf|csv|geojson|lots|blockout|report>[?version=N][&inline=1][&division=<json>]
 *
 * The checks and sources report (report.ts, ADR 0245) is made for any version, held back by nothing: it says what holds the plan back.
 *
 * A block-out plan (blockout.ts) is worked out again here from the version and the surveyor's choices in `division`, never from
 * figures the browser computed, and is recorded as a PDF with what it holds in its options.
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
  // A block-out plan of one lot's division: a PDF, recorded as one with what it holds in its options.
  blockout: { type: "application/pdf", ext: "pdf" },
  // The version's checks and where everything on it came from: a PDF, recorded as one with what it holds in its options.
  report: { type: "application/pdf", ext: "pdf" },
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
  if (!Object.hasOwn(KINDS, rawKind)) return plain(404, "There's no such export.");
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
  const blockers = kind === "csv" || kind === "report" ? [] : kind === "geojson" || kind === "lots" || kind === "blockout" ? view.blocksData : view.blocksExport;
  if (blockers.length > 0) {
    return plain(409, `This plan can't be exported yet:\n${blockers.map((f) => `- ${f.message} ${f.action}`).join("\n")}`);
  }

  const status = input.approval
    ? `Approved in Farbaek by ${input.approval.by} on ${input.approval.at}, version ${data.drawing.version}. Approval records a review; the signed print certifies the plan.`
    : `DRAFT, version ${data.drawing.version}. Not certified: the plan is certified only by the licensed surveyor's signature on the printed sheet.`;
  const crsStatus = input.crsConfirmation ? `Coordinate system: ${input.crsConfirmation}.` : "Coordinate system: not confirmed by a person.";
  let body: Buffer;
  let blockOutOptions: Record<string, unknown> | null = null;
  if (kind === "blockout") {
    const division = readDivision(url.searchParams.get("division"));
    if (!division) return plain(400, "That division can't be read. Open the Lots step and choose the division again.");
    const made = blockOutSheet({ template: SRI_LANKA_CADASTRAL_V1, crs: crsById(input.crsId), crsConfirmation: input.crsConfirmation, surveyor: input.surveyor, version: data.drawing.version }, data.drawing.document, data.points, division);
    if (!made.ok) return plain(409, made.error);
    const stops = made.sheet.findings.filter((f) => f.blocks.includes("export"));
    if (stops.length > 0) return plain(409, `This block-out plan can't be printed yet:\n${stops.map((f) => `- ${f.message} ${f.action}`).join("\n")}`);
    body = await renderPdf(made.sheet.pages, {
      title: `Block-out plan of lot ${made.lot.label}${made.lot.sup} (from version ${data.drawing.version})`,
      subject: "Planned sub division, not yet surveyed; not certified",
      createdAt: new Date(data.drawing.createdAt),
    });
    // The choices that made it, so the record says what was printed (the options column holds 4 KB: a long one keeps only its SHA-256).
    const asked = JSON.stringify(division);
    blockOutOptions = { content: "blockout", lot: made.lot.id, scale: made.sheet.scale, paper: made.sheet.paper, engine: made.result.engine, divisionSha256: createHash("sha256").update(asked).digest("hex"), ...(asked.length <= 2000 ? { division } : {}) };
  } else if (kind === "report") {
    // A version whose settings can't be read shows defaults on screen; a report of those defaults would describe a plan that isn't there.
    if (!data.drawing.readable) return plain(409, "This version's saved settings couldn't be read, so there's no report of it. Save a new version to replace it.");
    const now = new Date();
    body = await renderPdf(reportPages(reportInputFor(data, input, view, now)), {
      title: `Checks and sources report: ${data.project.name} (version ${data.drawing.version})`,
      subject: "The checks on one version of a survey plan and where everything on it came from; certifies nothing",
      createdAt: now,
    });
  } else if (kind === "pdf") {
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
      kind: kind === "lots" ? "csv" : kind === "blockout" || kind === "report" ? "pdf" : kind,
      sha256,
      size: body.length,
      options: blockOutOptions ?? (kind === "report" ? { content: "report", paper: "A4", orientation: "portrait" } : { paper: data.drawing.document.settings.paper, orientation: data.drawing.document.settings.orientation, scale: view.sheet.scale, ...(kind === "lots" ? { content: "lots" } : {}) }),
    });
    if (!recorded.ok) return plain(recorded.code === "FORBIDDEN" ? 403 : 500, recorded.message);
  }

  const name = `${fileStem(data, input.approval !== null)}${kind === "lots" ? "-lots" : kind === "blockout" ? "-block-out" : kind === "report" ? "-checks" : ""}.${KINDS[kind].ext}`;
  const inline = (kind === "pdf" || kind === "blockout" || kind === "report") && url.searchParams.get("inline") === "1";
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

import { buildPlan } from "@/core/survey/view";
import { renderPdf } from "@/server/survey/pdf";
import { planInputFor } from "@/server/survey/present";
import { sampleProject } from "@/server/survey/sample";

/**
 * GET /survey/sample-plan.pdf: the Sample plan as a real vector PDF, for
 * anyone to open or print at actual size and measure its 100 mm check line.
 * Synthetic points only, marked as a sample and a draft on the sheet itself.
 * Built once at build time from the same engine as every export.
 */
export const dynamic = "force-static";

export async function GET() {
  const data = sampleProject();
  const view = buildPlan(await planInputFor(data));
  const body = await renderPdf(view.sheet.pages, {
    title: "Farbaek Survey Studio sample plan (synthetic data)",
    subject: "Sample survey plan from synthetic points. Draft, not certified.",
    createdAt: new Date(data.drawing.createdAt),
  });
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="farbaek-survey-sample-plan.pdf"',
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

import { ArrowLeftIcon, ScribbleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { SketchReportView } from "@/components/survey/sketch-report";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { crsById } from "@/core/survey/crs";
import { interpretDocument } from "@/core/survey/sketchintel/findings";
import { sketchReport } from "@/core/survey/sketchintel/report";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadSketchPhotos } from "@/server/survey/sketch-photos";
import { loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { SAMPLE_PROJECT_ID, sampleProject } from "@/server/survey/sample";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Sketch interpretation" };

/**
 * The sketch interpretation report of a project's current version (stage 245, ADR 0253): read as the signed-in person through row-level
 * security, like the project itself, and worked out again from what was read and the points as they are now. It changes nothing.
 */
export default async function SketchReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const sample = projectId === SAMPLE_PROJECT_ID;
  let data: SurveyProjectData | null = null;
  const client = !sample && ctx.mode === "live" ? await createSupabaseServerClient() : null;
  if (sample) data = sampleProject();
  else if (client) data = await loadSurveyProject(client, ctx.current.id, projectId);
  if (!data) notFound();

  const base = `/app/survey/${projectId}`;
  const doc = data.drawing.document;
  const back = (
    <Link href={`${base}?step=draft`} className={buttonClasses("secondary", "md")}>
      <ArrowLeftIcon size={16} weight="bold" aria-hidden />
      Back to the plan
    </Link>
  );
  if (!doc.sketch) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Sketch interpretation" description={data.project.name} />
        <EmptyState icon={ScribbleIcon} title="No sketch has been read yet" action={back}>
          Add photos of your field sketches on the Draft step, and this report shows how each number and word on them was read.
        </EmptyState>
      </div>
    );
  }

  const crs = crsById(data.project.crsId);
  const report = sketchReport({ sketch: doc.sketch, points: data.points, codes: doc.codes, crs: crs && data.project.crsConfirmedAt ? crs : null, interpretation: interpretDocument(doc, data.points) });
  const photos = client ? await loadSketchPhotos(client, projectId, doc.sketch.readAt) : [];
  const byFile = new Map(photos.map((p) => [p.fileName, `${base}/sketch-photo/${p.id}`] as const));

  return (
    <div className="grid gap-6">
      <PageHeader title="Sketch interpretation" description={`${data.project.name}, version ${data.drawing.version}. How each number and word on the field sketches was read, and what the survey says.`} actions={back} />
      {sample ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="simulated" label="Sample" />
        </div>
      ) : null}
      <SketchReportView report={report} photoUrl={(file) => byFile.get(file) ?? null} />
    </div>
  );
}

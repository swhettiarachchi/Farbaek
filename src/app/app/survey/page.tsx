import { CompassToolIcon, IdentificationCardIcon, MapTrifoldIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { crsById } from "@/core/survey/crs";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { listSurveyProjects } from "@/server/survey/read";
import { surveyReadOnlyReason } from "@/server/survey/access";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Survey Studio" };

export default async function SurveyStudioPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const client = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const projects = client ? await listSurveyProjects(client, ctx.current.id) : [];
  const readOnly = surveyReadOnlyReason(ctx);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Survey Studio"
        description="Land survey plans from your field data: computed from the coordinates, checked, drawn to an exact scale and exported as PDF and DXF. You review every plan, and you sign it."
        actions={
          <>
            <ButtonLink href="/app/survey/profile" variant="secondary" size="sm">
              <IdentificationCardIcon size={16} weight="bold" aria-hidden />
              Surveyor details
            </ButtonLink>
            {readOnly ? null : (
              <ButtonLink href="/app/survey/new" size="sm">
                <PlusIcon size={16} weight="bold" aria-hidden />
                New survey project
              </ButtonLink>
            )}
          </>
        }
      />

      {readOnly ? <Notice>{readOnly} The Sample project below shows a whole plan.</Notice> : null}
      {projects === null ? <Notice tone="warning">Survey projects can&apos;t be read right now. Reload the page in a moment.</Notice> : null}

      <Link href="/app/survey/sample" className="group grid gap-4 rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line transition-shadow duration-200 hover:shadow-e2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-md bg-surface p-5 shadow-e1 sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="simulated" label="Sample" />
            <span className="text-sm text-ink-3">Synthetic data, read-only</span>
          </div>
          <p className="mt-3 text-lg font-medium tracking-[-0.01em] text-ink">Sample land survey</p>
          <p className="mt-1 max-w-[60ch] text-sm text-ink-2">A five-sided parcel with a building and a wall, on the SLD99 grid: open it to see the boundary, the plan sheet, the checks and the exports before importing your own points.</p>
        </div>
      </Link>

      <section aria-labelledby="survey-projects" className="grid gap-4">
        <CardTitle id="survey-projects" icon={MapTrifoldIcon}>
          Projects
        </CardTitle>
        {projects && projects.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => {
              const crs = crsById(p.crsId);
              return (
                <li key={p.id}>
                  <Link href={`/app/survey/${p.id}`} className="flex h-full flex-col gap-3 rounded-md border border-line bg-surface p-5 shadow-e1 transition-[box-shadow,border-color] duration-150 hover:border-line-strong hover:shadow-e2">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.approvedVersions.length > 0 ? <StatusBadge status="done" label={`Version ${Math.max(...p.approvedVersions)} approved`} /> : <StatusBadge status="info" label="Draft" />}
                      {p.crsConfirmedAt ? null : <StatusBadge status="unverified" label="CRS not confirmed" />}
                    </div>
                    <p className="font-medium text-ink">{p.name}</p>
                    <p className="text-sm text-ink-2">
                      {crs?.name ?? p.crsId}. {p.pointCount} {p.pointCount === 1 ? "point" : "points"}.
                    </p>
                    <p className="mt-auto text-sm text-ink-3">
                      Changed <RelativeTime iso={p.updatedAt} />
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={CompassToolIcon}
            title="No survey projects yet"
            action={readOnly ? undefined : <ButtonLink href="/app/survey/new">New survey project</ButtonLink>}
          >
            Start one, import your points as CSV or TXT, choose the boundary, and Survey Studio draws the plan to scale.
          </EmptyState>
        )}
      </section>

      <Card>
        <CardTitle icon={CompassToolIcon}>In this version</CardTitle>
        <ul className="mt-4 grid list-disc gap-1.5 pl-5 text-sm text-ink-2">
          <li>Land survey (cadastral boundary) plans, on the SLD99 or Kandawala grid, UTM zone 44N, or local coordinates.</li>
          <li>Point files in any column order (PNEZD, PENZD and others), and GeoJSON with a named grid.</li>
          <li>Bearings, distances, area in m², hectares and acres, roods and perches, and checks on every step.</li>
          <li>A plan sheet with title, extent, boundaries, references, north point, scale bar and an overleaf schedule; vector PDF at exact scale, and DXF for CAD.</li>
          <li>Coming next, each with its own engine: subdivision and blocking out, topographic plans and contours, engineering and road plans, and an assistant that turns your instructions into a plan.</li>
        </ul>
      </Card>
    </div>
  );
}

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
import { BEZEL, PAGE_STACK } from "@/components/ui/surfaces";

export const metadata: Metadata = { title: "Survey Studio" };

export default async function SurveyStudioPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const client = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const projects = client ? await listSurveyProjects(client, ctx.current.id) : [];
  const readOnly = surveyReadOnlyReason(ctx);

  return (
    <div className={PAGE_STACK}>
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
                New survey
              </ButtonLink>
            )}
          </>
        }
      />

      {readOnly ? <Notice>{readOnly} The Sample project below shows a whole plan.</Notice> : null}
      {projects === null ? <Notice tone="warning">Survey projects can&apos;t be read right now. Reload the page in a moment.</Notice> : null}

      <Link href="/app/survey/sample" className={`group grid gap-4 transition-shadow duration-200 hover:shadow-e2 sm:grid-cols-[minmax(0,1fr)_auto] ${BEZEL}`}>
        <div className="rounded-md bg-surface p-4 sm:p-5 shadow-e1 sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="simulated" label="Sample" />
            <span className="text-sm text-ink-3">Synthetic data, read-only</span>
          </div>
          <p className="mt-3 text-title-4 font-medium tracking-[-0.01em] text-ink sm:text-lg">Sample land survey</p>
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
                  <Link href={`/app/survey/${p.id}`} className="flex h-full flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:p-5 shadow-e1 transition-[box-shadow,border-color] duration-150 hover:border-line-strong hover:shadow-e2">
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
            action={readOnly ? undefined : <ButtonLink href="/app/survey/new">New survey</ButtonLink>}
          >
            Start one, bring in your points (a file from your instrument, a CSV, or typed in), and Survey Studio draws the plan to scale.
          </EmptyState>
        )}
      </section>

      <Card>
        <CardTitle icon={CompassToolIcon}>In this version</CardTitle>
        <ul className="mt-4 grid list-disc gap-1.5 pl-5 text-sm text-ink-2">
          <li>Land survey (cadastral boundary) plans with several lots, roads and adjoining lands, on the SLD99 or Kandawala grid, UTM zone 44N, or local coordinates.</li>
          <li>Points from files in any column order, GeoJSON, Leica GSI, Sokkia SDR, LandXML and Trimble JobXML, or typed in as coordinates or bearings and distances.</li>
          <li>Bearings, distances, area in m², hectares and acres, roods and perches, and checks on every step.</li>
          <li>Dividing a lot into shares by area or width, and block-out plans checked against planning minimums you choose.</li>
          <li>A draft from your description or a photo of an old plan, and a drafting assistant you talk or type to on the Plan step. You check every change before it&apos;s applied.</li>
          <li>The classic Sri Lankan plan sheet with title, extent, boundaries, references, north point, scale bar and an overleaf schedule; vector PDF at exact scale, and DXF for CAD.</li>
          <li>Coming next, each with its own engine: topographic plans and contours, and engineering and road plans.</li>
        </ul>
      </Card>
    </div>
  );
}

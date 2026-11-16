import {
  ArchiveIcon,
  ArrowsLeftRightIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  GearSixIcon,
  ListChecksIcon,
  MapPinSimpleIcon,
  PenNibIcon,
  PolygonIcon,
  PrinterIcon,
  RulerIcon,
  ScissorsIcon,
  SealCheckIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveSurveyProjectAction } from "../actions";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { LotsEditor } from "@/components/survey/boundary-editor";
import { FindingsList } from "@/components/survey/findings";
import { DraftPanel } from "@/components/survey/draft-panel";
import { ApproveForm, SurveyProjectSettingsForm } from "@/components/survey/forms";
import { ImportPanel } from "@/components/survey/import-panel";
import { InverseTool } from "@/components/survey/inverse-tool";
import { PartitionPanel } from "@/components/survey/partition-panel";
import { DrawFromPoints } from "@/components/survey/draw-from-points";
import { ReviewChecklist } from "@/components/survey/review-checklist";
import { AssistantProvider } from "@/components/survey/assistant/assistant-context";
import { PlanEditor } from "@/components/survey/plan-editor";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { crsById } from "@/core/survey/crs";
import { fmt } from "@/core/survey/sheet/compose";
import { compareDocuments, type ChangeArea } from "@/core/survey/compare";
import { buildPlan } from "@/core/survey/view";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { surveyReadOnlyReason } from "@/server/survey/access";
import { isoDate, personName, planInputFor } from "@/server/survey/present";
import { loadAssistantHistory, loadSurveyDrawing, loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { SAMPLE_PROJECT_ID, sampleProject } from "@/server/survey/sample";
import { loadAppContext } from "@/server/workspace/context";
import { loadAiAvailability } from "@/server/workspace/usage-summary";

export const metadata: Metadata = { title: "Survey project" };

const STEPS = [
  { id: "import", label: "Import", icon: FileArrowUpIcon },
  { id: "points", label: "Points", icon: MapPinSimpleIcon },
  { id: "draft", label: "Draft", icon: PenNibIcon },
  { id: "boundary", label: "Lots", icon: PolygonIcon },
  { id: "plan", label: "Plan", icon: RulerIcon },
  { id: "check", label: "Check", icon: ListChecksIcon },
  { id: "export", label: "Export", icon: DownloadSimpleIcon },
  { id: "history", label: "History", icon: ClockCounterClockwiseIcon },
  { id: "settings", label: "Settings", icon: GearSixIcon },
] as const satisfies readonly { id: string; label: string; icon: Icon }[];
type StepId = (typeof STEPS)[number]["id"];

const POINTS_SHOWN = 500;

export default async function SurveyProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ step?: string; compare?: string }> }) {
  const [{ projectId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const sample = projectId === SAMPLE_PROJECT_ID;
  let data: SurveyProjectData | null = null;
  if (sample) data = sampleProject();
  else if (ctx.mode === "live") {
    const client = await createSupabaseServerClient();
    data = client ? await loadSurveyProject(client, ctx.current.id, projectId) : null;
  }
  if (!data) notFound();

  const readOnly = surveyReadOnlyReason(ctx, sample);
  const input = await planInputFor(data);
  const view = buildPlan(input);
  const doc = data.drawing.document;
  const crs = crsById(data.project.crsId);
  const approval = input.approvalStatus.current;
  const lapsed = input.approvalStatus.lapsed;
  // A version's approval as History shows it: standing, withdrawn, or (for the version shown) no longer matching.
  const versionApproval = (version: number) => {
    const rows = data.approvals.filter((a) => a.drawing_version === version);
    if (version === data.drawing.version) return approval ? <StatusBadge status="done" label="Approved" /> : lapsed ? <StatusBadge status="off" label="Approval no longer applies" /> : null;
    if (rows.some((a) => a.withdrawn_at === null)) return <StatusBadge status="done" label="Approved" />;
    return rows.length > 0 ? <StatusBadge status="off" label="Approval withdrawn" /> : null;
  };
  const fallback: StepId = data.points.length === 0 ? "import" : doc.lots.length === 0 ? "draft" : "plan";
  const step: StepId = STEPS.some((s) => s.id === sp.step) ? (sp.step as StepId) : fallback;
  const base = `/app/survey/${projectId}`;
  const surveyors = data.profiles.map((p) => ({ userId: p.user_id, name: p.full_name, designation: p.designation, registration: p.registration, address: p.address, contact: p.contact }));
  const me = ctx.user.id;
  const named = doc.surveyorUserId;
  // The drafting assistant (ADR 0202): its availability, read only on its own step.
  const ws = ctx.current;
  const [draftAi, readAi] = step === "draft" && !readOnly ? await Promise.all([loadAiAvailability(ctx, ws, "survey_draft").catch(() => null), loadAiAvailability(ctx, ws, "survey_read").catch(() => null)]) : [null, null];
  const aiOff = (a: typeof draftAi) => readOnly ?? (a ? a.disabledReason : "AI isn't available right now. Try again in a minute, or fill in the plan yourself on the Lots and Plan steps.");
  // The drafting assistant on the Plan step (stage 195, ADR 0210): why its AI is off here, if it is. Its local reader works regardless.
  const assistAi = step === "plan" && !readOnly && ctx.mode !== "demo" ? await loadAiAvailability(ctx, ws, "survey_assist").catch(() => null) : null;
  const assistantAiOff = ctx.mode === "demo" ? "The demo workspace is sample data, so the assistant's AI is off here." : (readOnly ?? (assistAi ? assistAi.disabledReason : "The assistant's AI isn't available right now."));
  // Earlier visits' instructions, for the assistant's drawer (read through RLS; none for the Sample or the demo).
  const historyClient = step === "plan" && !sample && ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const assistHistory = historyClient ? await loadAssistantHistory(historyClient, projectId) : [];
  // History's compare (stage 191): an earlier version against the latest, in words.
  const asked = step === "history" && !sample && sp.compare ? Number(sp.compare) : null;
  const compareWith = asked && Number.isInteger(asked) && asked !== data.drawing.version ? asked : null;
  const reader = compareWith ? await createSupabaseServerClient() : null;
  const earlier = compareWith && reader ? await loadSurveyDrawing(reader, projectId, compareWith) : null;
  const changes = earlier?.readable ? compareDocuments(earlier.document, doc, data.points) : null;
  const changeAreas = changes ? ([...new Set(changes.map((c) => c.area))] as ChangeArea[]) : [];
  const draftOff = data.points.length === 0 ? "Import the surveyed points first: the draft names lots by their corner points." : aiOff(draftAi);

  return (
    <div className="grid gap-6">
      <PageHeader title={data.project.name} description={`Land survey plan on ${crs?.name ?? data.project.crsId}. ${data.points.length} ${data.points.length === 1 ? "point" : "points"}, version ${data.drawing.version}.`} />
      <div className="flex flex-wrap items-center gap-2">
        {sample ? <StatusBadge status="simulated" label="Sample" /> : null}
        {approval ? <StatusBadge status="done" label={`Approved by surveyor, version ${approval.drawing_version}`} /> : <StatusBadge status="info" label="Draft" />}
        {sample ? null : data.project.crsConfirmedAt ? <StatusBadge status="verified" label="Coordinate system confirmed" /> : <StatusBadge status="unverified" label="Coordinate system not confirmed" />}
        {view.blocksExport.length > 0 ? <StatusBadge status="blocked" label={`${view.blocksExport.length} ${view.blocksExport.length === 1 ? "check stops" : "checks stop"} export`} /> : null}
      </div>
      {!data.drawing.readable ? <Notice tone="warning">This version&apos;s saved settings couldn&apos;t be read, so the plan shows defaults. Save a new version to replace it.</Notice> : null}

      <nav aria-label="Survey steps" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="flex w-max gap-1.5 rounded-full bg-canvas-2 p-1 ring-1 ring-line">
          {STEPS.map((s) => (
            <li key={s.id}>
              <Link
                href={`${base}?step=${s.id}`}
                aria-current={s.id === step ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-150 ${s.id === step ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
              >
                <s.icon size={16} weight="bold" aria-hidden />
                {s.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {step === "import" ? (
        <div className="grid gap-6">
          <Card>
            <CardTitle icon={FileArrowUpIcon}>Import points</CardTitle>
            <p className="mt-1 text-sm text-ink-2">Imported points are kept exactly as given and never edited. A corrected point is a new import with a new number.</p>
            <div className="mt-5">
              <ImportPanel projectId={projectId} crsId={data.project.crsId} crsName={crs?.name ?? data.project.crsId} codes={doc.codes} planHasLots={doc.lots.length > 0} known={data.points.map((p) => ({ pointId: p.pointId, e: p.e, n: p.n }))} readOnly={readOnly} />
            </div>
          </Card>
          <Card>
            <CardTitle icon={ClockCounterClockwiseIcon}>Imported files</CardTitle>
            {data.sources.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">Nothing imported yet.</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {data.sources.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium text-ink">{s.file_name}</span>
                    <span className="text-ink-2">
                      {s.point_count} {s.point_count === 1 ? "point" : "points"}
                    </span>
                    {sample ? null : <span className="font-mono text-xs text-ink-3">SHA-256 {s.sha256.slice(0, 12)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {step === "points" ? (
        <div className="grid gap-6">
        <Card>
          <CardTitle icon={MapPinSimpleIcon}>Points</CardTitle>
          <p className="mt-1 text-sm text-ink-2">
            Coordinates in metres, as imported. {data.points.length > POINTS_SHOWN ? `The first ${POINTS_SHOWN} of ${data.points.length} are shown; exports include every point.` : ""}
          </p>
          {data.points.length === 0 ? (
            <p className="mt-4 text-sm text-ink-2">No points yet. Import a file on the Import step.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-md ring-1 ring-line">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="bg-canvas-2 text-ink-2">
                  <tr>
                    <th scope="col" className="p-2 font-medium">Point</th>
                    <th scope="col" className="p-2 text-right font-medium">Easting</th>
                    <th scope="col" className="p-2 text-right font-medium">Northing</th>
                    <th scope="col" className="p-2 text-right font-medium">Elevation</th>
                    <th scope="col" className="p-2 font-medium">Code</th>
                  </tr>
                </thead>
                <tbody>
                  {data.points.slice(0, POINTS_SHOWN).map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="p-2 font-medium text-ink">{p.pointId}</td>
                      <td className="p-2 text-right font-mono tabular">{fmt(p.e, 3)}</td>
                      <td className="p-2 text-right font-mono tabular">{fmt(p.n, 3)}</td>
                      <td className="p-2 text-right font-mono tabular">{p.z === null ? "" : fmt(p.z, 3)}</td>
                      <td className="p-2 text-ink-2">{p.code ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {data.points.length >= 2 ? (
          <Card>
            <CardTitle icon={RulerIcon}>Bearing and distance between two points</CardTitle>
            <p className="mt-1 text-sm text-ink-2">A check by hand on any two points, such as a tie to a control mark or across a lot.</p>
            <div className="mt-4">
              <InverseTool points={data.points} />
            </div>
          </Card>
        ) : null}
        </div>
      ) : null}

      {(step === "draft" || step === "boundary") && data.points.length > 0 && doc.lots.length === 0 ? (
        <Card>
          <CardTitle icon={PolygonIcon}>Draw the plan from the points</CardTitle>
          <p className="mt-1 text-sm text-ink-2">
            Farbaek draws the lot through the boundary marks (CP, St and the other marks in your code list) in the order they were observed, the walls, fences and buildings from their field codes, and the road from edges coded RD1 and RD2. Everything it draws is marked for you to check before approval; no point moves.
          </p>
          <div className="mt-4">
            <DrawFromPoints projectId={projectId} readOnly={readOnly} />
          </div>
        </Card>
      ) : null}

      {step === "draft" ? (
        <DraftPanel
          key={data.drawing.version}
          projectId={projectId}
          baseVersion={data.drawing.version}
          document={doc}
          points={data.points}
          crsId={data.project.crsId}
          crsConfirmation={input.crsConfirmation}
          draftOff={draftOff}
          readOff={aiOff(readAi)}
          provider={readAi?.provider ?? null}
        />
      ) : null}

      {step === "boundary" ? (
        <Card>
          <CardTitle icon={PolygonIcon}>Lots, roads and adjoining lands</CardTitle>
          <p className="mt-1 text-sm text-ink-2">Type each lot&apos;s corner numbers in order. Areas, extents and road widths are computed from the coordinates as you type.</p>
          <div className="mt-5">
            {data.points.length === 0 ? <p className="text-sm text-ink-2">Import points first.</p> : <LotsEditor projectId={projectId} baseVersion={data.drawing.version} document={doc} points={data.points} readOnly={readOnly} />}
          </div>
        </Card>
      ) : null}
      {step === "boundary" && doc.lots.length > 0 ? (
        <Card>
          <CardTitle icon={ScissorsIcon}>Divide a lot into shares</CardTitle>
          <p className="mt-1 text-sm text-ink-2">For a sub division: where the dividing lines fall for the shares you give, and how far along the boundary to peg each new corner, worked out from your surveyed corners. Nothing here changes the plan.</p>
          <div className="mt-5">
            <PartitionPanel
              key={JSON.stringify(doc.rules)}
              projectId={projectId}
              lots={doc.lots}
              points={data.points}
              features={doc.features}
              perchDecimals={doc.settings.perchDecimals}
              planRules={doc.rules}
              blockOutHref={`${base}/export/blockout?version=${data.drawing.version}`}
              blockOutUnavailable={view.blocksData.length > 0 ? `${view.blocksData[0]!.message} ${view.blocksData[0]!.action}` : null}
            />
          </div>
        </Card>
      ) : null}

      {step === "plan" && (doc.lots.length > 0 || doc.roads.length > 0 || doc.features.length > 0) ? <ReviewChecklist doc={doc} findings={view.findings} base={base} approved={Boolean(approval)} /> : null}

      {step === "plan" ? (
        <AssistantProvider earlier={assistHistory}>
        <PlanEditor
          key={data.drawing.version}
          projectId={projectId}
          baseVersion={data.drawing.version}
          initialDocument={doc}
          points={data.points}
          crsId={data.project.crsId}
          crsConfirmation={input.crsConfirmation}
          surveyors={surveyors}
          approval={input.approval}
          approvedSurveyor={input.approval ? input.surveyor : null}
          readOnly={readOnly}
          assistantAiOff={assistantAiOff}
        />
        </AssistantProvider>
      ) : null}

      {step === "check" ? (
        <Card>
          <CardTitle icon={ListChecksIcon}>Checks</CardTitle>
          <p className="mt-1 text-sm text-ink-2">Every check on version {data.drawing.version}, most serious first. Passing them doesn&apos;t certify a plan: the surveyor reviews it and signs it.</p>
          <div className="mt-5">
            <FindingsList findings={view.findings} keep={{ projectId, baseVersion: data.drawing.version, readOnly }} />
          </div>
        </Card>
      ) : null}

      {step === "export" ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardTitle icon={DownloadSimpleIcon}>Files</CardTitle>
            {view.blocksExport.length > 0 ? (
              <div className="mt-4 grid gap-2">
                <p className="text-sm text-ink-2">{view.blocksData.length > 0 ? "The PDF, DXF and GeoJSON" : "The PDF and DXF"} can&apos;t be made until these are fixed:</p>
                <ul className="grid list-disc gap-1 pl-5 text-sm text-ink">
                  {view.blocksExport.map((f, i) => (
                    <li key={i}>{f.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 grid gap-2">
                <a href={`${base}/export/pdf?inline=1`} target="_blank" rel="noopener" className={buttonClasses("primary", "md", "justify-start")}>
                  <PrinterIcon size={20} aria-hidden />
                  Open the PDF to print
                </a>
                <a href={`${base}/export/pdf`} className={buttonClasses("secondary", "md", "justify-start")}>
                  <DownloadSimpleIcon size={20} aria-hidden />
                  Download the PDF
                </a>
                <a href={`${base}/export/dxf`} className={buttonClasses("secondary", "md", "justify-start")}>
                  <DownloadSimpleIcon size={20} aria-hidden />
                  DXF for CAD (R12, metres)
                </a>
              </div>
            )}
            <div className="mt-2 grid gap-2">
              <a href={`${base}/export/csv`} className={buttonClasses("ghost", "md", "justify-start")}>
                <DownloadSimpleIcon size={20} aria-hidden />
                Points as CSV
              </a>
              {view.blocksData.length === 0 ? (
                <>
                  <a href={`${base}/export/lots`} className={buttonClasses("ghost", "md", "justify-start")}>
                    <DownloadSimpleIcon size={20} aria-hidden />
                    Lot schedule as CSV (areas, hectares, A-R-P)
                  </a>
                  <a href={`${base}/export/geojson`} className={buttonClasses("ghost", "md", "justify-start")}>
                    <DownloadSimpleIcon size={20} aria-hidden />
                    Points and lots as GeoJSON
                  </a>
                </>
              ) : null}
            </div>
            <p className="mt-4 text-sm text-ink-3">
              Every file is made from version {data.drawing.version} and recorded with its fingerprint in this project&apos;s history.{approval ? "" : " Until the surveyor approves this version, the sheet says DRAFT."}
            </p>
          </Card>

          <div className="grid gap-6">
            <Card>
              <CardTitle icon={PrinterIcon}>Printing to scale</CardTitle>
              <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm text-ink-2">
                <li>
                  Print on {doc.settings.paper} {doc.settings.orientation}, at <span className="font-medium text-ink">100% or Actual size</span>. Fit to page changes the scale.
                </li>
                <li>Measure the 100 mm check line at the top of the drawing with a ruler. If it isn&apos;t 100 mm, the printer changed the scale.</li>
                <li>Sign the printed plan. In Farbaek, approval records the surveyor&apos;s review; the signature on paper is what certifies a plan.</li>
              </ol>
              {view.sheet.scale ? <p className="mt-3 text-sm text-ink-3">This sheet is drawn at 1:{fmt(view.sheet.scale, 0)}.</p> : null}
            </Card>

            <Card>
              <CardTitle icon={SealCheckIcon}>Surveyor&apos;s approval</CardTitle>
              <div className="mt-4 grid gap-3">
                {lapsed ? (
                  <Notice tone="warning">
                    {lapsed.reason === "crs_changed"
                      ? `The approval of version ${data.drawing.version} no longer applies: the project's coordinate system changed after it. The surveyor can review and approve it again.`
                      : `The approval of version ${data.drawing.version} no longer matches the plan computed now. Save a new version, then the surveyor can approve that one.`}
                  </Notice>
                ) : null}
                {approval ? (
                  <>
                    <StatusBadge status="done" label="Approved by surveyor" />
                    <p className="text-sm text-ink-2">
                      Version {approval.drawing_version} was approved by {String(approval.surveyor.name ?? "the surveyor")} on <LocalTime iso={approval.approved_at} date />.
                    </p>
                    <p className="font-mono text-xs text-ink-3 break-all">SHA-256 {approval.content_sha256}</p>
                  </>
                ) : sample ? (
                  <p className="text-sm text-ink-2">The Sample can&apos;t be approved: it isn&apos;t a real survey.</p>
                ) : !named ? (
                  <p className="text-sm text-ink-2">Choose the responsible surveyor in the Plan step. Only they can approve.</p>
                ) : named === me ? (
                  <ApproveForm projectId={projectId} version={data.drawing.version} disabledReason={readOnly ?? (lapsed?.reason === "content_changed" ? "Save a new version first: this one already has an approval that no longer matches." : view.blocksApproval.length > 0 ? `First: ${view.blocksApproval[0]!.message}` : null)} />
                ) : (
                  <>
                    <StatusBadge status="pending" label="Waiting" />
                    <p className="text-sm text-ink-2">Waiting for {personName(named, data.profiles, me)} to review and approve version {data.drawing.version}.</p>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {step === "history" ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {compareWith ? (
            <Card className="lg:col-span-2">
              <CardTitle icon={ArrowsLeftRightIcon}>
                Version {compareWith} to version {data.drawing.version}
              </CardTitle>
              {!earlier ? (
                <p className="mt-3 text-sm text-ink-2">Version {compareWith} couldn&apos;t be read.</p>
              ) : !earlier.readable ? (
                <p className="mt-3 text-sm text-ink-2">Version {compareWith}&apos;s saved settings couldn&apos;t be read, so it can&apos;t be compared.</p>
              ) : changes && changes.length === 0 ? (
                <p className="mt-3 text-sm text-ink-2">Nothing on the plan changed between these versions.</p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {changeAreas.map((area) => (
                    <section key={area} aria-label={area} className="grid content-start gap-1.5">
                      <h3 className="text-sm font-medium text-ink">{area}</h3>
                      <ul className="grid list-disc gap-1 pl-5 text-sm text-ink-2">
                        {changes!
                          .filter((c) => c.area === area)
                          .map((c, i) => (
                            <li key={i} className="break-words">
                              {c.text}
                            </li>
                          ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              <p className="mt-4 text-sm text-ink-3">Coordinates never change between versions: imported points are kept as given.</p>
            </Card>
          ) : null}
          <Card>
            <CardTitle icon={ClockCounterClockwiseIcon}>Versions</CardTitle>
            <ul className="mt-3 grid gap-2">
              {data.versions.map((v) => (
                <li key={v.version} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-ink">Version {v.version}</span>
                  <span className="text-ink-2">{v.note ?? "Saved"}</span>
                  <span className="text-ink-3">
                    {isoDate(v.createdAt)}, by {personName(v.createdBy, data.profiles, me)}
                  </span>
                  {versionApproval(v.version)}
                  {v.version !== data.drawing.version && !sample ? (
                    <Link href={`${base}?step=history&compare=${v.version}`} aria-current={compareWith === v.version ? "true" : undefined} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent underline-offset-4 hover:underline">
                      <ArrowsLeftRightIcon size={16} weight="bold" aria-hidden />
                      Compare with version {data.drawing.version}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle icon={DownloadSimpleIcon}>Exports</CardTitle>
            {data.exports.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">No files made yet.</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {data.exports.map((x, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium text-ink">{x.options["content"] === "lots" ? "Lot schedule" : x.options["content"] === "blockout" ? "Block-out plan" : x.kind.toUpperCase()}</span>
                    <span className="text-ink-2">version {x.drawing_version}</span>
                    <span className="text-ink-3">
                      {isoDate(x.created_at)}, by {personName(x.created_by, data.profiles, me)}
                    </span>
                    <span className="font-mono text-xs text-ink-3">{x.sha256.slice(0, 12)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {step === "settings" ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardTitle icon={GearSixIcon}>Project settings</CardTitle>
            <div className="mt-4">
              <SurveyProjectSettingsForm projectId={projectId} name={data.project.name} crsId={data.project.crsId} confirmed={Boolean(data.project.crsConfirmedAt)} disabledReason={readOnly} />
            </div>
          </Card>
          <Card>
            <CardTitle icon={ArchiveIcon}>Archive</CardTitle>
            <p className="mt-2 text-sm text-ink-2">An archived project leaves the list and takes no more edits. Its points, versions, approvals and history are kept.</p>
            {readOnly ? (
              <p className="mt-3 text-sm text-ink-3">{readOnly}</p>
            ) : (
              <form action={archiveSurveyProjectAction} className="mt-4">
                <input type="hidden" name="projectId" value={projectId} />
                <button type="submit" className={buttonClasses("secondary", "sm")}>
                  Archive this project
                </button>
              </form>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

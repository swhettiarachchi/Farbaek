"use server";

/**
 * Survey Studio's drafting assistant (ADR 0202). Both actions return a draft
 * to review, built on the latest saved version; neither saves anything. The
 * surveyor keeps it by saving it as a new version, which checks it again.
 */
import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AcceptedItem } from "@/core/survey/ai-draft";
import { sketchFileNames } from "@/core/survey/autosurvey/sketch";
import { pruneProvenance, surveyDocumentSchema, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { applySketch } from "@/core/survey/sketchintel/apply";
import { interpretDocument, sketchQuestionFindings } from "@/core/survey/sketchintel/findings";
import { createAnthropicSketchReader, type SketchImage } from "@/server/ai/sketch-reader";
import { createAnthropicSurveyDrafter, type ReadRequest } from "@/server/ai/survey-drafter";
import { aiForWorkspace } from "@/server/ai/workspace-ai";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { SURVEY_AI_DAILY } from "@/server/survey/assistant";
import { BRIEF_LIMITS, PHOTO_LIMITS, draftSurveyPlan, imageTypeOf, readSurveyPhotos, type SurveyDraftDeps } from "@/server/survey/drafting";
import { loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { JobTracker, loadJob } from "@/server/survey/jobs";
import { SKETCH_PHOTOS, readFieldSketches } from "@/server/survey/sketches";
import { SURVEY_MESSAGES, surveyStore } from "@/server/survey/store";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SurveyDraftState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; source: "ai_brief" | "ai_photo"; document: SurveyDocument; baseVersion: number; accepted: AcceptedItem[]; dropped: { what: string; why: string }[]; questions: string[]; model: string };

const uuid = z.string().uuid();

function recorder(admin: SupabaseClient): SurveyDraftDeps {
  return {
    async recordAiDraft(i) {
      const { error } = await admin.rpc("app_survey_record_ai_draft", { p_org: i.orgId, p_actor: i.actor, p_project: i.projectId, p_operation: i.operation, p_model: i.model.slice(0, 80), p_accepted: i.accepted, p_dropped: i.dropped, p_questions: i.questions });
      return error ? { ok: false, error: error.message } : { ok: true, value: null };
    },
  };
}

/** The signed-in contributor, the project's latest version (which must be the one on their screen), and the AI set up for the workspace. */
type Prepared =
  | { error: string }
  | {
      ai: { deps: ReturnType<typeof createSupabaseWriteDeps> & SurveyDraftDeps };
      source: { family: "anthropic"; create: (s: { model: string }) => ReturnType<typeof createAnthropicSurveyDrafter> };
      admin: SupabaseClient;
      user: SupabaseClient;
      client: Anthropic | undefined;
      data: SurveyProjectData;
      common: { orgId: string; userId: string; projectId: string; document: SurveyDocument; points: SurveyProjectData["points"] };
    };

async function prepare(projectId: string, baseVersion: number, label: string, kind: "draft" | "read"): Promise<Prepared> {
  if (!uuid.safeParse(projectId).success || !Number.isInteger(baseVersion)) return { error: SURVEY_MESSAGES.INVALID_REQUEST };
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { error: "The demo workspace is read-only, and its plan is sample data, so drafting is off here." };
  if (!ctx.current) return { error: "Create a workspace first." };
  if (!ctx.writes.enabled) return { error: ctx.writes.reason ?? SURVEY_MESSAGES.NOT_CONFIGURED };
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { error: SURVEY_MESSAGES.FORBIDDEN };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { error: SURVEY_MESSAGES.NOT_CONFIGURED };
  const orgId = ctx.current.id;
  const data: SurveyProjectData | null = await loadSurveyProject(user, orgId, projectId);
  if (!data) return { error: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== baseVersion) return { error: "A newer version of this plan was saved. Reload, then draft again." };
  if (!data.drawing.readable) return { error: "This version couldn't be read, so there's nothing to draft onto. Reload, or ask support." };
  if (kind === "draft" && data.points.length === 0) return { error: "Import the surveyed points first: the draft names lots by their corner points." };
  const deps = { ...createSupabaseWriteDeps(user, admin, ctx.user.id), ...recorder(admin) };
  const ai = await aiForWorkspace(orgId, deps, { timeout: 180_000, claudeOnly: label });
  if ("error" in ai) return { error: ai.error };
  // Free while it's tested (ADR 0212): a day's fair share for one person on Farbaek's key. A workspace's own key has no such limit.
  if (!ai.own) {
    const day = await admin.rpc("app_rate_limit", { p_key: `survey-${kind}-day:${ctx.user.id}`, p_window_seconds: 86_400, p_limit: SURVEY_AI_DAILY[kind] });
    if (day.error) return { error: "Drafting isn't available right now. Try again in a minute." };
    if (day.data !== true) return { error: `That's ${SURVEY_AI_DAILY[kind]} ${kind === "draft" ? "drafts" : "photo reads"} today, the most for one person while Survey Studio is being tested. It's back tomorrow; everything without AI still works.` };
  }
  const source = { family: "anthropic" as const, create: (s: { model: string }) => createAnthropicSurveyDrafter({ model: s.model, client: ai.client }) };
  return { ai, source, admin, user, client: ai.client, data, common: { orgId, userId: ctx.user.id, projectId, document: data.drawing.document, points: data.points } };
}

/** "Draft the plan": reads the surveyor's description into a draft to review. */
export async function draftSurveyPlanAction(input: { projectId: string; baseVersion: number; brief: string }): Promise<SurveyDraftState> {
  const brief = typeof input.brief === "string" ? input.brief : "";
  if (brief.length > BRIEF_LIMITS.max) return { status: "error", message: `Keep the description under ${BRIEF_LIMITS.max.toLocaleString("en-US")} characters.` };
  if (brief.trim().length < BRIEF_LIMITS.min) return { status: "error", message: "Describe the job first: the lots and their corner points, the land's name and where it is." };
  const p = await prepare(input.projectId, input.baseVersion, "Drafting survey plans", "draft");
  if ("error" in p) return { status: "error", message: p.error };
  const r = await draftSurveyPlan(p.ai.deps, p.source, { ...p.common, brief });
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "done", source: "ai_brief", baseVersion: p.data.drawing.version, ...r.value };
}

/** "Read an old plan": reads photos of an earlier plan or deed into the title. The photos aren't stored. */
export async function readOldPlanAction(form: FormData): Promise<SurveyDraftState> {
  const projectId = String(form.get("projectId") ?? "");
  const baseVersion = Number(form.get("baseVersion"));
  const files = form.getAll("photo").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (files.length < 1 || files.length > PHOTO_LIMITS.count) return { status: "error", message: `Choose one to ${PHOTO_LIMITS.count} photos.` };
  if (files.some((f) => f.size > PHOTO_LIMITS.bytes)) return { status: "error", message: "One of the photos is too large. Choose it again so Farbaek can shrink it." };
  const images: ReadRequest["images"] = [];
  for (const f of files) {
    const data = Buffer.from(await f.arrayBuffer());
    const mediaType = imageTypeOf(data);
    if (!mediaType) return { status: "error", message: "Use photos or scans saved as JPEG, PNG or WebP." };
    images.push({ mediaType, data });
  }
  const p = await prepare(projectId, baseVersion, "Reading old plans", "read");
  if ("error" in p) return { status: "error", message: p.error };
  const r = await readSurveyPhotos(p.ai.deps, p.source, { ...p.common, images });
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "done", source: "ai_photo", baseVersion: p.data.drawing.version, ...r.value };
}

export type SketchReadState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string; version: number; readings: number; unreadable: number; drawn?: number; questions?: number };

/**
 * AutoSurvey's sketch reading (stage 223, ADR 0234): Claude reads photos of the surveyor's field sketches into readings, as written,
 * saved with the plan as a new version. The plan's checks then compare each measurement with the coordinates. The photos go to
 * Anthropic only with the surveyor's say-so on this request. Farbaek keeps them with the project (ADR 0240), within its limits.
 */
export async function readSketchesAction(form: FormData): Promise<SketchReadState> {
  const r = await readSketches(form);
  // Generate Plan's job never stays open on a read that ended early (a limit, a bad photo, a refused request): its stage says why.
  if (r.status === "error") await closeSketchStage(String(form.get("jobId") ?? ""), String(form.get("projectId") ?? ""), r.message);
  return r;
}

async function closeSketchStage(jobId: string, projectId: string, message: string): Promise<void> {
  if (!jobId) return;
  try {
    const ctx = await loadAppContext();
    if (!ctx || ctx.mode !== "live" || !ctx.current || !ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return;
    const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
    if (!user || !admin) return;
    const job = await loadJob(user, jobId, projectId);
    if (!job || job.state !== "running") return;
    await JobTracker.resume(admin, ctx.current.id, job).stage("sketches", "failed", message);
  } catch {
    // The job is a record: it never stands in the way of the answer.
  }
}

async function readSketches(form: FormData): Promise<SketchReadState> {
  const projectId = String(form.get("projectId") ?? "");
  const baseVersion = Number(form.get("baseVersion"));
  if (form.get("consent") !== "yes") return { status: "error", message: "Sketches are read only when you agree to send their photos to Anthropic for reading." };
  const files = form.getAll("photo").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (files.length < 1 || files.length > SKETCH_PHOTOS.count) return { status: "error", message: `Choose one to ${SKETCH_PHOTOS.count} sketch photos.` };
  if (files.some((f) => f.size > SKETCH_PHOTOS.bytes) || files.reduce((s, f) => s + f.size, 0) > SKETCH_PHOTOS.total) {
    return { status: "error", message: "The sketch photos are too large together. Choose them again so Farbaek can shrink them." };
  }
  const images: SketchImage[] = [];
  // Each photo's name is its own: a phone camera names every shot "image.jpg", and a reading opens its photo by name.
  const names = sketchFileNames(files.map((f) => f.name));
  for (const [n, f] of files.entries()) {
    const data = Buffer.from(await f.arrayBuffer());
    const mediaType = imageTypeOf(data);
    if (!mediaType) return { status: "error", message: "Use sketch photos or scans saved as JPEG, PNG or WebP." };
    images.push({ name: names[n]!, mediaType, data });
  }
  const p = await prepare(projectId, baseVersion, "Reading field sketches", "read");
  if ("error" in p) return { status: "error", message: p.error };
  // Generate Plan's job, when this read is its last stage (ADR 0239): read through row-level security, so only the workspace's own.
  const jobRow = await loadJob(p.user, String(form.get("jobId") ?? ""), projectId);
  const job = jobRow && jobRow.state === "running" ? JobTracker.resume(p.admin, p.common.orgId, jobRow) : null;
  const end = async (state: "done" | "failed", detail: string) => job?.stage("sketches", state, detail);
  const source = { family: "anthropic" as const, create: (s: { model: string }) => createAnthropicSketchReader({ model: s.model, client: p.client }) };
  const r = await readFieldSketches(p.ai.deps, source, { orgId: p.common.orgId, userId: p.common.userId, projectId, images, now: new Date() });
  if (!r.ok) {
    await end("failed", r.message);
    return { status: "error", message: r.message };
  }
  const record = r.value;
  const photos = `${images.length} ${images.length === 1 ? "sketch" : "sketches"}`;
  const drawingParts = (record.drawing?.lines.length ?? 0) + (record.drawing?.symbols.length ?? 0) + (record.drawing?.areas.length ?? 0);
  // Nothing read for certain is no reason for a new version, and earlier readings stay as they were.
  if (record.readings.length === 0 && drawingParts === 0) await end("done", "Nothing on the photos could be read.");
  if (record.readings.length === 0 && drawingParts === 0) return { status: "done", message: `Nothing on the ${photos} could be read, so the plan wasn't changed.`, version: baseVersion, readings: 0, unreadable: record.unreadable.length };
  // New readings replace earlier ones, and with them any "keep as surveyed" answers to the earlier ones. The drawing's proposals
  // (ADR 0249) are put on the plan in the same version, each waiting for the surveyor: positions all come from the surveyed points.
  let drawn = 0;
  let asked = 0;
  const withReadings = (document: SurveyDocument, points: readonly SurveyPoint[]) => {
    const base = pruneProvenance({ ...document, sketch: record, kept: document.kept.filter((k) => !k.startsWith("sketch:")) });
    const interpretation = interpretDocument(base, points);
    if (!interpretation) return base;
    const applied = applySketch(base, interpretation);
    drawn = applied.added.length;
    // Only the questions the plan's checks show: those already answered, or beyond the checks' limit, aren't counted.
    asked = sketchQuestionFindings(interpretDocument(applied.document, points), applied.document).length;
    return applied.document;
  };
  const actor = { orgId: p.common.orgId, userId: p.common.userId };
  const next = withReadings(p.data.drawing.document, p.data.points);
  // Said from the version actually saved: the retry below works the drawing out again on the newest version.
  const noteFor = () => `Read ${photos} with Claude: ${record.readings.length} things as written${drawn > 0 ? `, ${drawn} drawn from the sketch` : ""}`.slice(0, 200);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: "The readings didn't pass the plan's own checks, so nothing was saved." };
  let saved = await surveyStore.saveDrawing(p.admin, actor, { projectId, baseVersion, document: next, note: noteFor() });
  if (!saved.ok) {
    // Reading can take minutes, and the plan may have been saved meanwhile. The readings touch nothing else in it, so they go onto
    // the newest version once, rather than being lost after the read was counted.
    const latest = await loadSurveyProject(p.user, p.common.orgId, projectId);
    if (latest && latest.drawing.readable && latest.drawing.version !== baseVersion) {
      const again = withReadings(latest.drawing.document, latest.points);
      if (surveyDocumentSchema.safeParse(again).success) saved = await surveyStore.saveDrawing(p.admin, actor, { projectId, baseVersion: latest.drawing.version, document: again, note: noteFor() });
    }
  }
  if (!saved.ok) {
    await end("failed", `Read, but not saved: ${saved.message}`);
    return { status: "error", message: `The sketches were read, but the readings couldn't be saved: ${saved.message}` };
  }
  // The photos read, kept with the plan so each reading can be seen beside its evidence (ADR 0240). Keeping them never undoes the
  // reading: if they can't be kept (the v103 migration not applied, the project's 50 MB used), the readings stand and that is said.
  const kept = await surveyStore
    .keepSketches(p.admin, actor, { projectId, readAt: record.readAt, photos: images.map((im) => ({ name: im.name, mime: im.mediaType, sha256: createHash("sha256").update(im.data).digest("hex"), content: im.data.toString("base64") })) })
    .catch(() => null);
  const keptNote = kept?.ok ? "" : " The photos couldn't be kept with the plan, so they aren't shown beside the readings.";
  const fromDrawing = drawn > 0 ? ` ${drawn} ${drawn === 1 ? "item was" : "items were"} drawn from the sketch, each waiting for your confirmation.` : "";
  const questions = asked > 0 ? ` ${asked} ${asked === 1 ? "question" : "questions"} the sketch couldn't settle ${asked === 1 ? "is" : "are"} in the checks.` : "";
  await end("done", `${record.readings.length} things read${drawn > 0 ? `, ${drawn} drawn from the sketch` : ""}, saved as version ${saved.value}.${keptNote}`);
  revalidatePath(`/app/survey/${projectId}`);
  return { status: "done", message: `Read ${record.readings.length} things from the ${photos}, saved as version ${saved.value}.${fromDrawing}${questions}${keptNote}`, version: saved.value, readings: record.readings.length, unreadable: record.unreadable.length, drawn, questions: asked };
}

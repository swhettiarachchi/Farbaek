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
import { applyReview, type AcceptedItem } from "@/core/survey/ai-draft";
import { saveSurveyDrawingAction } from "./actions";
import { sketchFileNames, sketchTooSmall } from "@/core/survey/autosurvey/sketch";
import { pruneProvenance, surveyDocumentSchema, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { applySketch, withoutWaitingSketchItems } from "@/core/survey/sketchintel/apply";
import { withAutoCorrections } from "@/core/survey/sketchintel/correct";
import { interpretDocument, looksLikeAnotherJob, sketchQuestionFindings, strangeNumbers } from "@/core/survey/sketchintel/findings";
import { createAnthropicSketchReader, type SketchImage } from "@/server/ai/sketch-reader";
import { createAnthropicSurveyDrafter, type ReadRequest } from "@/server/ai/survey-drafter";
import { aiForWorkspace } from "@/server/ai/workspace-ai";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { surveyAiDaily } from "@/server/survey/assistant";
import { BRIEF_LIMITS, PHOTO_LIMITS, draftSurveyPlan, imageTypeOf, pdfPages, readSurveyPhotos, scanLimit, scanTypeOf, type SurveyDraftDeps } from "@/server/survey/drafting";
import { loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { JobTracker, loadJob } from "@/server/survey/jobs";
import { SKETCH_PHOTOS, checkPlanAgainstSketch, readFieldSketches } from "@/server/survey/sketches";
import { checkItems, type SketchCheck } from "@/core/survey/sketchintel/verify";
import { withSecondReading } from "@/core/survey/sketchintel/second-reading";
import { imageSize } from "@/core/chat/files";
import { createAnthropicSketchChecker } from "@/server/ai/sketch-checker";
import { loadSketchPhotos, readSketchPhoto } from "@/server/survey/sketch-photos";
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
    const daily = surveyAiDaily()[kind];
    const day = await admin.rpc("app_rate_limit", { p_key: `survey-${kind}-day:${ctx.user.id}`, p_window_seconds: 86_400, p_limit: daily });
    if (day.error) return { error: "Drafting isn't available right now. Try again in a minute." };
    if (day.data !== true) return { error: `That's ${daily} ${kind === "draft" ? "drafts" : "photo reads"} today, the most for one person while Survey Studio is being tested. It's back tomorrow; everything without AI still works.` };
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

/**
 * The photos or scanned PDFs of an earlier plan or deed sent with a read (stage 296), checked by their own bytes: each a JPEG, PNG or
 * WebP photo within its size, or a PDF within its own; at most three, and within what one request carries together.
 */
async function scansOf(form: FormData, what: string): Promise<{ images: ReadRequest["images"] } | { error: string }> {
  const files = form.getAll("photo").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (files.length < 1 || files.length > PHOTO_LIMITS.count) return { error: `Choose one to ${PHOTO_LIMITS.count} photos or PDF scans of ${what}.` };
  if (files.reduce((sum, f) => sum + f.size, 0) > PHOTO_LIMITS.totalBytes) return { error: "The photos and scans are too large together. Send fewer, or smaller scans." };
  const images: ReadRequest["images"] = [];
  for (const f of files) {
    const data = Buffer.from(await f.arrayBuffer());
    const mediaType = scanTypeOf(data);
    if (!mediaType) return { error: "Use photos saved as JPEG, PNG or WebP, or scans saved as PDF." };
    if (data.length > scanLimit(mediaType)) return { error: mediaType === "application/pdf" ? `A PDF scan can be up to ${PHOTO_LIMITS.pdfBytes / 1_000_000} MB. Scan it at a lower resolution, or photograph the pages.` : "One of the photos is too large. Choose it again so Farbaek can shrink it." };
    // Checked before the day's allowance is touched: a long PDF is refused here, not after.
    if (mediaType === "application/pdf" && pdfPages(data) > PHOTO_LIMITS.pdfPages) return { error: `A PDF scan can have up to ${PHOTO_LIMITS.pdfPages} pages. Send only the pages with the title, the place and the boundaries.` };
    images.push({ mediaType, data });
  }
  return { images };
}

/** "Read an old plan": reads photos or scanned PDFs of an earlier plan or deed into the title. They aren't stored. */
export async function readOldPlanAction(form: FormData): Promise<SurveyDraftState> {
  const projectId = String(form.get("projectId") ?? "");
  const baseVersion = Number(form.get("baseVersion"));
  const scans = await scansOf(form, "the old plan or deed");
  if ("error" in scans) return { status: "error", message: scans.error };
  const { images } = scans;
  const p = await prepare(projectId, baseVersion, "Reading old plans", "read");
  if ("error" in p) return { status: "error", message: p.error };
  const r = await readSurveyPhotos(p.ai.deps, p.source, { ...p.common, images });
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "done", source: "ai_photo", baseVersion: p.data.drawing.version, ...r.value };
}

export type TitleReadState = { status: "error"; message: string } | { status: "done"; message: string; version: number; filled: number };

/**
 * AutoSurvey's start (stage 294): photos of the deed or an earlier plan, chosen with the survey files, are read into the plan's title
 * as soon as the plan is drawn, with the surveyor's say-so on this request. It's "Read an old plan" with every fact kept: each waits
 * for the surveyor's confirmation on the Plan step, as it would after the Draft step's review, and is saved through the same save. Only
 * what the photo states is taken, never points or measurements, and the photos aren't kept.
 */
export async function readTitleIntoPlanAction(form: FormData): Promise<TitleReadState> {
  if (form.get("consent") !== "yes") return { status: "error", message: "The deed or old plan is read only when you agree to send its photos to Anthropic for reading." };
  const projectId = String(form.get("projectId") ?? "");
  const baseVersion = Number(form.get("baseVersion"));
  const scans = await scansOf(form, "the deed or old plan");
  if ("error" in scans) return { status: "error", message: scans.error };
  const { images } = scans;
  const p = await prepare(projectId, baseVersion, "Reading old plans", "read");
  if ("error" in p) return { status: "error", message: p.error };
  const r = await readSurveyPhotos(p.ai.deps, p.source, { ...p.common, images });
  if (!r.ok) return { status: "error", message: r.message };
  if (r.value.accepted.length === 0) return { status: "done", message: "Nothing on the deed or old plan could be read into the title, so the plan wasn't changed.", version: baseVersion, filled: 0 };
  // Everything read kept, nothing yet confirmed: the same plan the Draft step saves when the surveyor keeps it all.
  const reviewed = applyReview(p.data.drawing.document, r.value, { removed: new Set(), confirmed: new Set() });
  const n = r.value.accepted.length;
  const saved = await saveSurveyDrawingAction({ projectId, baseVersion, document: reviewed, note: `Title read from a photo of the deed or an old plan: ${n} ${n === 1 ? "fact" : "facts"}` });
  if (saved.status !== "done" || saved.version === undefined) return { status: "error", message: saved.status === "error" ? saved.message : "The title couldn't be saved." };
  return { status: "done", message: `${n} ${n === 1 ? "fact" : "facts"} read into the title from the deed or old plan, each waiting for you to confirm it.`, version: saved.version, filled: n };
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
    // Too small to read (stage 303): never sent, whatever the browser did. A sketch's numbers would come back guessed.
    const size = imageSize(new Uint8Array(data));
    const small = size ? sketchTooSmall(size.width, size.height, names[n]!) : null;
    if (small) return { status: "error", message: small };
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
  let corrected: string[] = [];
  const withReadings = (document: SurveyDocument, points: readonly SurveyPoint[]) => {
    // What an earlier read drew and nobody has confirmed goes: the new read draws what it reads (stage 256). The surveyor's own stays.
    // A new read's check answers for itself: the earlier answers to readings and to a check go with them (stage 263).
    const read = pruneProvenance({ ...withoutWaitingSketchItems(document), sketch: record, kept: document.kept.filter((k) => !k.startsWith("sketch:") && !k.startsWith("check:") && !k.startsWith("left:") && !k.startsWith("join:")) });
    // The plain misreads the engine would offer to correct in one press are corrected now, as Farbaek's, before anything is drawn, when
    // that helps (ADR 0260): what they draw waits for the surveyor as everything from a sketch does, and each is put back in one press.
    const auto = withAutoCorrections(read, points, new Date());
    corrected = auto.corrections.map((c) => `${c.label} as ${c.to}`);
    const base: SurveyDocument = auto.document;
    const interpretation = interpretDocument(base, points);
    if (!interpretation) return base;
    const applied = applySketch(base, interpretation);
    drawn = applied.added.length;
    // Only the questions the plan's checks show: those already answered, or beyond the checks' limit, aren't counted.
    asked = sketchQuestionFindings(interpretDocument(applied.document, points), applied.document).length;
    return applied.document;
  };
  const actor = { orgId: p.common.orgId, userId: p.common.userId };
  const drafted = withReadings(p.data.drawing.document, p.data.points);
  // An independent check of what was just drawn against the same photos (stage 263, ADR 0271): its verdicts go with the sketch's record,
  // which only reading writes. A check that doesn't run leaves the read as it is, and that's said.
  let check: SketchCheck | null = null;
  let checkNote = "";
  const items = checkItems(drafted, p.data.points);
  if (items.length > 0) {
    const checkSource = { family: "anthropic" as const, create: (s: { model: string }) => createAnthropicSketchChecker({ model: s.model, client: p.client }) };
    const c = await checkPlanAgainstSketch(p.ai.deps, checkSource, { orgId: p.common.orgId, userId: p.common.userId, projectId, images, items, now: new Date() });
    if (c.ok) check = c.value;
    else checkNote = ` ${c.message}`;
  }
  // The check's verdicts, and what they correct by themselves (stage 302, ADR 0308): a line drawn from one doubtful read that the check
  // doesn't find drawn is left out, and what it drew redrawn, each said on the plan with a press to put it back.
  let leftOut = 0;
  const withCheck = (d: SurveyDocument, pts: readonly SurveyPoint[]): SurveyDocument => {
    if (!check || !d.sketch) return d;
    const second = withSecondReading({ ...d, sketch: { ...d.sketch, check } }, pts, new Date());
    leftOut = second.leftOut.length;
    // What the read says it drew and asks is said of the plan as saved, after the second reading's corrections.
    if (leftOut > 0) {
      drawn = Math.max(0, drawn + second.added.length - second.removed.length);
      asked = sketchQuestionFindings(interpretDocument(second.document, pts), second.document).length;
    }
    return second.document;
  };
  const next = withCheck(drafted, p.data.points);
  // Said from the version actually saved: the retry below works the drawing out again on the newest version.
  const noteFor = () => `Read ${photos} with Claude: ${record.readings.length} things as written${drawn > 0 ? `, ${drawn} drawn from the sketch` : ""}${corrected.length > 0 ? `; Farbaek read ${corrected.join(" and ")}` : ""}${check ? "; checked against the sketch" : ""}${leftOut > 0 ? `; left out ${leftOut} ${leftOut === 1 ? "line" : "lines"} the check doesn't find` : ""}`.slice(0, 200);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: "The readings didn't pass the plan's own checks, so nothing was saved." };
  let saved = await surveyStore.saveDrawing(p.admin, actor, { projectId, baseVersion, document: next, note: noteFor() });
  if (!saved.ok) {
    // Reading can take minutes, and the plan may have been saved meanwhile. The readings touch nothing else in it, so they go onto
    // the newest version once, rather than being lost after the read was counted.
    const latest = await loadSurveyProject(p.user, p.common.orgId, projectId);
    if (latest && latest.drawing.readable && latest.drawing.version !== baseVersion) {
      const again = withCheck(withReadings(latest.drawing.document, latest.points), latest.points);
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
  const fixed = corrected.length > 0 ? ` Farbaek read ${corrected.join(" and ")}, from where ${corrected.length === 1 ? "it's" : "they're"} written: check ${corrected.length === 1 ? "it" : "them"} on the plan.` : "";
  const questions = asked > 0 ? ` ${asked} ${asked === 1 ? "question" : "questions"} the sketch couldn't settle ${asked === 1 ? "is" : "are"} in the checks.` : "";
  // A sketch that may be another job's (stage 303): said in the read's own answer, before anything else.
  const odd = strangeNumbers(interpretDocument(next, p.data.points));
  const otherJob = looksLikeAnotherJob(odd) ? ` ${odd.strange.length} of the ${odd.total} numbers on it aren't in your survey files: it may be another job's sketch, or too unclear to read. The plan says which, so you can read the right one.` : "";
  const checked = check ? ` ${checkSummary(check)}${leftOut > 0 ? ` Farbaek left out ${leftOut} ${leftOut === 1 ? "line" : "lines"} read once with doubt that the check doesn't find drawn, and redrew the plan without ${leftOut === 1 ? "it" : "them"}: put ${leftOut === 1 ? "it" : "any"} back in one press.` : ""}` : checkNote;
  await end("done", `${record.readings.length} things read${drawn > 0 ? `, ${drawn} drawn from the sketch` : ""}, saved as version ${saved.value}.${keptNote}`);
  revalidatePath(`/app/survey/${projectId}`);
  return { status: "done", message: `Read ${record.readings.length} things from the ${photos}, saved as version ${saved.value}.${otherJob}${fromDrawing}${fixed}${questions}${checked}${keptNote}`, version: saved.value, readings: record.readings.length, unreadable: record.unreadable.length, drawn, questions: asked };
}

/** What a check found, in a sentence (ADR 0271). */
function checkSummary(check: SketchCheck): string {
  const doubted = check.items.filter((v) => v.verdict !== "drawn").length;
  const drawnSo = check.items.length - doubted;
  const parts = [`${drawnSo} of ${check.items.length} ${check.items.length === 1 ? "item" : "items"} drawn so there`];
  if (doubted > 0) parts.push(`${doubted} doubted`);
  if (check.missing.length > 0) parts.push(`${check.missing.length} ${check.missing.length === 1 ? "line" : "lines"} on the sketch not on the plan`);
  return `Farbaek checked the plan against the sketch: ${parts.join(", ")}. What it doubts is in the checks.`;
}

export type SketchCheckState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string; version: number };

/**
 * "Check against the sketch again" (stage 263, ADR 0271): the photos kept with the plan's last read are checked once more against the
 * plan as it is now, after the surveyor's corrections. The photos go to Anthropic again only with the surveyor's say-so on this request.
 * The verdicts replace the last check's, saved as a new version; nothing else changes.
 */
export async function checkSketchAgainAction(form: FormData): Promise<SketchCheckState> {
  const projectId = String(form.get("projectId") ?? "");
  const baseVersion = Number(form.get("baseVersion"));
  if (form.get("consent") !== "yes") return { status: "error", message: "The plan is checked only when you agree to send the sketch photos to Anthropic again." };
  const p = await prepare(projectId, baseVersion, "Checking the plan against the sketch", "read");
  if ("error" in p) return { status: "error", message: p.error };
  const doc = p.data.drawing.document;
  const record = doc.sketch;
  if (!record) return { status: "error", message: "The sketches haven't been read for this plan yet: read them first." };
  const kept = await loadSketchPhotos(p.user, projectId, record.readAt);
  const images: SketchImage[] = [];
  for (const photo of kept.slice(0, SKETCH_PHOTOS.count)) {
    const got = await readSketchPhoto(p.user, projectId, photo.id);
    if (!got) continue;
    const data = Buffer.from(got.content, "base64");
    const mediaType = imageTypeOf(data);
    if (mediaType) images.push({ name: photo.fileName, mediaType, data });
  }
  if (images.length === 0) return { status: "error", message: "The photos of the last read weren't kept with the plan, so it can't be checked against them. Read the sketches again." };
  const items = checkItems(doc, p.data.points);
  const checkSource = { family: "anthropic" as const, create: (s: { model: string }) => createAnthropicSketchChecker({ model: s.model, client: p.client }) };
  const c = await checkPlanAgainstSketch(p.ai.deps, checkSource, { orgId: p.common.orgId, userId: p.common.userId, projectId, images, items, now: new Date() });
  if (!c.ok) return { status: "error", message: c.message };
  // The new check answers for itself: answers to the last check's doubts go.
  const withCheck = (d: SurveyDocument): SurveyDocument => ({ ...d, kept: d.kept.filter((k) => !k.startsWith("check:")), sketch: d.sketch ? { ...d.sketch, check: c.value } : d.sketch });
  const next = withCheck(doc);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: "The check didn't pass the plan's own checks, so nothing was saved." };
  const actor = { orgId: p.common.orgId, userId: p.common.userId };
  let saved = await surveyStore.saveDrawing(p.admin, actor, { projectId, baseVersion, document: next, note: "Checked the plan against the sketch" });
  if (!saved.ok) {
    // The plan was saved while it was checked: the verdicts are kept by item and points, so they go onto the newest version once, if it
    // is still the same read, rather than being lost after the check was counted.
    const latest = await loadSurveyProject(p.user, p.common.orgId, projectId);
    if (latest && latest.drawing.readable && latest.drawing.version !== baseVersion && latest.drawing.document.sketch?.readAt === record.readAt) {
      const again = withCheck(latest.drawing.document);
      if (surveyDocumentSchema.safeParse(again).success) saved = await surveyStore.saveDrawing(p.admin, actor, { projectId, baseVersion: latest.drawing.version, document: again, note: "Checked the plan against the sketch" });
    }
  }
  if (!saved.ok) return { status: "error", message: `The plan was checked, but the result couldn't be saved: ${saved.message}` };
  revalidatePath(`/app/survey/${projectId}`);
  return { status: "done", message: `${checkSummary(c.value)} Saved as version ${saved.value}.`, version: saved.value };
}

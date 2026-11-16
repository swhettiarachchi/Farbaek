"use server";

/**
 * Survey Studio's drafting assistant (ADR 0202). Both actions return a draft
 * to review, built on the latest saved version; neither saves anything. The
 * surveyor keeps it by saving it as a new version, which checks it again.
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AcceptedItem } from "@/core/survey/ai-draft";
import type { SurveyDocument } from "@/core/survey/document";
import { createAnthropicSurveyDrafter, type ReadRequest } from "@/server/ai/survey-drafter";
import { aiForWorkspace } from "@/server/ai/workspace-ai";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { SURVEY_AI_DAILY } from "@/server/survey/assistant";
import { BRIEF_LIMITS, PHOTO_LIMITS, draftSurveyPlan, imageTypeOf, readSurveyPhotos, type SurveyDraftDeps } from "@/server/survey/drafting";
import { loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { SURVEY_MESSAGES } from "@/server/survey/store";
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
  return { ai, source, data, common: { orgId, userId: ctx.user.id, projectId, document: data.drawing.document, points: data.points } };
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

import { z } from "zod";
import { LANGUAGES } from "@/core/survey/assistant/languages";
import { surveyDocumentSchema, usedPointIds } from "@/core/survey/document";
import { createAnthropicSurveyAssistant } from "@/server/ai/survey-assistant";
import { aiForWorkspace } from "@/server/ai/workspace-ai";
import { readTextCapped } from "@/server/http/body";
import { sameOrigin } from "@/server/sandbox/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { ASSIST_LIMITS, runAssistant, type SurveyAssistDeps } from "@/server/survey/assistant";
import { loadSurveyProject } from "@/server/survey/read";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const dynamic = "force-dynamic";

/** A plan's JSON plus the instruction: the editor's whole document can be large, so up to 1.5 MB. */
const MAX_BODY = 1_500_000;

const Body = z.object({
  words: z.string().min(1).max(ASSIST_LIMITS.words),
  // Every language in the registry: a typed Tamil instruction is answered too, though Tamil speech isn't on yet.
  lang: z.enum(LANGUAGES.map((l) => l.id) as ["en", "si", "ta"]),
  inputMethod: z.enum(["voice", "typed"]),
  document: z.unknown(),
  selection: z.array(z.string().max(120)).max(500),
  recent: z.array(z.string().max(300)).max(ASSIST_LIMITS.recent),
});

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const refuse = (message: string, status: number) => json({ ok: false, message }, status);

/**
 * One instruction to the drafting assistant's model (stage 195, ADR 0210). A route rather than a server action, so Stop in the browser
 * aborts the model call (request.signal) and the turn is refunded. It's a cookie write, so it must come from Farbaek's own pages. The
 * plan in the body is the editor's own, unsaved edits included: it's checked against the document schema and may only use the
 * project's points; the points themselves and everything else come from the database. Nothing is saved to the plan here.
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!sameOrigin(request)) return refuse("This request didn't come from Farbaek.", 403);
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) return refuse("That project doesn't exist or isn't in this workspace.", 404);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return refuse("That instruction couldn't be read.", 400);

  const ctx = await loadAppContext();
  if (!ctx) return refuse("You're signed out. Sign in, then try again.", 401);
  if (ctx.mode === "demo") return refuse("The demo workspace is sample data, so the assistant's AI is off here. Zooming, layers, the paper and the area still work.", 403);
  if (!ctx.current) return refuse("Create a workspace first.", 403);
  if (!ctx.writes.enabled) return refuse(ctx.writes.reason ?? "Changes are off for this workspace right now.", 403);
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return refuse("Viewers can look at the plan but can't change it.", 403);

  const text = await readTextCapped(request, MAX_BODY);
  if (text === null) return refuse("This plan is too large to send with an instruction. Save it, then try again.", 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const body = Body.safeParse(raw);
  if (!body.success) return refuse("That instruction couldn't be read.", 400);
  const doc = surveyDocumentSchema.safeParse(body.data.document);
  if (!doc.success) return refuse("The plan on this screen couldn't be read. Reload the page, then try again.", 400);

  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return refuse("Survey Studio isn't set up on this server.", 503);
  const orgId = ctx.current.id;
  const data = await loadSurveyProject(user, orgId, projectId);
  if (!data) return refuse("That project doesn't exist or isn't in this workspace.", 404);
  // The plan may only use this project's own points.
  const ids = new Set(data.points.map((p) => p.id));
  if ([...usedPointIds(doc.data)].some((id) => !ids.has(id))) return refuse("The plan on this screen uses points that aren't this project's. Reload the page, then try again.", 400);

  const limit = await admin.rpc("app_rate_limit", { p_key: `survey-assist:${ctx.user.id}`, p_window_seconds: 60, p_limit: 20 });
  if (limit.error) return refuse("The assistant isn't available right now. Try again in a minute.", 503);
  if (limit.data !== true) return refuse("That's many instructions in a minute. Wait a moment, then carry on.", 429);

  const recorder: SurveyAssistDeps = {
    async recordAssistTurn(i) {
      const { data: id, error } = await admin.rpc("app_survey_record_assistant_turn", {
        p_org: i.orgId,
        p_actor: i.actor,
        p_project: i.projectId,
        p_lang: i.lang,
        p_input: i.inputMethod,
        p_words: i.words,
        p_reply: i.reply.slice(0, 400),
        p_operations: i.operations,
        p_dropped: i.dropped,
        p_outcome: i.outcome,
        p_model: i.model.slice(0, 80),
      });
      return error || typeof id !== "string" ? { ok: false, error: error?.message ?? "no id" } : { ok: true, value: id };
    },
  };
  const deps = { ...createSupabaseWriteDeps(user, admin, ctx.user.id), ...recorder };
  const ai = await aiForWorkspace(orgId, deps, { timeout: 20_000, claudeOnly: "The drafting assistant's AI" });
  if ("error" in ai) return refuse(ai.error, 503);
  const source = { family: "anthropic" as const, create: (s: { model: string }) => createAnthropicSurveyAssistant({ model: s.model, client: ai.client }) };
  const r = await runAssistant(
    ai.deps,
    source,
    { orgId, userId: ctx.user.id, projectId, document: doc.data, points: data.points, selection: body.data.selection, words: body.data.words, lang: body.data.lang, inputMethod: body.data.inputMethod, recent: body.data.recent },
    request.signal,
  );
  if (!r.ok) {
    const status =
      r.code === "AI_BUSY" || r.code === "ENTITLEMENT_UNAVAILABLE" || r.code === "PAUSED_BY_FARBAEK"
        ? 503
        : r.code === "FORBIDDEN" || r.code === "WORKSPACE_SUSPENDED" || r.code === "FEATURE_NOT_IN_PLAN"
          ? 403
          : r.code === "QUOTA_EXCEEDED" || r.code === "TRIAL_CAP_REACHED" || r.code === "BILLING_SUSPENDED"
            ? 402
            : r.code === "PLATFORM_DAILY_LIMIT"
              ? 429
              : r.code === "INVALID_REQUEST"
                ? 400
                : 502;
    return refuse(r.message, status);
  }
  return json({ ok: true, turnId: r.value.turnId, output: r.value.output, model: r.value.model });
}

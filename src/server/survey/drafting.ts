/**
 * Survey Studio's AI drafting, metered (stage 191, ADR 0202): "Draft the
 * plan" reads the surveyor's description (survey_draft), "Read an old plan"
 * reads photos of an earlier plan or deed (survey_read). Each reserves usage
 * first, is refunded if the call fails, and is checked item by item by
 * `acceptDraft` before anything is shown. Nothing is saved here: the draft
 * goes back to the screen, where the surveyor saves it as a new version if
 * they want it. One audit event records the run, with counts only.
 */
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { acceptDraft, rawTokens, type DraftResult } from "@/core/survey/ai-draft";
import { surveyDocumentSchema, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { routeModel } from "@/server/ai/routing";
import { SURVEY_DRAFT_PROMPT, SURVEY_READ_PROMPT, SURVEY_READ_TOKENS_PER_IMAGE, surveyDraftMessage, surveyReadMessage, type DraftRequest, type ReadRequest, type SurveyDraftOutcome, type SurveyDrafter } from "@/server/ai/survey-drafter";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type ModelSource } from "@/server/workspace/ai-usage";
import { fail, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "@/server/workspace/use-cases";

export const MANUAL_SURVEY_DRAFT = "Add the lots on the Lots step and fill in the title on the Plan step yourself: everything works without AI.";
export const MANUAL_SURVEY_READ = "Type the earlier plan's details into the title on the Plan step yourself.";

export const BRIEF_LIMITS = { min: 20, max: 4_000 } as const;
export const PHOTO_LIMITS = { count: 3, bytes: 1_800_000 } as const;

export interface SurveyDraftDeps {
  recordAiDraft(input: { orgId: string; actor: string; projectId: string; operation: "survey_draft" | "survey_read"; model: string; accepted: number; dropped: number; questions: number }): Promise<RpcResult<null>>;
}

type Deps = WriteDeps & AiUsageDeps & SurveyDraftDeps;

const FAILURES = {
  REFUSED: "The AI declined to read this, so it wasn't counted.",
  INCOMPLETE: "The draft came back incomplete, so it wasn't counted. Try again.",
  PROVIDER_BUSY: "The AI provider is busy, so it wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The draft didn't finish, so it wasn't counted. Try again.",
} as const;

export type SurveyDraftValue = DraftResult & { model: string };

interface Common {
  orgId: string;
  userId: string;
  projectId: string;
  document: SurveyDocument;
  points: readonly SurveyPoint[];
}

/** Only the points the brief names go to the model: the draft may use no others, and the rest are none of its business. */
export function namedPoints(brief: string, points: readonly SurveyPoint[]): DraftRequest["points"] {
  const words = new Set(rawTokens(brief).map((t) => t.toLowerCase()));
  return points.filter((p) => words.has(p.pointId.trim().toLowerCase())).slice(0, 1_000).map((p) => ({ number: p.pointId, code: p.code }));
}

async function run(
  deps: Deps,
  source: ModelSource<SurveyDrafter>,
  input: Common & { operation: "survey_draft" | "survey_read"; promptTokens: number; manual: string },
  call: (drafter: SurveyDrafter) => Promise<SurveyDraftOutcome>,
  check: (outcome: Extract<SurveyDraftOutcome, { ok: true }>) => DraftResult,
): Promise<WriteResult<SurveyDraftValue>> {
  const billing = await resolvePlan(deps, input.orgId);
  if (!billing.ok) return billing;
  const drafter = source.create(routeModel({ plan: billing.value.plan, family: source.family, step: "review", effort: "balanced" }));
  const units = reserveUnits(drafter.model, input.promptTokens + 500, drafter.maxOutputTokens);
  const reserved = await reserveUsage(deps, { orgId: input.orgId, userId: input.userId, taskId: null, operation: input.operation, units, manual: input.manual, billing: billing.value });
  if (!reserved.ok) return reserved;

  let outcome: SurveyDraftOutcome;
  try {
    outcome = await call(drafter);
  } catch {
    outcome = { ok: false, failure: "PROVIDER_ERROR", usage: null };
  }
  if (!outcome.ok) {
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail(outcome.failure === "PROVIDER_BUSY" ? "AI_BUSY" : outcome.failure === "REFUSED" ? "AI_REFUSED" : "AI_INCOMPLETE", FAILURES[outcome.failure]);
  }
  let result: DraftResult;
  try {
    result = check(outcome);
  } catch {
    // A failure in Farbaek's own checks is never charged.
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail("AI_INCOMPLETE", FAILURES.INCOMPLETE);
  }
  // A draft that wouldn't save is Farbaek's mistake, not the person's: refunded, never charged.
  if (!surveyDocumentSchema.safeParse(result.document).success) {
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail("AI_INCOMPLETE", FAILURES.INCOMPLETE);
  }
  await settleUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage });
  // The audit line is a record, not a gate: the usage is already settled and nothing was saved.
  await deps
    .recordAiDraft({ orgId: input.orgId, actor: input.userId, projectId: input.projectId, operation: input.operation, model: outcome.usage.model, accepted: Math.min(result.accepted.length, 1000), dropped: Math.min(result.dropped.length, 1000), questions: result.questions.length })
    .catch(() => null);
  return { ok: true, value: { ...result, model: outcome.usage.model } };
}

/** "Draft the plan": the surveyor's description, read into lots, roads, adjoining lands and title fields. */
export async function draftSurveyPlan(deps: Deps, source: ModelSource<SurveyDrafter>, input: Common & { brief: string }): Promise<WriteResult<SurveyDraftValue>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const brief = input.brief.trim();
  if (brief.length < BRIEF_LIMITS.min) return fail("INVALID_REQUEST", "Describe the job first: the lots and their corner points, the land's name and where it is.");
  if (brief.length > BRIEF_LIMITS.max) return fail("INVALID_REQUEST", `Keep the description under ${BRIEF_LIMITS.max.toLocaleString("en-US")} characters.`);
  if (input.points.length === 0) return fail("INVALID_REQUEST", "Import the surveyed points first: the draft names lots by their corner points.");
  const request: DraftRequest = {
    brief,
    points: namedPoints(brief, input.points),
    codes: input.document.codes.map((c) => ({ code: c.code, meaning: c.meaning })),
    lots: input.document.lots.map((l) => `${l.label}${l.sup}`),
  };
  return run(
    deps,
    source,
    { ...input, operation: "survey_draft", promptTokens: approxTokens(SURVEY_DRAFT_PROMPT) + approxTokens(surveyDraftMessage(request)), manual: MANUAL_SURVEY_DRAFT },
    (d) => d.draft(request),
    (o) => acceptDraft(o.output, { document: input.document, points: input.points, source: "ai_brief", brief }),
  );
}

/** "Read an old plan": photos of an earlier plan or deed, read into the title fields only. */
export async function readSurveyPhotos(deps: Deps, source: ModelSource<SurveyDrafter>, input: Common & { images: ReadRequest["images"] }): Promise<WriteResult<SurveyDraftValue>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  if (input.images.length < 1 || input.images.length > PHOTO_LIMITS.count) return fail("INVALID_REQUEST", `Choose one to ${PHOTO_LIMITS.count} photos.`);
  if (input.images.some((i) => i.data.length > PHOTO_LIMITS.bytes)) return fail("INVALID_REQUEST", "One of the photos is too large. Choose it again so Farbaek can shrink it.");
  return run(
    deps,
    source,
    { ...input, operation: "survey_read", promptTokens: approxTokens(SURVEY_READ_PROMPT) + approxTokens(surveyReadMessage()) + SURVEY_READ_TOKENS_PER_IMAGE * input.images.length, manual: MANUAL_SURVEY_READ },
    (d) => d.read({ images: input.images }),
    (o) => acceptDraft(o.output, { document: input.document, points: input.points, source: "ai_photo", brief: "" }),
  );
}

/** What a photo's first bytes say it is: JPEG, PNG or WebP, or null. The browser's word for it isn't trusted. */
export function imageTypeOf(bytes: Uint8Array): ReadRequest["images"][number]["mediaType"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

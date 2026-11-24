/**
 * Reading field sketches (stage 223, ADR 0234), metered like "Read an old plan" (survey_read, free while Survey Studio is tested):
 * usage is reserved first and given back if the call fails or Farbaek's own checks fail. What comes back is kept only as `acceptSketch`
 * passes it, as written; the plan's checks compare it with the coordinates at display time, so nothing here moves or adds a point.
 * The photos are sent to the provider to be read; once the readings are saved, the action keeps the photos read with the plan
 * (ADR 0240), replacing an earlier read's. One audit event records the run, with counts only.
 */
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { SKETCH_LIMITS, acceptSketch, sketchRecordSchema, type SketchRecord } from "@/core/survey/autosurvey/sketch";
import { mergeSketchReads } from "@/core/survey/autosurvey/sketch-merge";
import type { ProviderUsage } from "@/server/ai/contract-drafter";
import { TIERS, tierModels } from "@/core/agent/routing";
import { routeModel } from "@/server/ai/routing";
import { platformModels } from "@/server/platform/state";
import { SKETCH_READ_PROMPT, SKETCH_TOKENS_PER_IMAGE, sketchReadMessage, type SketchImage, type SketchReadOutcome, type SketchReader } from "@/server/ai/sketch-reader";
import { refundUsage, reserveMetered, resolveMetering, settleUsage, type AiUsageDeps, type FreeUsageDeps, type ModelSource } from "@/server/workspace/ai-usage";
import { fail, requireContributor, type WriteDeps, type WriteResult } from "@/server/workspace/use-cases";
import type { SurveyDraftDeps } from "./drafting";

export const SKETCH_PHOTOS = { count: SKETCH_LIMITS.photos, bytes: SKETCH_LIMITS.photoBytes, total: SKETCH_LIMITS.totalBytes } as const;

/** How many times the photos are read, side by side, and merged (ADR 0260). */
export const READS = 2;

/** Several calls' usage as one, under the first call's model: what the run cost. Null when none reported any. */
function sumUsage(all: readonly ProviderUsage[]): ProviderUsage | null {
  if (all.length === 0) return null;
  return all.reduce((a, b) => ({
    model: a.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0),
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
  }));
}
export const MANUAL_SKETCH_READ = "Check the plan against your sketches yourself: everything else works without AI.";

const FAILURES = {
  REFUSED: "The AI declined to read these sketches, so it wasn't counted.",
  INCOMPLETE: "The sketches couldn't be read completely, so it wasn't counted. Try again.",
  PROVIDER_BUSY: "The AI provider is busy, so it wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "Reading the sketches didn't finish, so it wasn't counted. Try again.",
} as const;

type Deps = WriteDeps & AiUsageDeps & FreeUsageDeps & SurveyDraftDeps;

export async function readFieldSketches(
  deps: Deps,
  source: ModelSource<SketchReader>,
  input: { orgId: string; userId: string; projectId: string; images: readonly SketchImage[]; now: Date },
): Promise<WriteResult<SketchRecord>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const { images } = input;
  if (images.length < 1 || images.length > SKETCH_PHOTOS.count) return fail("INVALID_REQUEST", `Choose one to ${SKETCH_PHOTOS.count} sketch photos.`);
  if (images.some((i) => i.data.length > SKETCH_PHOTOS.bytes) || images.reduce((s, i) => s + i.data.length, 0) > SKETCH_PHOTOS.total) {
    return fail("INVALID_REQUEST", "The sketch photos are too large together. Choose them again so Farbaek can shrink them.");
  }

  const metering = await resolveMetering(deps, input.orgId, "survey_read");
  if (!metering.ok) return metering;
  // Tracing a surveyor's linework decides the whole plan (ADR 0249): the strongest model the plan allows, and never below the standard
  // tier, since a fast model can't follow a sketch's lines reliably. Reads are rare and capped per person per day.
  const choice = routeModel({ plan: metering.value.plan, family: source.family, step: "review", effort: "deep" });
  const reader = source.create(TIERS.indexOf(choice.tier) < TIERS.indexOf("standard") ? { ...choice, model: tierModels(source.family, platformModels())["standard"] } : choice);
  const promptTokens = approxTokens(SKETCH_READ_PROMPT) + approxTokens(sketchReadMessage(images)) + SKETCH_TOKENS_PER_IMAGE * images.length;
  // Read twice, side by side (stage 252, ADR 0260): a model misses a different line each time, and what either read saw is kept, merged.
  const units = READS * reserveUnits(reader.model, promptTokens + 500, reader.maxOutputTokens);
  const reserved = await reserveMetered(deps, metering.value, { orgId: input.orgId, userId: input.userId, taskId: null, operation: "survey_read", units, manual: MANUAL_SKETCH_READ });
  if (!reserved.ok) return reserved;

  const once = (): Promise<SketchReadOutcome> => reader.read(images).catch((): SketchReadOutcome => ({ ok: false, failure: "PROVIDER_ERROR", usage: null }));
  const outcomes = await Promise.all(Array.from({ length: READS }, once));
  // Every read's usage is counted, a failed one's too; one read that worked is used alone.
  const usage = sumUsage(outcomes.flatMap((o) => (o.usage ? [o.usage] : [])));
  const worked = outcomes.filter((o): o is Extract<SketchReadOutcome, { ok: true }> => o.ok);
  if (worked.length === 0) {
    const first = outcomes[0] as Extract<SketchReadOutcome, { ok: false }>;
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage, reason: "failed" });
    return fail(first.failure === "PROVIDER_BUSY" ? "AI_BUSY" : first.failure === "REFUSED" ? "AI_REFUSED" : "AI_INCOMPLETE", FAILURES[first.failure]);
  }
  const outcome = { ok: true as const, output: mergeSketchReads(worked[0]!.output, worked[1]?.output ?? null), usage: usage ?? worked[0]!.usage };
  let record: SketchRecord;
  try {
    record = sketchRecordSchema.parse(acceptSketch(outcome.output, images.map((i) => i.name), outcome.usage.model, input.now));
  } catch {
    // A failure in Farbaek's own checks is never charged.
    await refundUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return fail("AI_INCOMPLETE", FAILURES.INCOMPLETE);
  }
  await settleUsage(deps, { orgId: input.orgId, entryId: reserved.value.entryId, usage: outcome.usage });
  // The audit line is a record, not a gate: the usage is already settled.
  await deps
    .recordAiDraft({
      orgId: input.orgId,
      actor: input.userId,
      projectId: input.projectId,
      operation: "survey_read",
      model: outcome.usage.model,
      accepted: Math.min(record.readings.length, 1000),
      dropped: Math.min(Math.max(outcome.output.readings.length - record.readings.length, 0), 1000),
      questions: Math.min(record.unreadable.length, 100),
    })
    .catch(() => null);
  return { ok: true, value: record };
}

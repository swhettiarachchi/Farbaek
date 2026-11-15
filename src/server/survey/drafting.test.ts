/**
 * Survey Studio's metered drafting (ADR 0202) with a labelled fake model:
 * nothing here calls a real one. All points and briefs are SYNTHETIC.
 */
import { describe, expect, it } from "vitest";
import type { DraftOutput } from "@/core/survey/ai-draft";
import { emptyDocument } from "@/core/survey/document";
import { SAMPLE_POINTS } from "@/core/survey/fixtures";
import type { DraftRequest, SurveyDraftOutcome, SurveyDrafter } from "@/server/ai/survey-drafter";
import type { AiUsageDeps } from "@/server/workspace/ai-usage";
import type { OrgRole } from "@/server/workspace/types";
import type { WriteDeps } from "@/server/workspace/use-cases";
import { draftSurveyPlan, imageTypeOf, namedPoints, readSurveyPhotos, type SurveyDraftDeps } from "./drafting";

const usage = { model: "claude-sonnet-5-5", inputTokens: 1_200, outputTokens: 400, cacheWriteTokens: 0, cacheReadTokens: 0 };
const BRIEF = "Lot A is points 1 2 4 6, called Sample Watta.";
const OUTPUT: DraftOutput = {
  lots: [{ label: "A", sup: "", note: "", corners: ["1", "2", "4", "6"], evidence: "Lot A is points 1 2 4 6" }],
  roads: [],
  adjoining: [],
  fields: [
    { field: "landName", value: "Sample Watta", evidence: "called Sample Watta" },
    { field: "district", value: "Imaginary", evidence: "in Imaginary District" },
  ],
  notes: [],
  questions: ["Which district is the land in?"],
};

/** A labelled fake drafter: it never calls a model. */
function fakeDrafter(result: SurveyDraftOutcome) {
  const d = {
    model: "claude-sonnet-5-5",
    maxOutputTokens: 12_000,
    requests: [] as unknown[],
    async draft(r: DraftRequest) {
      d.requests.push(r);
      return result;
    },
    async read(r: unknown) {
      d.requests.push(r);
      return result;
    },
  };
  return d satisfies SurveyDrafter & { requests: unknown[] };
}

function fakeDeps(role: OrgRole = "member") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const deps: WriteDeps & AiUsageDeps & SurveyDraftDeps = {
    role: async () => role,
    billing: async () => ({ state: "active", paidPlanId: "pro" }),
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
    recordAiDraft: async (input) => (calls.push({ name: "record", input }), { ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => new Date("2026-11-15T10:00:00Z"),
  };
  return { deps, calls };
}

const common = { orgId: "o1", userId: "u1", projectId: "p1", document: emptyDocument(), points: SAMPLE_POINTS };

describe("drafting from the surveyor's description", () => {
  it("sends only the points the brief names, meters it as survey_draft, and checks what comes back", async () => {
    const f = fakeDeps();
    const drafter = fakeDrafter({ ok: true, output: OUTPUT, usage });
    const r = await draftSurveyPlan(f.deps, { family: "anthropic", create: () => drafter }, { ...common, brief: BRIEF });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sent = drafter.requests[0] as DraftRequest;
    expect(sent.points.map((p) => p.number)).toEqual(["1", "2", "4", "6"]);
    expect(sent.brief).toBe(BRIEF);
    expect(JSON.stringify(sent)).not.toMatch(/500000|600000/);
    expect(f.calls.map((c) => c.name)).toEqual(["reserve", "settle", "record"]);
    expect(f.calls[0]!.input).toMatchObject({ operation: "survey_draft", taskId: null });
    expect(f.calls[2]!.input).toEqual({ orgId: "o1", actor: "u1", projectId: "p1", operation: "survey_draft", model: "claude-sonnet-5-5", accepted: 2, dropped: 1, questions: 1 });
    expect(r.value.document.lots.map((l) => l.label)).toEqual(["A"]);
    expect(r.value.document.sheet.landName).toBe("Sample Watta");
    // "Imaginary District" isn't in the brief.
    expect(r.value.document.sheet.district).toBe("");
    expect(r.value.dropped).toEqual([{ what: "District", why: "It isn't in your description's words." }]);
  });

  it("refunds a failed call, and saves nothing", async () => {
    const f = fakeDeps();
    const r = await draftSurveyPlan(f.deps, { family: "anthropic", create: () => fakeDrafter({ ok: false, failure: "PROVIDER_BUSY", usage: null }) }, { ...common, brief: BRIEF });
    expect(r).toMatchObject({ ok: false, code: "AI_BUSY" });
    expect(f.calls.map((c) => c.name)).toEqual(["reserve", "settle"]);
    expect(f.calls[1]!.input).toMatchObject({ status: "refunded" });
  });

  it("asks for a description and points before spending anything, and refuses viewers", async () => {
    const f = fakeDeps();
    const create = () => fakeDrafter({ ok: true, output: OUTPUT, usage });
    expect(await draftSurveyPlan(f.deps, { family: "anthropic", create }, { ...common, brief: "lot A" })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await draftSurveyPlan(f.deps, { family: "anthropic", create }, { ...common, brief: "x".repeat(4_001) })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await draftSurveyPlan(f.deps, { family: "anthropic", create }, { ...common, points: [], brief: BRIEF })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await draftSurveyPlan(fakeDeps("viewer").deps, { family: "anthropic", create }, { ...common, brief: BRIEF })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(f.calls).toEqual([]);
  });

  it("matches point numbers as whole words", () => {
    expect(namedPoints("points 12 and 3", SAMPLE_POINTS).map((p) => p.number)).toEqual(["3", "12"]);
  });
});

describe("reading an old plan from photos", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  it("meters it as survey_read and fills only the title", async () => {
    const f = fakeDeps();
    const r = await readSurveyPhotos(f.deps, { family: "anthropic", create: () => fakeDrafter({ ok: true, output: OUTPUT, usage }) }, { ...common, images: [{ mediaType: "image/jpeg", data: jpeg }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(f.calls[0]!.input).toMatchObject({ operation: "survey_read" });
    expect(r.value.document.lots).toEqual([]);
    expect(r.value.document.sheet.district).toBe("Imaginary");
    expect(r.value.document.provenance["sheet.district"]).toEqual({ source: "ai_photo", reviewed: false });
  });

  it("takes one to three photos of a sensible size", async () => {
    const f = fakeDeps();
    const create = () => fakeDrafter({ ok: true, output: OUTPUT, usage });
    expect(await readSurveyPhotos(f.deps, { family: "anthropic", create }, { ...common, images: [] })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    const four = Array.from({ length: 4 }, () => ({ mediaType: "image/jpeg" as const, data: jpeg }));
    expect(await readSurveyPhotos(f.deps, { family: "anthropic", create }, { ...common, images: four })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(f.calls).toEqual([]);
  });

  it("knows a photo by its bytes, not its name", () => {
    expect(imageTypeOf(jpeg)).toBe("image/jpeg");
    expect(imageTypeOf(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(imageTypeOf(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(imageTypeOf(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(imageTypeOf(Buffer.from("<svg"))).toBeNull();
  });
});

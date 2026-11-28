/**
 * Survey Studio's metered drafting (ADR 0202) with a labelled fake model:
 * nothing here calls a real one. All points and briefs are SYNTHETIC.
 */
import { describe, expect, it } from "vitest";
import type { DraftOutput } from "@/core/survey/ai-draft";
import { emptyDocument } from "@/core/survey/document";
import { SAMPLE_POINTS } from "@/core/survey/fixtures";
import type { DraftRequest, SurveyDraftOutcome, SurveyDrafter } from "@/server/ai/survey-drafter";
import type { AiUsageDeps, FreeUsageDeps } from "@/server/workspace/ai-usage";
import type { OrgRole } from "@/server/workspace/types";
import type { WriteDeps } from "@/server/workspace/use-cases";
import { draftSurveyPlan, imageTypeOf, namedPoints, pdfPages, readSurveyPhotos, scanTypeOf, type SurveyDraftDeps } from "./drafting";

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
  const deps: WriteDeps & AiUsageDeps & FreeUsageDeps & SurveyDraftDeps = {
    role: async () => role,
    // Free while it's tested (ADR 0212): the plan is never read, so an unreadable one can't stop it.
    billing: async () => (calls.push({ name: "billing", input: null }), null),
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (calls.push({ name: "reserve from the allowance", input }), { ok: true, value: "entry-0" }),
    reserveFreeUsage: async (input) => (calls.push({ name: "reserve", input }), { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
    recordAiDraft: async (input) => (calls.push({ name: "record", input }), { ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => new Date("2026-11-15T10:00:00Z"),
  };
  return { deps, calls };
}

const common = { orgId: "o1", userId: "u1", projectId: "p1", document: emptyDocument(), points: SAMPLE_POINTS };

describe("drafting from the surveyor's description", () => {
  it("sends only the points the brief names, meters it as free survey_draft use, and checks what comes back", async () => {
    const f = fakeDeps();
    const drafter = fakeDrafter({ ok: true, output: OUTPUT, usage });
    let chosen = "";
    const r = await draftSurveyPlan(f.deps, { family: "anthropic", create: (s) => ((chosen = s.model), drafter) }, { ...common, brief: BRIEF });
    // Routed as the trial, so every tester sees the real quality, whatever their plan.
    expect(chosen).toBe("claude-sonnet-5-5");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sent = drafter.requests[0] as DraftRequest;
    expect(sent.points.map((p) => p.number)).toEqual(["1", "2", "4", "6"]);
    expect(sent.brief).toBe(BRIEF);
    expect(JSON.stringify(sent)).not.toMatch(/500000|600000/);
    expect(f.calls.map((c) => c.name)).toEqual(["reserve", "settle", "record"]);
    expect(f.calls[0]!.input).toEqual({ orgId: "o1", actor: "u1", key: "key-1", operation: "survey_draft", units: expect.any(Number) });
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
    const viewer = fakeDeps("viewer");
    expect(await draftSurveyPlan(viewer.deps, { family: "anthropic", create }, { ...common, brief: BRIEF })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(f.calls).toEqual([]);
    expect(viewer.calls).toEqual([]);
  });

  it("refunds a draft that wouldn't save or that Farbaek's own checks fail on", async () => {
    const f = fakeDeps();
    const broken = { ...OUTPUT, lots: null as unknown as DraftOutput["lots"] };
    const r = await draftSurveyPlan(f.deps, { family: "anthropic", create: () => fakeDrafter({ ok: true, output: broken, usage }) }, { ...common, brief: BRIEF });
    expect(r).toMatchObject({ ok: false, code: "AI_INCOMPLETE" });
    expect(f.calls.map((c) => c.name)).toEqual(["reserve", "settle"]);
    expect(f.calls[1]!.input).toMatchObject({ status: "refunded" });
  });

  it("matches point numbers as whole words, as written", () => {
    expect(namedPoints("points 12 and 3", SAMPLE_POINTS).map((p) => p.number)).toEqual(["3", "12"]);
    expect(namedPoints("points BM-1 and 1.5", SAMPLE_POINTS)).toEqual([]);
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

  // Synthetic PDFs: a header, page objects, padding. Nothing here is a real document.
  const pdf = (pageObjects: number, bytes = 2_000) => {
    const head = `%PDF-1.7\n${Array.from({ length: pageObjects }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj\n`).join("")}2 0 obj << /Type /Pages /Count ${pageObjects} >> endobj\n`;
    return Buffer.concat([Buffer.from(head, "latin1"), Buffer.alloc(Math.max(0, bytes - head.length), 32)]);
  };

  it("reads a scanned PDF as it is, within its own size and pages, and reserves its pages (stage 296)", async () => {
    expect(scanTypeOf(pdf(1))).toBe("application/pdf");
    expect(scanTypeOf(jpeg)).toBe("image/jpeg");
    expect(scanTypeOf(Buffer.from("PDF-1.7"))).toBeNull();
    // Pages it names, else one for every 250 KB; the Pages tree itself isn't a page.
    expect(pdfPages(pdf(4))).toBe(4);
    expect(pdfPages(pdf(0, 1_000_000))).toBe(4);
    const create = () => fakeDrafter({ ok: true, output: OUTPUT, usage });
    // Larger than a photo may be, within a PDF's own size: read, and reserved for its pages.
    const f = fakeDeps();
    const r = await readSurveyPhotos(f.deps, { family: "anthropic", create }, { ...common, images: [{ mediaType: "application/pdf", data: pdf(3, 2_500_000) }] });
    expect(r.ok).toBe(true);
    const one = fakeDeps();
    await readSurveyPhotos(one.deps, { family: "anthropic", create }, { ...common, images: [{ mediaType: "image/jpeg", data: jpeg }] });
    const reserved = (calls: { name: string; input: { units?: number } | null }[]) => calls.find((c) => c.name === "reserve")?.input?.units ?? 0;
    expect(reserved(f.calls)).toBeGreaterThan(reserved(one.calls));
    // Too large, too long, or too large together: refused before anything is sent.
    const g = fakeDeps();
    expect(await readSurveyPhotos(g.deps, { family: "anthropic", create }, { ...common, images: [{ mediaType: "application/pdf", data: pdf(1, 3_100_000) }] })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await readSurveyPhotos(g.deps, { family: "anthropic", create }, { ...common, images: [{ mediaType: "application/pdf", data: pdf(11) }] })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await readSurveyPhotos(g.deps, { family: "anthropic", create }, { ...common, images: [{ mediaType: "application/pdf", data: pdf(1, 2_900_000) }, { mediaType: "application/pdf", data: pdf(1, 2_900_000) }] })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    // A photo is still held to a photo's size.
    expect(await readSurveyPhotos(g.deps, { family: "anthropic", create }, { ...common, images: [{ mediaType: "image/jpeg", data: Buffer.concat([jpeg, Buffer.alloc(1_900_000)]) }] })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(g.calls).toEqual([]);
  });
});

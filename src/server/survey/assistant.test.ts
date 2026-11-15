/**
 * The drafting assistant's metered turn (stage 195, ADR 0210) with a labelled fake model: nothing here calls a real one. The plan and
 * points are the SYNTHETIC sample.
 */
import { describe, expect, it } from "vitest";
import type { AssistOutput } from "@/core/survey/assistant/ops";
import { SAMPLE_POINTS, sampleDocument } from "@/core/survey/fixtures";
import type { AssistRequest, SurveyAssistOutcome, SurveyAssistant } from "@/server/ai/survey-assistant";
import type { AiUsageDeps } from "@/server/workspace/ai-usage";
import type { OrgRole } from "@/server/workspace/types";
import type { WriteDeps } from "@/server/workspace/use-cases";
import { recordedOps, runAssistant, type SurveyAssistDeps } from "./assistant";

const usage = { model: "claude-haiku-5-5", inputTokens: 3_100, outputTokens: 180, cacheWriteTokens: 0, cacheReadTokens: 2_800 };
const WORDS = "add lot B4 from points 1 to 3 and 8, and the land name Ambagahawatta";
const OUTPUT: AssistOutput = {
  say: "I'll add the lot and fill in the land's name.",
  ops: [
    { op: "add_lot", label: "lot B4", corners: { from: "words", quote: "points 1 to 3 and 8" }, note: "", quote: "add lot B4 from points 1 to 3 and 8" },
    { op: "set_field", field: "landName", value: "Ambagahawatta", quote: "the land name Ambagahawatta" },
    { op: "set_field", field: "district", value: "Gampaha", quote: "district Gampaha" },
  ],
};

/** A labelled fake assistant: it never calls a model. */
function fakeAssistant(result: SurveyAssistOutcome) {
  const a = {
    model: "claude-haiku-5-5",
    maxOutputTokens: 2_000,
    requests: [] as AssistRequest[],
    async turn(r: AssistRequest) {
      a.requests.push(r);
      return result;
    },
  };
  return a satisfies SurveyAssistant & { requests: AssistRequest[] };
}

function fakeDeps(role: OrgRole = "member") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const deps: WriteDeps & AiUsageDeps & SurveyAssistDeps = {
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
    settleUsage: async (input) => (calls.push({ name: input.status === "refunded" ? "refund" : "settle", input }), { ok: true, value: null }),
    recordAssistTurn: async (input) => (calls.push({ name: "record", input }), { ok: true, value: "turn-1" }),
    newEventId: () => "key-1",
    now: () => new Date("2026-11-16T10:00:00Z"),
  };
  return { deps, calls };
}

const input = { orgId: "o1", userId: "u1", projectId: "p1", document: sampleDocument(), points: SAMPLE_POINTS, selection: [], words: WORDS, lang: "en" as const, inputMethod: "voice" as const, recent: [] };

describe("the drafting assistant's turn", () => {
  it("sends refs and point numbers but no coordinates, meters it as survey_assist on the fast model, and records what survived the checks", async () => {
    const f = fakeDeps();
    const assistant = fakeAssistant({ ok: true, output: OUTPUT, usage });
    let chosen = "";
    const r = await runAssistant(f.deps, { family: "anthropic", create: (s) => ((chosen = s.model), assistant) }, input);
    expect(r).toMatchObject({ ok: true, value: { turnId: "turn-1", model: "claude-haiku-5-5" } });
    expect(chosen).toBe("claude-haiku-5-5");
    const sent = JSON.stringify(assistant.requests[0]);
    expect(sent).toContain(WORDS);
    expect(sent).not.toMatch(/500\d{3}\.|600\d{3}\.|21\.43/);
    expect(f.calls.map((c) => c.name)).toEqual(["reserve", "settle", "record"]);
    expect(f.calls[0]!.input).toMatchObject({ operation: "survey_assist", taskId: null });
    const rec = f.calls[2]!.input;
    expect(rec).toMatchObject({ orgId: "o1", actor: "u1", projectId: "p1", lang: "en", inputMethod: "voice", words: WORDS, outcome: "suggested", model: "claude-haiku-5-5" });
    // "district Gampaha" isn't in the words, so it was left out, not recorded as an operation.
    expect(rec.operations).toHaveLength(2);
    expect(rec.dropped).toHaveLength(1);
  });

  it("refunds a failed call, and a turn where nothing survived the checks", async () => {
    const busy = fakeDeps();
    const r1 = await runAssistant(busy.deps, { family: "anthropic", create: () => fakeAssistant({ ok: false, failure: "PROVIDER_BUSY", usage: null }) }, input);
    expect(r1).toMatchObject({ ok: false, code: "AI_BUSY" });
    expect(busy.calls.map((c) => c.name)).toEqual(["reserve", "refund"]);
    const empty = fakeDeps();
    const nothing: AssistOutput = { say: "Done.", ops: [{ op: "add_lot", label: "lot Z9", corners: { from: "words", quote: "points 97 98 99" }, note: "", quote: "lot Z9 from points 97 98 99" }] };
    const r2 = await runAssistant(empty.deps, { family: "anthropic", create: () => fakeAssistant({ ok: true, output: nothing, usage }) }, input);
    expect(r2.ok).toBe(true);
    expect(empty.calls.map((c) => c.name)).toEqual(["reserve", "refund", "record"]);
    expect(empty.calls[2]!.input.outcome).toBe("failed");
  });

  it("refuses viewers and empty or overlong instructions before any usage is reserved", async () => {
    const viewer = fakeDeps("viewer");
    expect(await runAssistant(viewer.deps, { family: "anthropic", create: () => fakeAssistant({ ok: true, output: OUTPUT, usage }) }, input)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const f = fakeDeps();
    const a = { family: "anthropic" as const, create: () => fakeAssistant({ ok: true, output: OUTPUT, usage }) };
    expect(await runAssistant(f.deps, a, { ...input, words: "   " })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await runAssistant(f.deps, a, { ...input, words: "x".repeat(2_001) })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(viewer.calls).toEqual([]);
    expect(f.calls).toEqual([]);
  });
});

describe("the turn record stays inside the table's size check", () => {
  it("shortens quotes, and keeps only the kinds when a long dictation is still too large", () => {
    const quote = "q".repeat(2_000);
    const notes = Array.from({ length: 30 }, () => ({ kind: "note_add" as const, text: "A note", quote }));
    const short = recordedOps(notes) as { quote: string }[];
    expect(short[0]!.quote).toHaveLength(200);
    expect(JSON.stringify(short).length).toBeLessThan(64_000);
    const rows = Array.from({ length: 400 }, (_, i) => ({ from: String(i), to: String(i + 1), bearing: "45 30 15", distance: "25.40", code: "CP" }));
    const big = recordedOps(Array.from({ length: 5 }, () => ({ kind: "measure" as const, mode: "bearings" as const, rows, quote })));
    expect(big).toEqual(Array.from({ length: 5 }, () => ({ kind: "measure", shortened: true })));
  });
});

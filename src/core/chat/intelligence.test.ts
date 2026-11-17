import { describe, expect, it } from "vitest";
import type { EffectivePlan } from "@/core/billing/trial";
import { mayFallBack, planChatRoute, readQuestion, type QuestionRead, type RouteSetup } from "./intelligence";

type PlanId = "free" | "starter" | "pro" | "max";
const plan = (planId: PlanId): EffectivePlan => ({ planId, source: planId === "free" ? "free" : "subscription" }) as unknown as EffectivePlan;
const both = (planId: PlanId = "pro", over: Partial<RouteSetup> = {}): RouteSetup => ({ plan: plan(planId), claude: true, openai: true, claudeOwnKey: false, ...over });
const healthy = { anthropic: true, openai: true };
const q = (over: Partial<QuestionRead> = {}): QuestionRead => ({ kind: "everyday", difficulty: "moderate", pictures: false, short: false, ...over });
const models = (r: ReturnType<typeof planChatRoute>) => r!.candidates.map((c) => c.model);

describe("Farbaek AI reads a question (stage 203)", () => {
  it("tells code, reasoning, analysis, writing and everyday questions apart", () => {
    expect(readQuestion({ text: "Why does this throw?\n```ts\nconst a = b();\n```", images: 0, documents: 0 }).kind).toBe("code");
    expect(readQuestion({ text: "Prove that the square root of 2 is irrational", images: 0, documents: 0 }).kind).toBe("reasoning");
    expect(readQuestion({ text: "What is 17 * 23 + 4?", images: 0, documents: 0 }).kind).toBe("reasoning");
    expect(readQuestion({ text: "Compare these two offers and tell me the trade-offs", images: 0, documents: 0 }).kind).toBe("analysis");
    expect(readQuestion({ text: "What does it say?", images: 0, documents: 1 }).kind).toBe("analysis");
    expect(readQuestion({ text: "Write a short email to my landlord", images: 0, documents: 0 }).kind).toBe("writing");
    expect(readQuestion({ text: "What's a good name for a bakery?", images: 1, documents: 0 })).toMatchObject({ kind: "everyday", pictures: true });
  });

  it("calls debugging, maths, depth, long questions and several questions in one hard", () => {
    expect(readQuestion({ text: "Fix the bug in my python script", images: 0, documents: 0 }).difficulty).toBe("hard");
    expect(readQuestion({ text: "Solve x^2 - 5x + 6 = 0", images: 0, documents: 0 }).difficulty).toBe("hard");
    expect(readQuestion({ text: "Explain how vaccines work, step by step", images: 0, documents: 0 }).difficulty).toBe("hard");
    expect(readQuestion({ text: "a".repeat(2_100), images: 0, documents: 0 }).difficulty).toBe("hard");
    expect(readQuestion({ text: "Why is the sky blue? How do clouds form? What makes rain fall?", images: 0, documents: 0 }).difficulty).toBe("hard");
    expect(readQuestion({ text: "Summarise the main risks", images: 0, documents: 1 }).difficulty).toBe("hard");
  });

  it("doesn't take everyday words, dates or numbers for code or maths (the review's cases)", () => {
    for (const text of [
      "What's open 24/7 near me?",
      "My flight is on 11/18, what should I pack?",
      "Summarise https://example.com/2026/11/17/story",
      "How does the instagram algorithm work?",
      "Can you help me solve my argument with my sister?",
      "How do I return a broken kettle?",
      "Let's figure out why my washing machine is not working",
      "Add 1/2 cup of sugar or 3/4?",
      "huh??? really???",
    ]) {
      const r = readQuestion({ text, images: 0, documents: 0 });
      expect(r.difficulty, text).not.toBe("hard");
      expect(["code", "reasoning"], text).not.toContain(r.kind);
    }
    // Long text to proofread isn't hard on its own.
    expect(readQuestion({ text: `Proofread this essay: ${"word ".repeat(500)}`, images: 0, documents: 0 }).difficulty).not.toBe("hard");
  });

  it("calls short everyday questions and short writing simple, and the rest moderate", () => {
    expect(readQuestion({ text: "Hi! How are you?", images: 0, documents: 0 })).toMatchObject({ difficulty: "simple", short: true });
    expect(readQuestion({ text: "Write a short email to my landlord", images: 0, documents: 0 }).difficulty).toBe("simple");
    expect(readQuestion({ text: "What does this function return?\n```js\nfunction f() { return 1 }\n```", images: 0, documents: 0 }).difficulty).toBe("moderate");
    expect(readQuestion({ text: "What does it say?", images: 0, documents: 1 })).toMatchObject({ short: false });
  });
});

describe("Farbaek AI's route (stage 203)", () => {
  it("answers with GPT-6 Luna by default, with Claude Haiku standing by, on every plan", () => {
    for (const p of ["free", "starter", "pro"] as const) {
      const r = planChatRoute(both(p), "auto", "balanced", q(), healthy);
      expect(models(r)).toEqual(["gpt-6-luna", "claude-haiku-5-5"]);
      expect(r!.candidates[0]).toMatchObject({ provider: "openai", tier: "fast", thinking: "medium" });
    }
  });

  it("thinks little about simple questions and more at Thorough", () => {
    expect(planChatRoute(both(), "auto", "balanced", q({ difficulty: "simple" }), healthy)!.candidates[0]!.thinking).toBe("low");
    expect(planChatRoute(both(), "auto", "quick", q(), healthy)!.candidates[0]!.thinking).toBe("low");
    expect(planChatRoute(both(), "auto", "thorough", q(), healthy)!.candidates[0]!.thinking).toBe("high");
  });

  it("steps a hard question up a tier, to the provider that leads for its kind, with a fast model as the last resort", () => {
    expect(models(planChatRoute(both(), "auto", "balanced", q({ kind: "code", difficulty: "hard" }), healthy))).toEqual(["claude-sonnet-5-5", "gpt-6.1-sol", "claude-haiku-5-5"]);
    expect(models(planChatRoute(both(), "auto", "balanced", q({ kind: "reasoning", difficulty: "hard" }), healthy))).toEqual(["gpt-6.1-sol", "claude-sonnet-5-5", "gpt-6-luna"]);
    expect(models(planChatRoute(both(), "auto", "balanced", q({ kind: "writing", difficulty: "hard" }), healthy))).toEqual(["gpt-6.1-terra", "claude-sonnet-5-5", "gpt-6-luna"]);
    expect(models(planChatRoute(both(), "auto", "balanced", q({ kind: "analysis", difficulty: "hard" }), healthy))[0]).toBe("claude-sonnet-5-5");
    // Pictures at the standard tier go to the writing and pictures model.
    expect(models(planChatRoute(both(), "auto", "balanced", q({ kind: "everyday", difficulty: "hard", pictures: true }), healthy))[0]).toBe("gpt-6.1-terra");
  });

  it("no longer gives a hard question a fast model just because Quick was chosen", () => {
    expect(planChatRoute(both(), "auto", "quick", q({ kind: "reasoning", difficulty: "hard" }), healthy)!.candidates[0]).toMatchObject({ model: "gpt-6.1-sol", tier: "standard" });
  });

  it("goes as far as the plan allows at Thorough, and never past it", () => {
    expect(planChatRoute(both("pro"), "auto", "thorough", q({ kind: "code", difficulty: "hard" }), healthy)!.candidates[0]!.tier).toBe("strong");
    expect(planChatRoute(both("starter"), "auto", "thorough", q({ kind: "code", difficulty: "hard" }), healthy)!.candidates[0]!.tier).toBe("standard");
    for (const p of ["free", "starter", "pro", "max"] as const) {
      for (const effort of ["quick", "balanced", "thorough"] as const) {
        const r = planChatRoute(both(p), "auto", effort, q({ difficulty: "hard" }), healthy, { again: true, previous: { model: "gpt-6-astra", rating: -1 } })!;
        for (const c of r.candidates) expect(["fast", "standard", "strong", "frontier"].indexOf(c.tier)).toBeLessThanOrEqual(p === "free" ? 1 : p === "starter" ? 1 : 3);
      }
    }
  });

  it("lets Free reach a stronger model only for a question that reads as hard", () => {
    expect(planChatRoute(both("free"), "auto", "thorough", q(), healthy)!.candidates[0]!.tier).toBe("fast");
    expect(planChatRoute(both("free"), "auto", "balanced", q({ kind: "reasoning", difficulty: "hard" }), healthy)!.candidates[0]).toMatchObject({ model: "gpt-6.1-sol", tier: "standard" });
    // Asking again, a thumbs-down or a short follow-up after a stronger answer don't step Free up.
    const again = planChatRoute(both("free"), "auto", "balanced", q(), healthy, { again: true, replaced: { model: "gpt-6-luna", provider: "openai" } })!;
    expect(again.candidates[0]).toMatchObject({ model: "claude-haiku-5-5", tier: "fast" });
    expect(planChatRoute(both("free"), "auto", "balanced", q(), healthy, { previous: { model: "gpt-6-luna", rating: -1 } })!.candidates[0]!.tier).toBe("fast");
    expect(planChatRoute(both("free"), "auto", "balanced", q({ short: true }), healthy, { previous: { model: "claude-sonnet-5-5", provider: "anthropic", tier: "standard", rating: null } })!.candidates[0]!.tier).toBe("fast");
  });

  it("gives a second opinion from the other provider than the answer being replaced", () => {
    const first = planChatRoute(both(), "auto", "balanced", q(), healthy)!;
    expect(first.candidates[0]!.provider).toBe("openai");
    // Without knowing the replaced answer: the other provider than the one that would lead.
    const guessed = planChatRoute(both(), "auto", "balanced", q(), healthy, { again: true })!;
    expect(guessed.candidates[0]).toMatchObject({ provider: "anthropic", tier: "standard", model: "claude-sonnet-5-5" });
    expect(guessed.reason).toBe("a second opinion from another model");
    // Knowing it: a Claude answer is replaced by OpenAI's, even where Claude would lead.
    const known = planChatRoute(both(), "auto", "balanced", q({ kind: "code", short: true }), healthy, { again: true, replaced: { model: "claude-sonnet-5-5", provider: "anthropic" } })!;
    expect(known.candidates[0]!.provider).toBe("openai");
  });

  it("carries on an answer with the model that started it, its own reason and no note", () => {
    const pro = planChatRoute(both(), "auto", "balanced", q(), healthy, { keep: { model: "claude-sonnet-5-5", reason: "a hard question about code", tier: "standard" } })!;
    expect(pro).toMatchObject({ reason: "a hard question about code", note: null });
    expect(pro.candidates[0]!.model).toBe("claude-sonnet-5-5");
    // On Free, a stepped-up answer carries on; a model Free never reaches falls back to Auto, still with no note.
    expect(planChatRoute(both("free"), "auto", "balanced", q(), healthy, { keep: { model: "gpt-6.1-sol", reason: "x", tier: "standard" } })!.candidates[0]!.model).toBe("gpt-6.1-sol");
    const opus = planChatRoute(both("free"), "auto", "balanced", q(), healthy, { keep: { model: "claude-opus-5-5" } })!;
    expect(opus).toMatchObject({ note: null });
    expect(opus.candidates[0]!.model).toBe("gpt-6-luna");
  });

  it("steps up after a thumbs-down on the last answer", () => {
    const r = planChatRoute(both(), "auto", "balanced", q(), healthy, { previous: { model: "gpt-6-luna", rating: -1 } })!;
    expect(r.candidates[0]!.tier).toBe("standard");
    expect(r.reason).toContain("after the last answer missed");
  });

  it("keeps a short follow-up on the model that answered before it, and doesn't flip providers above the fast tier", () => {
    const followUp = planChatRoute(both(), "auto", "balanced", q({ short: true }), healthy, { previous: { model: "claude-sonnet-5-5", provider: "anthropic", tier: "standard", rating: null } })!;
    expect(followUp.candidates[0]).toMatchObject({ model: "claude-sonnet-5-5", tier: "standard" });
    // Above the fast tier the provider that answered last keeps answering, even where the other would lead.
    const sticky = planChatRoute(both(), "auto", "balanced", q({ kind: "reasoning", difficulty: "hard" }), healthy, { previous: { model: "claude-sonnet-5-5", provider: "anthropic", tier: "standard", rating: 1 } })!;
    expect(sticky.candidates[0]!.model).toBe("claude-sonnet-5-5");
    // At the fast tier GPT-6 Luna always leads: a conversation once answered by Haiku (by a fallback, or before this stage) comes back.
    expect(planChatRoute(both(), "auto", "balanced", q(), healthy, { previous: { model: "claude-haiku-5-5", provider: "anthropic", tier: "fast", rating: 1 } })!.candidates[0]!.model).toBe("gpt-6-luna");
    // A provider that isn't recorded (an older answer, or one a fallback wrote) is no preference.
    expect(planChatRoute(both(), "auto", "balanced", q({ kind: "reasoning", difficulty: "hard" }), healthy, { previous: { model: "claude-sonnet-5-5", tier: "standard", rating: null } })!.candidates[0]!.model).toBe("gpt-6.1-sol");
  });

  it("routes around a provider failing right now", () => {
    const r = planChatRoute(both(), "auto", "balanced", q(), { anthropic: true, openai: false })!;
    expect(models(r)).toEqual(["claude-haiku-5-5", "gpt-6-luna"]);
    expect(r.reason).toContain("is busy");
  });

  it("keeps a workspace's own Claude key on Claude, with a faster Claude as the last resort", () => {
    const r = planChatRoute(both("pro", { claudeOwnKey: true }), "auto", "balanced", q({ kind: "reasoning", difficulty: "hard" }), healthy)!;
    expect(r.candidates.every((c) => c.provider === "anthropic")).toBe(true);
    expect(models(r)).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    expect(models(planChatRoute(both("pro", { claudeOwnKey: true }), "auto", "balanced", q(), healthy))).toEqual(["claude-haiku-5-5"]);
    // Farbaek's own Claude failing says nothing about the workspace's key: the last resort stays on Claude.
    expect(models(planChatRoute(both("pro", { claudeOwnKey: true }), "auto", "balanced", q({ kind: "code", difficulty: "hard" }), { anthropic: false, openai: true }))).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    // A GPT model picked by hand there says the real reason.
    expect(planChatRoute(both("pro", { claudeOwnKey: true }), "gpt-6-luna", "balanced", q(), healthy)!.note).toContain("own claude key");
  });

  it("uses Claude alone where OpenAI isn't connected, and OpenAI alone where Claude isn't", () => {
    expect(models(planChatRoute(both("pro", { openai: false }), "auto", "balanced", q(), healthy))).toEqual(["claude-haiku-5-5"]);
    expect(models(planChatRoute(both("pro", { claude: false }), "auto", "balanced", q({ kind: "code", difficulty: "hard" }), healthy))).toEqual(["gpt-6.1-sol", "gpt-6-luna"]);
  });

  it("honours a model picked by hand when the plan includes it, and says so when it doesn't", () => {
    const picked = planChatRoute(both(), "claude-haiku-5-5", "balanced", q({ kind: "code", difficulty: "hard" }), healthy)!;
    expect(picked.candidates[0]).toMatchObject({ model: "claude-haiku-5-5", provider: "anthropic" });
    expect(picked.reason).toBe("the model you chose");
    const notIncluded = planChatRoute(both("free"), "gpt-6.1-sol", "balanced", q(), healthy)!;
    expect(notIncluded.candidates[0]!.model).toBe("gpt-6-luna");
    expect(notIncluded.note).toContain("isn't available here");
  });

  it("never lists more than three candidates, or one model twice", () => {
    for (const kind of ["code", "reasoning", "analysis", "writing", "everyday"] as const) {
      for (const difficulty of ["simple", "moderate", "hard"] as const) {
        const r = planChatRoute(both("max"), "auto", "thorough", q({ kind, difficulty }), healthy, { again: true })!;
        expect(r.candidates.length).toBeLessThanOrEqual(3);
        expect(new Set(models(r)).size).toBe(r.candidates.length);
      }
    }
  });

  it("answers with nothing when no AI is connected", () => {
    expect(planChatRoute(both("pro", { claude: false, openai: false }), "auto", "balanced", q(), healthy)).toBeNull();
  });

  it("hands over only provider failures, before anything was written", () => {
    expect(mayFallBack("PROVIDER_BUSY", false, false)).toBe(true);
    expect(mayFallBack("PROVIDER_ERROR", false, false)).toBe(true);
    expect(mayFallBack("PROVIDER_BUSY", false, true)).toBe(false);
    expect(mayFallBack("PROVIDER_BUSY", true, false)).toBe(false);
    expect(mayFallBack("INCOMPLETE", false, false)).toBe(false);
  });
});

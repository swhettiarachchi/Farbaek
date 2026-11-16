import { describe, expect, it } from "vitest";
import type { EffectivePlan } from "@/core/billing/trial";
import { mayFallBack, planChatRoute, readQuestion, type RouteSetup } from "./intelligence";

const plan = (planId: "free" | "pro"): EffectivePlan => ({ planId, source: planId === "free" ? "free" : "subscription" }) as unknown as EffectivePlan;
const both = (planId: "free" | "pro" = "pro", over: Partial<RouteSetup> = {}): RouteSetup => ({ plan: plan(planId), claude: true, openai: true, claudeOwnKey: false, ...over });
const healthy = { anthropic: true, openai: true };

describe("Farbaek AI reads a question", () => {
  it("tells code, analysis, writing and everyday questions apart", () => {
    expect(readQuestion({ text: "Why does this throw?\n```ts\nconst a = b();\n```", images: 0, documents: 0 })).toBe("code");
    expect(readQuestion({ text: "Fix the bug in my python script", images: 0, documents: 0 })).toBe("code");
    expect(readQuestion({ text: "Compare these two offers and tell me the trade-offs", images: 0, documents: 0 })).toBe("analysis");
    expect(readQuestion({ text: "What does it say?", images: 0, documents: 1 })).toBe("analysis");
    expect(readQuestion({ text: "Write a short email to my landlord", images: 0, documents: 0 })).toBe("writing");
    expect(readQuestion({ text: "What's a good name for a bakery?", images: 1, documents: 0 })).toBe("everyday");
  });
});

describe("Farbaek AI's route (stage 201)", () => {
  it("puts Claude first with OpenAI standing by on a paid plan", () => {
    const r = planChatRoute(both(), "auto", "balanced", "code", healthy)!;
    expect(r.candidates.map((c) => c.provider)).toEqual(["anthropic", "openai"]);
    expect(r.reason).toBe("a question about code");
    expect(r.note).toBeNull();
  });

  it("routes around Claude while it's failing, and back to it once it answers", () => {
    const r = planChatRoute(both(), "auto", "balanced", "everyday", { anthropic: false, openai: true })!;
    expect(r.candidates.map((c) => c.provider)).toEqual(["openai", "anthropic"]);
    expect(r.reason).toContain("is busy");
  });

  it("keeps the Free plan on its one model, with nothing standing by", () => {
    const r = planChatRoute(both("free"), "auto", "balanced", "everyday", healthy)!;
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.model).toBe("claude-haiku-5-5");
  });

  it("keeps a workspace's own Claude key on that key", () => {
    const r = planChatRoute(both("pro", { claudeOwnKey: true }), "auto", "balanced", "everyday", healthy)!;
    expect(r.candidates.map((c) => c.provider)).toEqual(["anthropic"]);
  });

  it("honours a model picked by hand, with the other provider standing by", () => {
    const r = planChatRoute(both(), "gpt-6.1-terra", "quick", "everyday", healthy)!;
    expect(r.candidates.map((c) => c.model)).toEqual(["gpt-6.1-terra", expect.stringMatching(/^claude-/)]);
    expect(r.candidates[0]!.thinking).toBe("low");
  });

  it("thinks a little more about code and analysis at Balanced", () => {
    expect(planChatRoute(both(), "auto", "balanced", "code", healthy)!.candidates[0]!.thinking).toBe("medium");
    expect(planChatRoute(both(), "auto", "balanced", "everyday", healthy)!.candidates[0]!.thinking).toBe("low");
    expect(planChatRoute(both(), "auto", "thorough", "everyday", healthy)!.candidates[0]!.thinking).toBe("high");
  });

  it("answers with nothing when no AI is connected", () => {
    expect(planChatRoute(both("pro", { claude: false, openai: false }), "auto", "balanced", "everyday", healthy)).toBeNull();
  });

  it("hands over only provider failures, before anything was written", () => {
    expect(mayFallBack("PROVIDER_BUSY", false, false)).toBe(true);
    expect(mayFallBack("PROVIDER_ERROR", false, true)).toBe(false);
    expect(mayFallBack("PROVIDER_ERROR", true, false)).toBe(false);
    expect(mayFallBack("REFUSED", false, false)).toBe(false);
  });
});

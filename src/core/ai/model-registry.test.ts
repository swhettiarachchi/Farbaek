import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TIERS, TIER_MODELS } from "@/core/agent/routing";
import { MODEL_NAMES, type ModelId } from "@/core/billing/model-names";
import { RATE_CARD } from "@/core/billing/rate-card";
import { chatModels } from "@/core/chat/ladder";
import { MODEL_REGISTRY, PROVIDER_NAMES, ROLE_NAMES, modelsWith, priceCheckList, priceNeedsCheck, priceState, pricesToCheck, providersFor, registeredModel } from "./model-registry";
import { registryDocument } from "./model-registry-doc";

const ids = MODEL_REGISTRY.map((m) => m.id);

describe("the model registry", () => {
  it("lists every model Farbaek names and prices, once each", () => {
    expect([...ids].sort()).toEqual(Object.keys(MODEL_NAMES).sort());
    expect([...ids].sort()).toEqual(Object.keys(RATE_CARD).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("agrees with the rate card on who makes each model and what it is called", () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.provider, m.id).toBe(RATE_CARD[m.id].provider);
      expect(m.name, m.id).toBe(RATE_CARD[m.id].label);
      expect(m.name, m.id).toBe(MODEL_NAMES[m.id]);
    }
  });

  it("puts every model of the build ladders on the tiers the ladder gives it", () => {
    for (const family of ["anthropic", "gemini"] as const) {
      for (const tier of TIERS) {
        const entry = registeredModel(TIER_MODELS[family][tier]);
        expect(entry?.roles, `${family} ${tier}`).toContain("build");
        expect(entry?.tiers, `${family} ${tier}`).toContain(tier);
        expect(entry?.provider).toBe(family);
      }
    }
  });

  it("says a model answers in Chat exactly when Chat's ladder offers it, with the same line", () => {
    const offered = new Map(chatModels().map((m) => [m.id, m]));
    for (const m of MODEL_REGISTRY) {
      expect(m.roles.includes("chat"), m.id).toBe(offered.has(m.id));
      expect(m.about, m.id).toBe(offered.get(m.id)?.about ?? null);
      if (offered.has(m.id)) expect(m.tiers, m.id).toContain(offered.get(m.id)!.tier);
    }
  });

  it("keeps picture and video models off the text ladder, and every text model on it", () => {
    for (const m of MODEL_REGISTRY) {
      if (m.makes === "text") expect(m.tiers.length, m.id).toBeGreaterThan(0);
      else expect(m.tiers, m.id).toEqual([]);
    }
    expect(modelsWith({ makes: "image" }).map((m) => m.id).sort()).toEqual(["gemini-3.1-flash-lite-image", "gpt-image-2.5-sunburst"]);
    expect(modelsWith({ makes: "video" }).map((m) => m.id)).toEqual(["gemini-omni-1.2-flash"]);
  });

  it("answers questions by provider, use and tier together", () => {
    expect(modelsWith({ provider: "openai", role: "chat", tier: "fast" }).map((m) => m.id)).toEqual(["gpt-6-luna"]);
    expect(modelsWith({ provider: "anthropic", tier: "frontier" }).map((m) => m.id)).toEqual(["claude-fable-5-1"]);
    // Sol answers at standard and again at strong, thinking harder (chat/ladder.ts).
    expect(registeredModel("gpt-6.1-sol")?.tiers).toEqual(["standard", "strong"]);
    // Gemini has no model above Argon, so Argon is its frontier too.
    expect(registeredModel("gemini-4-argon")?.tiers).toEqual(["strong", "frontier"]);
    expect(modelsWith({ role: "second-check" }).map((m) => m.id)).toEqual(["gpt-6.1-terra"]);
    expect(modelsWith({})).toHaveLength(MODEL_REGISTRY.length);
  });

  it("returns nothing for a model Farbaek doesn't list", () => {
    expect(registeredModel("gpt-9-unknown")).toBeNull();
    expect(registeredModel("")).toBeNull();
    expect(registeredModel("__proto__")).toBeNull();
  });

  it("shows which uses have a stand-in from another provider, and which have none", () => {
    expect(providersFor("chat").sort()).toEqual(["anthropic", "openai"]);
    expect(providersFor("build").sort()).toEqual(["anthropic", "gemini"]);
    // One provider each: when it is down, the feature is off and says so.
    expect(providersFor("images")).toEqual(["openai"]);
    expect(providersFor("video")).toEqual(["gemini"]);
    expect(providersFor("second-check")).toEqual(["openai"]);
  });
});

describe("when a price was read", () => {
  const today = new Date("2026-11-22T12:00:00Z");

  it("asks for a price again when it was never dated, dated badly or dated long ago", () => {
    expect(priceNeedsCheck({ priceReadOn: null }, today)).toBe(true);
    expect(priceNeedsCheck({ priceReadOn: "last week" }, today)).toBe(true);
    expect(priceNeedsCheck({ priceReadOn: "2026-11-17" }, today)).toBe(false);
    expect(priceNeedsCheck({ priceReadOn: "2026-08-24" }, today)).toBe(false); // 90 days
    expect(priceNeedsCheck({ priceReadOn: "2026-08-23" }, today)).toBe(true); // 91 days
    expect(priceNeedsCheck({ priceReadOn: "2026-11-17" }, today, 3)).toBe(true);
  });

  it("only carries dates that are real days", () => {
    for (const m of MODEL_REGISTRY) {
      if (m.priceReadOn === null) continue;
      expect(m.priceReadOn, m.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isFinite(Date.parse(`${m.priceReadOn}T00:00:00Z`)), m.id).toBe(true);
    }
  });

  it("lists the models to check: today, the ones whose price has no date", () => {
    const due = pricesToCheck(today).map((m) => m.id);
    const undated = MODEL_REGISTRY.filter((m) => m.priceReadOn === null).map((m) => m.id);
    expect(due).toEqual(undated);
    expect(due).toContain("claude-sonnet-5-5" satisfies ModelId);
    // A year on, every price is due.
    expect(pricesToCheck(new Date("2027-11-22T12:00:00Z"))).toHaveLength(MODEL_REGISTRY.length);
  });

  it("says where each price stands: no day recorded, due, or in date", () => {
    expect(priceState({ priceReadOn: null }, today)).toBe("undated");
    expect(priceState({ priceReadOn: "2026-11-17" }, today)).toBe("current");
    expect(priceState({ priceReadOn: "2026-01-01" }, today)).toBe("due");
    // Agrees with the list of prices to check: everything that isn't in date is on it.
    for (const m of MODEL_REGISTRY) expect(priceState(m, today) !== "current", m.id).toBe(priceNeedsCheck(m, today));
  });

  it("lists every model once for staff, the ones to read again first", () => {
    const later = new Date("2027-02-10T12:00:00Z");
    const list = priceCheckList(later);
    expect(list.map((row) => row.model.id).sort()).toEqual(MODEL_REGISTRY.map((m) => m.id).sort());
    const states = list.map((row) => row.state);
    const rank = { due: 0, undated: 1, current: 2 } as const;
    for (let i = 1; i < states.length; i += 1) expect(rank[states[i]!]).toBeGreaterThanOrEqual(rank[states[i - 1]!]);
    // On that day there is some of each, so the order above is really tested.
    expect(new Set(states)).toEqual(new Set(["due", "undated", "current"]));
    // Within a group the registry's own order is kept.
    const undated = list.filter((row) => row.state === "undated").map((row) => row.model.id);
    expect(undated).toEqual(MODEL_REGISTRY.filter((m) => m.priceReadOn === null).map((m) => m.id));
  });

  it("names every maker and every use", () => {
    for (const m of MODEL_REGISTRY) {
      expect(PROVIDER_NAMES[m.provider], m.id).toBeTruthy();
      for (const role of m.roles) expect(ROLE_NAMES[role], `${m.id} ${role}`).toBeTruthy();
    }
  });
});

describe("the registry's page", () => {
  const file = path.join(process.cwd(), "docs/farbaek/FARBAEK_MODEL_REGISTRY.md");

  it("is exactly what the code says (WRITE_DOCS=1 rewrites it)", () => {
    const wanted = registryDocument();
    if (process.env.WRITE_DOCS === "1") {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, wanted);
    }
    expect(existsSync(file), "docs/farbaek/FARBAEK_MODEL_REGISTRY.md is missing: run with WRITE_DOCS=1").toBe(true);
    expect(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).toBe(wanted);
  });

  it("names every model and never leaves a price blank", () => {
    const page = registryDocument();
    for (const m of MODEL_REGISTRY) expect(page, m.id).toContain(`\`${m.id}\``);
    expect(page).not.toMatch(/\$(undefined|NaN)/);
  });
});

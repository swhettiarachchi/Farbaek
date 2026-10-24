import { describe, expect, it } from "vitest";
import { spendAlertEmail, spendAlertToSend, type SpendAlertKind } from "./spend-alert";

const none = new Set<SpendAlertKind>();
const LIMIT = 200_000; // $20 at $0.0001 a unit

describe("which spend alert to send", () => {
  it("sends nothing below 80%, or with no limit", () => {
    expect(spendAlertToSend(159_999, LIMIT, none)).toEqual({ send: null, skip: [] });
    expect(spendAlertToSend(10_000_000, null, none)).toEqual({ send: null, skip: [] });
  });

  it("sends the 80% alert once", () => {
    expect(spendAlertToSend(160_000, LIMIT, none)).toEqual({ send: "ai_spend_80", skip: [] });
    expect(spendAlertToSend(190_000, LIMIT, new Set(["ai_spend_80"]))).toEqual({ send: null, skip: [] });
  });

  it("sends the limit alert once, skipping 80% if it was never sent", () => {
    expect(spendAlertToSend(200_000, LIMIT, none)).toEqual({ send: "ai_spend_100", skip: ["ai_spend_80"] });
    expect(spendAlertToSend(200_000, LIMIT, new Set(["ai_spend_80"]))).toEqual({ send: "ai_spend_100", skip: [] });
    expect(spendAlertToSend(250_000, LIMIT, new Set(["ai_spend_80", "ai_spend_100"]))).toEqual({ send: null, skip: [] });
  });
});

describe("the alert's words", () => {
  it("says the share, the amounts as estimates, and what happens at the limit", () => {
    const at80 = spendAlertEmail("ai_spend_80", 164_200, LIMIT, "2026-10-24");
    expect(at80.subject).toBe("Farbaek's AI use is at 82% of today's limit");
    expect(at80.lines[0]).toBe("Farbaek has used about $16.42 of its $20.00 AI limit for 2026-10-24 (UTC).");
    expect(at80.lines.join(" ")).toContain("estimates");
    const at100 = spendAlertEmail("ai_spend_100", 200_400, LIMIT, "2026-10-24");
    expect(at100.subject).toBe("Farbaek reached today's AI limit");
    expect(at100.lines[1]).toContain("paused for every workspace until midnight UTC");
    for (const l of [...at80.lines, ...at100.lines, at80.subject, at100.subject]) expect(l).not.toContain("—");
  });
});

import { describe, expect, it } from "vitest";
import type { SpendAlertKind } from "@/core/billing/spend-alert";
import type { EmailConfig } from "@/server/email/config";
import type { EmailMessage } from "@/server/email/message";
import { runPlatformAlerts, type PlatformAlertDeps } from "./platform-alerts";
import { alertEmail } from "./platform-alerts-wiring";

const NOW = new Date("2026-10-24T15:00:00Z");
const config = { fromName: "Farbaek", fromAddress: "hello@farbaek.com", siteUrl: "https://www.farbaek.com" } as EmailConfig;

function fake(spent: number, over: Partial<PlatformAlertDeps> & { failSend?: boolean } = {}) {
  const records = new Map<SpendAlertKind, string>();
  const sent: EmailMessage[] = [];
  const deps: PlatformAlertDeps = {
    config,
    to: "owner@example.com",
    limitUnits: 200_000,
    unitsToday: async () => spent,
    recorded: async () => new Set([...records.entries()].filter(([, s]) => s !== "failed").map(([k]) => k)),
    claim: async (_day, kind) => {
      const s = records.get(kind);
      if (s && s !== "failed") return false;
      records.set(kind, "sending");
      return true;
    },
    finish: async (_day, kind, status) => {
      records.set(kind, status);
    },
    skip: async (_day, kind) => {
      if (!records.has(kind)) records.set(kind, "skipped");
    },
    send: async (m) => {
      if (over.failSend) throw new Error("550 mailbox unavailable");
      sent.push(m);
    },
    ...over,
  };
  return { deps, records, sent };
}

describe("platform alerts", () => {
  it("does nothing under 80%", async () => {
    const { deps, sent } = fake(100_000);
    expect(await runPlatformAlerts(deps, NOW)).toEqual({ day: "2026-10-24", share: 50, sent: null, status: null, skipped: [] });
    expect(sent).toEqual([]);
  });

  it("emails the owner once at 80%, with the estimate in words", async () => {
    const { deps, sent, records } = fake(170_000);
    expect((await runPlatformAlerts(deps, NOW)).status).toBe("accepted");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("owner@example.com");
    expect(sent[0]!.subject).toBe("Farbaek's AI use is at 85% of today's limit");
    expect(sent[0]!.text).toContain("about $17.00 of its $20.00");
    expect(records.get("ai_spend_80")).toBe("accepted");
    await runPlatformAlerts(deps, NOW);
    expect(sent).toHaveLength(1);
  });

  it("at the limit sends that alert and records 80% as skipped", async () => {
    const { deps, sent, records } = fake(200_000);
    const run = await runPlatformAlerts(deps, NOW);
    expect(run).toMatchObject({ sent: "ai_spend_100", status: "accepted", skipped: ["ai_spend_80"] });
    expect(records.get("ai_spend_80")).toBe("skipped");
    expect(sent[0]!.subject).toBe("Farbaek reached today's AI limit");
  });

  it("records a refusal so the next run tries again", async () => {
    const failing = fake(170_000, { failSend: true });
    expect((await runPlatformAlerts(failing.deps, NOW)).status).toBe("failed");
    expect(failing.records.get("ai_spend_80")).toBe("failed");
  });

  it("sends nothing when the limit is off", async () => {
    const { deps, sent } = fake(10_000_000, { limitUnits: null });
    expect((await runPlatformAlerts(deps, NOW)).sent).toBeNull();
    expect(sent).toEqual([]);
  });

  it("escapes the HTML", async () => {
    const { deps, sent } = fake(170_000);
    await runPlatformAlerts(deps, NOW);
    expect(sent[0]!.html).not.toMatch(/<script/i);
    expect(sent[0]!.html).toContain("<p");
  });
});

describe("where alerts go", () => {
  it("uses ALERT_EMAIL when it's a plain address, and hello@ otherwise", () => {
    expect(alertEmail(() => "ops@farbaek.com")).toBe("ops@farbaek.com");
    expect(alertEmail(() => undefined)).toBe("hello@farbaek.com");
    expect(alertEmail(() => "not an address")).toBe("hello@farbaek.com");
    expect(alertEmail(() => "a@b.com\r\nBcc: x@y.com")).toBe("hello@farbaek.com");
  });
});

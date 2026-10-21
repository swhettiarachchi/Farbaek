import { describe, expect, it } from "vitest";
import { healthChecks, type HealthSnapshot } from "./health";

const now = new Date("2026-10-21T12:00:00Z");
const calm: HealthSnapshot = {
  runs: { live: 2, stuck: 0, failed24: 1, finished24: 19 },
  audit: { events: 40, lastCheck: { at: "2026-10-20T12:00:00Z", ok: true, through: 38 } },
  paused: [],
  support: { waiting: 1, oldestWaitingAt: "2026-10-21T09:00:00Z" },
};
const state = (s: HealthSnapshot, dbMs = 40) => Object.fromEntries(healthChecks(s, dbMs, now).map((c) => [c.key, c.state]));

describe("health checks", () => {
  it("reads a calm platform as OK everywhere, in words", () => {
    const checks = healthChecks(calm, 40, now);
    expect(Object.values(state(calm))).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
    expect(checks.find((c) => c.key === "support")!.detail).toBe("The oldest has waited 3 hours.");
    expect(checks.find((c) => c.key === "audit")!.value).toBe("Intact");
  });

  it("flags a slow database, stuck runs, many failures, paused switches and a day-old request", () => {
    const busy: HealthSnapshot = {
      runs: { live: 3, stuck: 1, failed24: 4, finished24: 6 },
      audit: calm.audit,
      paused: ["publishing"],
      support: { waiting: 2, oldestWaitingAt: "2026-10-20T08:00:00Z" },
    };
    expect(state(busy, 1200)).toEqual({ database: "attention", runs: "attention", failures: "attention", audit: "ok", switches: "attention", support: "attention" });
    expect(healthChecks(busy, 40, now).find((c) => c.key === "switches")!.detail).toMatch(/^Paused: /);
  });

  it("doesn't call a handful of failures a problem on a busy day", () => {
    expect(state({ ...calm, runs: { live: 0, stuck: 0, failed24: 2, finished24: 2 } }).failures).toBe("ok");
    expect(state({ ...calm, runs: { live: 0, stuck: 0, failed24: 3, finished24: 40 } }).failures).toBe("ok");
  });

  it("says the audit chain is unknown until checked, and needs a look when broken or stale", () => {
    expect(state({ ...calm, audit: { events: 5, lastCheck: null } }).audit).toBe("unknown");
    expect(state({ ...calm, audit: { events: 5, lastCheck: { at: "2026-10-21T11:00:00Z", ok: false, through: 5 } } }).audit).toBe("attention");
    expect(state({ ...calm, audit: { events: 5, lastCheck: { at: "2026-10-01T11:00:00Z", ok: true, through: 5 } } }).audit).toBe("attention");
  });
});

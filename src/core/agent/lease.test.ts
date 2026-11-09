import { describe, expect, it } from "vitest";
import { checkLeaseInput, countsAgainstLease, leaseDaysLeft, leaseRefusal, leaseState, leaseSummary, type AgentLease } from "./lease";

const NOW = new Date("2026-10-30T12:00:00Z");
const P1 = "33333333-3333-4333-8333-333333333333";
const P2 = "44444444-4444-4444-8444-444444444444";
const lease = (over: Partial<AgentLease> = {}): AgentLease => ({ expiresAt: "2027-01-28T12:00:00Z", projects: null, capabilities: ["read", "propose", "model", "mesh"], actionsPerHour: 600, ...over });

describe("a lease's state", () => {
  it("counts whole days left, rounded up, and warns in the last 14", () => {
    expect(leaseDaysLeft(lease(), NOW)).toBe(90);
    expect(leaseState(lease(), NOW)).toBe("active");
    expect(leaseDaysLeft(lease({ expiresAt: "2026-11-13T12:00:00Z" }), NOW)).toBe(14);
    expect(leaseState(lease({ expiresAt: "2026-11-13T12:00:00Z" }), NOW)).toBe("ending_soon");
    expect(leaseDaysLeft(lease({ expiresAt: "2026-10-30T13:00:00Z" }), NOW)).toBe(1);
    expect(leaseState(lease({ expiresAt: "2026-10-30T12:00:00Z" }), NOW)).toBe("ended");
    expect(leaseState(lease({ expiresAt: "not a date" }), NOW)).toBe("ended");
  });

  it("says what it allows in one sentence", () => {
    expect(leaseSummary(lease())).toBe("May read tasks and files, suggest changes, use Farbaek's AI and send files between your devices, on every project, up to 600 requests an hour.");
    expect(leaseSummary(lease({ projects: [P1], capabilities: ["propose", "read"], actionsPerHour: 1200 }))).toBe("May read tasks and files and suggest changes, on 1 project, up to 1,200 requests an hour.");
  });
});

describe("what a lease refuses", () => {
  it("refuses everything but unpairing once it ends, and fails closed on a bad date", () => {
    const ended = lease({ expiresAt: "2026-10-01T00:00:00Z" });
    for (const need of ["read", "propose", "model", "mesh", "none"] as const) expect(leaseRefusal(ended, need, NOW)).toMatchObject({ code: "LEASE_EXPIRED", message: expect.stringContaining("2026-10-01") });
    expect(leaseRefusal(ended, "unpair", NOW)).toBeNull();
    expect(leaseRefusal(lease({ expiresAt: "" }), "read", NOW)).toMatchObject({ code: "LEASE_EXPIRED" });
  });

  it("refuses what it doesn't allow, and lets the profile through", () => {
    const readOnly = lease({ capabilities: ["read"] });
    expect(leaseRefusal(readOnly, "read", NOW)).toBeNull();
    expect(leaseRefusal(readOnly, "none", NOW)).toBeNull();
    expect(leaseRefusal(readOnly, "propose", NOW)).toMatchObject({ code: "OUTSIDE_LEASE", message: expect.stringContaining("suggesting changes") });
    expect(leaseRefusal(readOnly, "model", NOW)).toMatchObject({ code: "OUTSIDE_LEASE", message: expect.stringContaining("Farbaek's AI") });
  });

  it("counts every request against the hourly limit except Mesh and unpairing", () => {
    expect(["read", "propose", "model", "none"].every((n) => countsAgainstLease(n as never))).toBe(true);
    expect(countsAgainstLease("mesh")).toBe(false);
    expect(countsAgainstLease("unpair")).toBe(false);
  });
});

describe("a lease set on the Agents page", () => {
  const ok = { days: "30", projects: null, capabilities: ["propose", "read"], actionsPerHour: "120" };

  it("accepts one within the limits, in the listed order, without duplicates", () => {
    expect(checkLeaseInput(ok)).toEqual({ ok: true, value: { days: 30, projects: null, capabilities: ["read", "propose"], actionsPerHour: 120 } });
    expect(checkLeaseInput({ ...ok, projects: [P1, P1, P2] })).toMatchObject({ ok: true, value: { projects: [P1, P2] } });
  });

  it("refuses one outside them", () => {
    for (const bad of [
      { ...ok, days: "0" },
      { ...ok, days: "91" },
      { ...ok, days: "7.5" },
      { ...ok, days: null },
      { ...ok, actionsPerHour: "9" },
      { ...ok, actionsPerHour: "5001" },
      { ...ok, capabilities: [] },
      { ...ok, capabilities: ["read", "admin"] },
      { ...ok, capabilities: "read" },
      { ...ok, projects: [] },
      { ...ok, projects: ["../etc"] },
      { ...ok, projects: Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) },
    ]) {
      expect(checkLeaseInput(bad).ok).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import { approvalWindow, CLOSING_MS, walletRisk } from "./approval-wallet";

const HOUR = 3_600_000;
const created = "2026-10-20T10:00:00.000Z";
const expires = "2026-10-23T10:00:00.000Z";
const at = (iso: string, plusMs = 0) => new Date(Date.parse(iso) + plusMs);

describe("approvalWindow", () => {
  it("is open with most of the window left just after the proposal is made", () => {
    const w = approvalWindow(created, expires, at(created, HOUR));
    expect(w.state).toBe("open");
    expect(w.msLeft).toBe(71 * HOUR);
    expect(w.fractionLeft).toBeCloseTo(71 / 72);
  });

  it("is closing in its last 12 hours and expired from the end itself", () => {
    expect(approvalWindow(created, expires, at(expires, -CLOSING_MS)).state).toBe("open");
    expect(approvalWindow(created, expires, at(expires, -CLOSING_MS + 1)).state).toBe("closing");
    expect(approvalWindow(created, expires, at(expires, -1)).state).toBe("closing");
    expect(approvalWindow(created, expires, at(expires))).toEqual({ state: "expired", msLeft: 0, fractionLeft: 0 });
    expect(approvalWindow(created, expires, at(expires, HOUR)).state).toBe("expired");
  });

  it("fails closed on an unreadable end date and never shows more than a full bar", () => {
    expect(approvalWindow(created, "not a date", at(created)).state).toBe("expired");
    expect(approvalWindow("not a date", expires, at(created)).fractionLeft).toBe(0);
    expect(approvalWindow(created, expires, at(created, -HOUR)).fractionLeft).toBe(1);
  });
});

describe("walletRisk", () => {
  const lens = (over: Partial<{ hunks: number; matched: number; unexplained: number; outside: number; flagged: number }> = {}) => ({ hunks: 3, matched: 0, unexplained: 0, outside: 0, flagged: 0, ...over });

  it("states an escalation, flags and unexplained changes, most serious first", () => {
    expect(walletRisk({ policyOutcome: "ESCALATE", lens: lens({ flagged: 1, unexplained: 2 }), changes: [{ kind: "edit" }] })).toEqual([
      { kind: "escalated", tone: "approval", label: "Escalated: an owner or admin approves" },
      { kind: "flagged", tone: "failed", label: "1 change flagged by the contract" },
      { kind: "unexplained", tone: "approval", label: "2 changes no clause explains" },
      { kind: "files", tone: "neutral", label: "1 edited file" },
    ]);
  });

  it("says how many changes match a clause, and counts new and edited files", () => {
    expect(walletRisk({ policyOutcome: "REQUIRE_APPROVAL", lens: lens({ hunks: 2, matched: 2 }), changes: [{ kind: "create" }, { kind: "create" }, { kind: "edit" }] })).toEqual([
      { kind: "matched", tone: "neutral", label: "2 changes match a clause by its words" },
      { kind: "files", tone: "neutral", label: "2 new files, 1 edited file" },
    ]);
  });

  it("leaves the lens out when there's no contract to read against", () => {
    expect(walletRisk({ policyOutcome: null, lens: null, changes: [{ kind: "edit" }, { kind: "edit" }] })).toEqual([{ kind: "files", tone: "neutral", label: "2 edited files" }]);
    expect(walletRisk({ policyOutcome: null, lens: lens({ hunks: 0 }), changes: [] })).toEqual([]);
  });
});

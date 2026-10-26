import { describe, expect, it } from "vitest";
import { hasUnreadReply, newRequestInput, priorityFirst, supportBody, waitingFor } from "./support";

describe("support requests", () => {
  it("checks a new request the way the database does", () => {
    expect(newRequestInput({ topic: "billing", subject: "  When   does my trial end? ", body: " Thanks " })).toEqual({ ok: true, topic: "billing", subject: "When does my trial end?", body: "Thanks" });
    expect(newRequestInput({ topic: "pizza", subject: "Hello there", body: "Hi" })).toEqual({ ok: false, error: "TOPIC" });
    expect(newRequestInput({ topic: "other", subject: "Hi", body: "Hi" })).toEqual({ ok: false, error: "SUBJECT" });
    expect(newRequestInput({ topic: "other", subject: "x".repeat(121), body: "Hi" })).toEqual({ ok: false, error: "SUBJECT" });
    expect(newRequestInput({ topic: "other", subject: "Hello there", body: "   " })).toEqual({ ok: false, error: "BODY" });
    expect(supportBody("x".repeat(4000))).toHaveLength(4000);
    expect(supportBody("x".repeat(4001))).toBeNull();
    expect(supportBody(42)).toBeNull();
  });

  it("marks a reply unread until the person opens the request after it", () => {
    expect(hasUnreadReply({ lastStaffAt: null, customerSeenAt: null })).toBe(false);
    expect(hasUnreadReply({ lastStaffAt: "2026-10-21T10:00:00Z", customerSeenAt: null })).toBe(true);
    expect(hasUnreadReply({ lastStaffAt: "2026-10-21T10:00:00Z", customerSeenAt: "2026-10-21T09:00:00Z" })).toBe(true);
    expect(hasUnreadReply({ lastStaffAt: "2026-10-21T10:00:00Z", customerSeenAt: "2026-10-21T10:05:00Z" })).toBe(false);
  });

  it("says how long something has waited in plain words", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    expect(waitingFor("2026-10-21T12:00:00Z", now)).toBe("1 minute");
    expect(waitingFor("2026-10-21T11:15:00Z", now)).toBe("45 minutes");
    expect(waitingFor("2026-10-21T09:00:00Z", now)).toBe("3 hours");
    expect(waitingFor("2026-10-18T12:00:00Z", now)).toBe("3 days");
  });
});

describe("priority support (ADR 0084)", () => {
  it("puts priority requests first and keeps each group's own order", () => {
    const rows = [
      { id: "a", priority: false },
      { id: "b", priority: true },
      { id: "c", priority: false },
      { id: "d", priority: true },
    ];
    expect(priorityFirst(rows).map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
    expect(priorityFirst([])).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { trialWindow, type TrialReminderKind } from "@/core/billing/trial";
import { readEmailConfig } from "@/server/email/config";
import { SmtpError, type SmtpConfig } from "@/server/email/smtp";
import { checkSchedulerToken } from "./auth";
import { runTrialReminders, type TrialReminderCandidate, type TrialReminderDeps } from "./trial-reminders";

const start = new Date("2026-10-13T09:30:00.000Z");
const DAY = 86_400_000;
const at = (ms: number) => new Date(start.getTime() + ms);
const config = readEmailConfig({ SMTP_PASSWORD: "pw" })!;

type Row = { status: string; recipients: number; detail: string | null };

/** An in-memory stand-in for migration v36's functions. */
function fakeDb(candidates: Omit<TrialReminderCandidate, "recorded">[], over: Partial<TrialReminderDeps> = {}) {
  const rows = new Map<string, Row>();
  const key = (org: string, kind: string) => `${org}:${kind}`;
  const sends: { to: string; data: string }[] = [];
  const deps: TrialReminderDeps = {
    config,
    candidates: async () =>
      candidates.map((c) => ({
        ...c,
        recorded: new Set([...rows].filter(([k, r]) => k.startsWith(`${c.orgId}:`) && r.status !== "failed").map(([k]) => k.split(":")[1] as TrialReminderKind)),
      })),
    claim: async (org, kind) => {
      const r = rows.get(key(org, kind));
      if (r && r.status !== "failed") return false;
      rows.set(key(org, kind), { status: "sending", recipients: 0, detail: null });
      return true;
    },
    finish: async (org, kind, status, recipients, detail) => {
      rows.set(key(org, kind), { status, recipients, detail });
    },
    skip: async (org, kind, reason) => {
      if (!rows.has(key(org, kind))) rows.set(key(org, kind), { status: "skipped", recipients: 0, detail: reason });
    },
    emailOf: async (id) => ({ u1: "ada@example.com", u2: "grace@example.com" })[id] ?? null,
    wants: async () => true,
    send: vi.fn(async (_c: SmtpConfig, envelope: { from: string; to: string }, data: string) => {
      sends.push({ to: envelope.to, data });
    }),
    ...over,
  };
  return { deps, rows, sends };
}

const studio = { orgId: "org-1", orgName: "Alice Studio", window: trialWindow(start), owners: ["u1"] };
const plain = (data: string) => Buffer.from(data.split('Content-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1]!.split("\r\n--")[0]!.replace(/\r\n/g, ""), "base64").toString("utf8");

describe("the trial reminder job", () => {
  it("sends the latest due reminder to the owner, records it, and sends nothing on the next run", async () => {
    const { deps, rows, sends } = fakeDb([studio]);
    expect(await runTrialReminders(deps, at(10 * DAY))).toEqual({ workspaces: 1, accepted: 1, failed: 0, noRecipient: 0, skipped: 0 });
    expect(sends.map((s) => s.to)).toEqual(["ada@example.com"]);
    const text = plain(sends[0]!.data);
    expect(text).toContain("The Pro trial for Alice Studio has 4 days left.");
    expect(text).toContain("See your plan: https://www.farbaek.com/app/billing");
    expect(text).toContain("Choose which emails you get: https://www.farbaek.com/app/settings#email");
    expect(rows.get("org-1:day_7")).toEqual({ status: "accepted", recipients: 1, detail: null });
    expect(await runTrialReminders(deps, at(10 * DAY + 3_600_000))).toMatchObject({ accepted: 0, skipped: 0 });
    expect(sends).toHaveLength(1);
  });

  it("skips earlier reminders after a gap, so nobody gets a burst", async () => {
    const { deps, rows, sends } = fakeDb([studio]);
    expect(await runTrialReminders(deps, at(13 * DAY + 60_000))).toMatchObject({ accepted: 1, skipped: 2 });
    expect(sends).toHaveLength(1);
    expect(plain(sends[0]!.data)).toContain("has 1 day left");
    expect([rows.get("org-1:day_7")?.detail, rows.get("org-1:day_12")?.detail]).toEqual(["superseded", "superseded"]);
  });

  it("emails only owners who want trial reminders and have a confirmed address", async () => {
    const two = { ...studio, owners: ["u1", "u2", "u3"] };
    const { deps, sends } = fakeDb([two], { wants: async (id) => id !== "u2" });
    await runTrialReminders(deps, at(7 * DAY));
    expect(sends.map((s) => s.to)).toEqual(["ada@example.com"]);

    const off = fakeDb([studio], { wants: async () => false });
    expect(await runTrialReminders(off.deps, at(7 * DAY))).toMatchObject({ noRecipient: 1, accepted: 0 });
    expect(off.rows.get("org-1:day_7")?.status).toBe("no_recipient");
    expect(off.sends).toEqual([]);
  });

  it("records a refusal and tries again on a later run", async () => {
    let refuse = true;
    const { deps, rows, sends } = fakeDb([studio], {});
    const send = deps.send!;
    deps.send = vi.fn(async (c, e, d) => {
      if (refuse) throw new SmtpError("The mail server refused it: 451 try later", 451);
      await send(c, e, d);
    });
    expect(await runTrialReminders(deps, at(7 * DAY))).toMatchObject({ failed: 1, accepted: 0 });
    expect(rows.get("org-1:day_7")).toMatchObject({ status: "failed", detail: "The mail server refused it: 451 try later" });
    refuse = false;
    expect(await runTrialReminders(deps, at(7 * DAY + 3_600_000))).toMatchObject({ accepted: 1 });
    expect(sends).toHaveLength(1);
  });

  it("keeps going when one workspace's lookup fails", async () => {
    const other = { ...studio, orgId: "org-2", owners: ["u2"] };
    const { deps, rows, sends } = fakeDb([studio, other], {
      emailOf: async (id) => {
        if (id === "u1") throw new Error("auth lookup timed out");
        return "grace@example.com";
      },
    });
    expect(await runTrialReminders(deps, at(7 * DAY))).toMatchObject({ workspaces: 2, failed: 1, accepted: 1 });
    expect(rows.get("org-1:day_7")).toMatchObject({ status: "failed", detail: "auth lookup timed out" });
    expect(sends.map((s) => s.to)).toEqual(["grace@example.com"]);
  });
});

describe("the scheduler's token", () => {
  const request = (auth?: string) => new Request("http://localhost/api/internal/jobs/trial-reminders", { method: "POST", headers: auth ? { authorization: auth } : {} });

  it("is required, and must match", () => {
    expect(checkSchedulerToken(request("Bearer s3cret-value"), "s3cret-value")).toBe("ok");
    expect(checkSchedulerToken(request("Bearer wrong"), "s3cret-value")).toBe("denied");
    expect(checkSchedulerToken(request(), "s3cret-value")).toBe("denied");
    expect(checkSchedulerToken(request("Bearer anything"), null)).toBe("missing");
  });
});

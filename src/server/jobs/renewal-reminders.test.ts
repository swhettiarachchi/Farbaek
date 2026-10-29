import { describe, expect, it, vi } from "vitest";
import { renewalReminderEmail } from "@/core/billing/renewal-emails";
import { readEmailConfig } from "@/server/email/config";
import { SmtpError, type SmtpConfig } from "@/server/email/smtp";
import { runRenewalReminders, type RenewalCandidate, type RenewalReminderDeps } from "./renewal-reminders";

const NOW = new Date("2027-10-05T09:00:00.000Z");
const RENEWS = new Date("2027-10-29T08:51:00.000Z");
const config = readEmailConfig({ SMTP_PASSWORD: "pw" })!;

/** An in-memory stand-in for migration v66's functions. */
function fakeDb(candidates: RenewalCandidate[], over: Partial<RenewalReminderDeps> = {}) {
  const rows = new Map<string, { status: string; recipients: number; detail: string | null }>();
  const key = (org: string, at: Date) => `${org}:${at.toISOString()}`;
  const sends: { to: string; data: string }[] = [];
  const deps: RenewalReminderDeps = {
    config,
    candidates: async () => candidates.filter((c) => (rows.get(key(c.orgId, c.renewsAt))?.status ?? "failed") === "failed"),
    claim: async (org, at) => {
      const r = rows.get(key(org, at));
      if (r && r.status !== "failed") return false;
      rows.set(key(org, at), { status: "claimed", recipients: 0, detail: null });
      return true;
    },
    finish: async (org, at, status, recipients, detail) => {
      rows.set(key(org, at), { status, recipients, detail });
    },
    recipients: async (org) => (org === "org-1" ? ["ada@example.com", "grace@example.com"] : []),
    send: vi.fn(async (_c: SmtpConfig, envelope: { from: string; to: string }, data: string) => {
      sends.push({ to: envelope.to, data });
    }),
    ...over,
  };
  return { deps, rows, sends };
}

const lite: RenewalCandidate = { orgId: "org-1", orgName: "Alice Studio", planId: "lite", renewsAt: RENEWS };
const plain = (data: string) => Buffer.from(data.split('Content-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1]!.split("\r\n--")[0]!.replace(/\r\n/g, ""), "base64").toString("utf8");

describe("the yearly renewal reminder (ADR 0105)", () => {
  it("says the date, the yearly amount and how to stop it, with no em dashes", () => {
    const e = renewalReminderEmail("maker", RENEWS, "Alice Studio");
    expect(e.subject).toBe("Your Farbaek Maker yearly plan renews soon");
    expect(e.lines[0]).toBe("Alice Studio's Maker yearly plan renews on Fri 29 Oct 2027, 08:51 UTC for $23.88 USD plus any applicable tax, for another year.");
    expect(e.lines[1]).toContain("cancel in Billing before then");
    expect([e.subject, ...e.lines].join(" ")).not.toMatch(/—/);
  });

  it("emails the owners and admins once per renewal, and nothing on the next run", async () => {
    const { deps, rows, sends } = fakeDb([lite]);
    expect(await runRenewalReminders(deps, NOW)).toEqual({ workspaces: 1, accepted: 1, failed: 0, noRecipient: 0 });
    expect(sends.map((s) => s.to)).toEqual(["ada@example.com", "grace@example.com"]);
    const text = plain(sends[0]!.data);
    expect(text).toContain("Alice Studio's Lite yearly plan renews on Fri 29 Oct 2027, 08:51 UTC for $11.88 USD");
    expect(text).toContain("See your plan: https://www.farbaek.com/app/billing");
    expect([...rows.values()]).toEqual([{ status: "accepted", recipients: 2, detail: null }]);
    expect(await runRenewalReminders(deps, NOW)).toEqual({ workspaces: 0, accepted: 0, failed: 0, noRecipient: 0 });
    expect(sends).toHaveLength(2);
  });

  it("records a workspace with no address, and tries a failed one again on the next run", async () => {
    const none = fakeDb([{ ...lite, orgId: "org-2" }]);
    expect(await runRenewalReminders(none.deps, NOW)).toMatchObject({ noRecipient: 1 });
    expect(none.sends).toHaveLength(0);

    let fail = true;
    const flaky = fakeDb([lite], {
      send: vi.fn(async () => {
        if (fail) throw new SmtpError("mock refusal", 550);
      }),
    });
    expect(await runRenewalReminders(flaky.deps, NOW)).toMatchObject({ failed: 1, accepted: 0 });
    expect([...flaky.rows.values()][0]).toMatchObject({ status: "failed" });
    fail = false;
    expect(await runRenewalReminders(flaky.deps, NOW)).toMatchObject({ accepted: 1 });
  });
});

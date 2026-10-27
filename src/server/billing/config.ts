/**
 * Payment settings (ADR 0100). Payments are on only in Dodo's test mode, with
 * both keys set, and only for the workspaces in BILLING_TEST_WORKSPACES: a
 * test card must never buy a real workspace a paid plan. Live mode is refused
 * here until docs/billing/go-live.md is complete. The owner sets the values
 * with scripts/vps/set-dodo.ps1; nothing here ever shows one.
 */
import type { BillingMode, ProviderMode } from "@/core/billing/provider";

type Env = Record<string, string | undefined>;

export interface BillingConfig {
  provider: "dodo";
  mode: ProviderMode;
  apiKey: string;
  webhookKey: string;
  baseUrl: string;
  /** Workspaces that may check out in test mode. */
  testWorkspaces: ReadonlySet<string>;
  siteUrl: string;
}

export const DODO_BASE_URL: Record<ProviderMode, string> = {
  test: "https://test.dodopayments.com",
  live: "https://live.dodopayments.com",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestedBillingMode(env: Env = process.env): BillingMode {
  const mode = env.BILLING_MODE?.trim();
  return mode === "test" || mode === "live" ? mode : "not_connected";
}

function testWorkspaces(env: Env): Set<string> {
  return new Set(
    (env.BILLING_TEST_WORKSPACES ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => UUID.test(s)),
  );
}

/** Null unless payments can run. Fails closed on anything missing or unexpected. */
export function readBillingConfig(env: Env = process.env): BillingConfig | null {
  if (requestedBillingMode(env) !== "test") return null;
  const apiKey = env.DODO_PAYMENTS_API_KEY?.trim();
  const webhookKey = env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  if (!apiKey || !webhookKey) return null;
  return {
    provider: "dodo",
    mode: "test",
    apiKey,
    webhookKey,
    baseUrl: DODO_BASE_URL.test,
    testWorkspaces: testWorkspaces(env),
    siteUrl: (env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.farbaek.com").replace(/\/+$/, ""),
  };
}

/** Whether this workspace may use checkout on this server. */
export function checkoutOpenFor(config: BillingConfig | null, orgId: string): boolean {
  return config !== null && config.testWorkspaces.has(orgId.toLowerCase());
}

/** For the admin's and the office's connection lists: on or off, and why, never a value. */
export function billingStatus(env: Env = process.env): { on: boolean; detail: string } {
  const mode = requestedBillingMode(env);
  if (mode === "not_connected") return { on: false, detail: "Not connected until go-live" };
  if (mode === "live") return { on: false, detail: "Live payments wait for the go-live checklist (docs/billing/go-live.md)" };
  const missing = ["DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY"].filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { on: false, detail: `Test mode needs ${missing.join(" and ")}` };
  const n = testWorkspaces(env).size;
  return { on: true, detail: `Dodo test mode, open to ${n} ${n === 1 ? "workspace" : "workspaces"}` };
}

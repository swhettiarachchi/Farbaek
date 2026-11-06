/**
 * Payment settings (ADR 0100). Payments are on only in Dodo's test mode, with
 * both keys set, and only for the workspaces in BILLING_TEST_WORKSPACES: a
 * test card must never buy a real workspace a paid plan. Live mode, once an
 * owner confirms it in Office Space (ADR 0104), is open to every workspace. The owner sets the values
 * with scripts/vps/set-dodo.ps1; nothing here ever shows one.
 */
import type { BillingMode, ProviderMode } from "@/core/billing/provider";
import { paymentsLiveConfirmed } from "@/server/platform/state";

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

export function testWorkspaces(env: Env): Set<string> {
  return new Set(
    (env.BILLING_TEST_WORKSPACES ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => UUID.test(s)),
  );
}

/**
 * Null unless payments can run. Fails closed on anything missing or
 * unexpected. Live mode also needs an owner's confirmation in Office Space
 * (ADR 0104), read from the platform state; `confirmed` overrides it.
 */
export function readBillingConfig(env: Env = process.env, opts: { confirmed?: boolean } = {}): BillingConfig | null {
  const mode = requestedBillingMode(env);
  if (mode === "not_connected") return null;
  const apiKey = env.DODO_PAYMENTS_API_KEY?.trim();
  const webhookKey = env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  if (!apiKey || !webhookKey) return null;
  if (mode === "live" && !(opts.confirmed ?? paymentsLiveConfirmed())) return null;
  return {
    provider: "dodo",
    mode,
    apiKey,
    webhookKey,
    baseUrl: DODO_BASE_URL[mode],
    testWorkspaces: testWorkspaces(env),
    siteUrl: (env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.farbaek.com").replace(/\/+$/, ""),
  };
}

/**
 * The provider's settings whether or not live payments are confirmed yet:
 * Office Space only, so an owner can create live products before going live.
 */
export function readProviderConfig(env: Env = process.env): BillingConfig | null {
  return readBillingConfig(env, { confirmed: true });
}

/** Whether this workspace may use checkout on this server: every workspace once live, only the listed ones in test mode. */
export function checkoutOpenFor(config: BillingConfig | null, orgId: string): boolean {
  if (!config) return false;
  return config.mode === "live" || config.testWorkspaces.has(orgId.toLowerCase());
}

/** For the admin's and the office's connection lists: on or off, and why, never a value. */
export function billingStatus(env: Env = process.env, confirmed: boolean = paymentsLiveConfirmed()): { on: boolean; detail: string } {
  const mode = requestedBillingMode(env);
  if (mode === "not_connected") return { on: false, detail: "Not connected" };
  const missing = ["DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY"].filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { on: false, detail: `${mode === "live" ? "Live" : "Test"} mode needs ${missing.join(" and ")}` };
  if (mode === "live") return confirmed ? { on: true, detail: "Live payments, open to every workspace" } : { on: false, detail: "Live keys are set; an owner confirms Go live in Office Space" };
  const n = testWorkspaces(env).size;
  return { on: true, detail: `Dodo test mode, open to ${n} ${n === 1 ? "workspace" : "workspaces"}` };
}

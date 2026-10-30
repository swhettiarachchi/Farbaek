import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AiUsageDeps } from "@/server/workspace/ai-usage";
import { checkAnthropicKey, checkGatewayUrl, gatewayResolvesPublic, isPublicAddress, keyHint, loadWorkspaceAi, ownKeyMetering, sealModelKey, type OwnKeyRecord } from "./workspace-ai";

// A test-only vault key: 32 zero bytes. Never a real secret.
const TEST_VAULT = Buffer.alloc(32).toString("base64");
const KEY = "sk-ant-test-0000000000000000000000-abcd";

describe("gateway addresses", () => {
  it("accepts https on a public name, normalized", () => {
    expect(checkGatewayUrl(" https://AI-Gateway.Example.com/anthropic/ ")).toEqual({ ok: true, url: "https://ai-gateway.example.com/anthropic", host: "ai-gateway.example.com" });
  });

  it("refuses anything that could point Farbaek's server at a private network or leak credentials", () => {
    for (const bad of [
      "http://gw.example.com",
      "https://10.0.0.5",
      "https://[::1]",
      "https://localhost",
      "https://gw.internal",
      "https://intranet",
      "https://gw.example.com:8443",
      "https://user:pass@gw.example.com",
      "https://gw.example.com/?key=x",
      "not a url",
    ]) {
      expect(checkGatewayUrl(bad).ok, bad).toBe(false);
    }
  });

  it("knows public addresses from private, loopback, link-local and shared ones", () => {
    expect(isPublicAddress("104.18.32.7")).toBe(true);
    expect(isPublicAddress("2606:4700::6810:1")).toBe(true);
    for (const a of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "192.168.1.1", "172.20.0.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"]) {
      expect(isPublicAddress(a), a).toBe(false);
    }
  });

  it("uses a gateway only when every address its name resolves to is public", async () => {
    expect(await gatewayResolvesPublic("gw.example.com", async () => [{ address: "104.18.32.7" }])).toBe(true);
    expect(await gatewayResolvesPublic("gw.example.com", async () => [{ address: "104.18.32.7" }, { address: "10.0.0.2" }])).toBe(false);
    expect(await gatewayResolvesPublic("gw.example.com", async () => [])).toBe(false);
    expect(await gatewayResolvesPublic("gw.example.com", async () => Promise.reject(new Error("NXDOMAIN")))).toBe(false);
  });
});

describe("checking a key", () => {
  /** A labelled fake of Anthropic's models endpoint: it never reaches the network. */
  const fake = (status: number | "throw") => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      if (status === "throw") throw new TypeError("network");
      return new Response("{}", { status });
    }) as unknown as typeof fetch;
    return { fetcher, calls };
  };

  it("lists models, a free call, on Anthropic or the gateway", async () => {
    const f = fake(200);
    expect(await checkAnthropicKey(KEY, null, f.fetcher)).toEqual({ ok: true });
    expect(f.calls[0]).toMatchObject({ url: "https://api.anthropic.com/v1/models?limit=1", headers: { "x-api-key": KEY } });
    const g = fake(200);
    await checkAnthropicKey(KEY, "https://gw.example.com/anthropic", g.fetcher);
    expect(g.calls[0]!.url).toBe("https://gw.example.com/anthropic/v1/models?limit=1");
  });

  it("explains a refusal or an outage without ever repeating the key", async () => {
    for (const [status, words] of [
      [401, /didn't accept/],
      [403, /didn't accept/],
      [500, /error \(500\)/],
      ["throw", /couldn't reach/],
    ] as const) {
      const r = await checkAnthropicKey(KEY, null, fake(status).fetcher);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.reason).toMatch(words);
      expect(r.reason).not.toContain(KEY);
      expect(r.reason).not.toContain("abcd");
    }
  });

  it("shows only the key's last characters", () => {
    expect(keyHint(KEY)).toBe("abcd");
    expect(keyHint("ab")).toBe("xxab");
  });
});

describe("metering on the workspace's own key", () => {
  function base() {
    const calls: string[] = [];
    const deps = {
      listUsageGrants: async () => [],
      reserveUsage: async () => (calls.push("reserve"), { ok: true as const, value: "ledger-1" }),
      settleUsage: async () => (calls.push("settle"), { ok: true as const, value: null }),
    } as unknown as AiUsageDeps;
    return { deps, calls };
  }
  const usage = { model: "claude-sonnet-5-5", inputTokens: 1_000, outputTokens: 200 };

  it("never touches Farbaek's allowance, and logs each settled call's real tokens", async () => {
    const { deps, calls } = base();
    const recorded: OwnKeyRecord[] = [];
    const own = ownKeyMetering(deps, async (r) => void recorded.push(r));
    const r = await own.reserveUsage({ orgId: "o1", actor: "u1", key: "k1", operation: "agent_step", taskId: "t1", units: 50, grant: null });
    expect(r).toEqual({ ok: true, value: "own:k1" });
    await own.settleUsage({ orgId: "o1", entryId: "own:k1", status: "settled", units: 40, usage, refundReason: null, retryCap: null });
    expect(calls).toEqual([]);
    expect(recorded).toEqual([{ orgId: "o1", actor: "u1", taskId: "t1", operation: "agent_step", usage }]);
  });

  it("logs nothing for a call that returned nothing, and leaves Farbaek's own entries alone", async () => {
    const { deps, calls } = base();
    const recorded: OwnKeyRecord[] = [];
    const own = ownKeyMetering(deps, async (r) => void recorded.push(r));
    await own.reserveUsage({ orgId: "o1", actor: "u1", key: "k2", operation: "contract_draft", taskId: null, units: 5, grant: null });
    await own.settleUsage({ orgId: "o1", entryId: "own:k2", status: "refunded", units: 0, usage: null, refundReason: "failed", retryCap: null });
    expect(recorded).toEqual([]);
    await own.settleUsage({ orgId: "o1", entryId: "ledger-9", status: "settled", units: 3, usage, refundReason: null, retryCap: null });
    expect(calls).toEqual(["settle"]);
  });
});

describe("a stored key", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.PROVIDER_TOKEN_KEY;
    process.env.PROVIDER_TOKEN_KEY = TEST_VAULT;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PROVIDER_TOKEN_KEY;
    else process.env.PROVIDER_TOKEN_KEY = saved;
  });

  const admin = (row: Record<string, unknown> | null) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) as never;

  it("opens only for the workspace it was sealed for, and fails closed otherwise", async () => {
    const sealed = sealModelKey("org-a", KEY)!;
    expect(sealed).toMatch(/^v1\.k1\./);
    expect(sealed).not.toContain(KEY);
    expect(await loadWorkspaceAi(admin({ key_sealed: sealed, key_hint: "abcd", base_url: null }), "org-a")).toEqual({ own: true, broken: false, apiKey: KEY, baseURL: null, hint: "abcd" });
    // Copied to another workspace's row, it doesn't open.
    expect(await loadWorkspaceAi(admin({ key_sealed: sealed, key_hint: "abcd", base_url: null }), "org-b")).toEqual({ own: true, broken: true, hint: "abcd" });
    expect(await loadWorkspaceAi(admin(null), "org-a")).toEqual({ own: false });
  });

  it("fails closed when its gateway no longer passes the address rules", async () => {
    const sealed = sealModelKey("org-a", KEY)!;
    expect(await loadWorkspaceAi(admin({ key_sealed: sealed, key_hint: "abcd", base_url: "https://localhost/anthropic" }), "org-a")).toEqual({ own: true, broken: true, hint: "abcd" });
  });
});

/**
 * Preview gateway tests with MockSandbox, the in-memory store and a fake
 * upstream (all test-only). They cover the authorization path end to end:
 * host checks, one-use launch, cookie binding, revocation, membership,
 * header stripping, redirect rewriting and SSRF attempts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { newPreviewId, PREVIEW_COOKIE_DEV, signPreviewToken } from "@/core/sandbox/preview";
import type { SandboxServerConfig } from "./config";
import { handlePreviewRequest, type GatewayDeps } from "./gateway";
import { createSandboxService } from "./service";
import { createMemoryStore, type MemoryStore } from "./testing/memory-store";
import { createMockRuntime } from "./testing/mock-runtime";

const ORG = "11111111-1111-4111-8111-111111111111";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECRET = "s".repeat(48);
const DOMAIN = "preview.localhost:3000";
const APP = "http://localhost:3000";

const config: SandboxServerConfig = {
  provider: "e2b",
  unknownProvider: null,
  e2b: { apiKey: "test", domain: null, apiUrl: null, previewProtocol: "https" },
  isolationVerifiedAt: "2026-10-17",
  runtimeMaxSessionMinutes: 60,
  images: { "node-ts": { small: "n-s", standard: "n-st" }, python: { small: "p-s", standard: "p-st" } },
  preview: { domain: DOMAIN, secret: SECRET, protocol: "http" },
  cronSecret: null,
  deploymentId: "test",
};

let store: MemoryStore;
let runtime: ReturnType<typeof createMockRuntime>;
let upstreamCalls: { url: string; init: RequestInit }[];
let upstreamResponse: () => Response;
const now = () => new Date("2026-10-17T10:00:00Z");

function deps(): GatewayDeps {
  return {
    config,
    store,
    runtime,
    now,
    appOrigin: APP,
    fetch: (async (url: string, init: RequestInit) => {
      upstreamCalls.push({ url, init });
      return upstreamResponse();
    }) as unknown as typeof fetch,
  };
}

async function openPreview(user = ALICE): Promise<{ previewId: string; launchUrl: URL }> {
  const service = createSandboxService({
    store,
    resolution: { runtime, reason: null, config },
    role: async () => (user === ALICE ? "owner" : "member"),
    billing: async () => ({ state: "active", paidPlanId: "team" }),
    now,
    randomKey: () => crypto.randomUUID(),
  });
  const created = await service.createSession({ userId: user, orgId: ORG }, { name: "web", template: "node-ts", size: "small", network: "none", minutes: 30, projectId: null, taskId: null }, crypto.randomUUID());
  if (!created.ok) throw new Error(created.message);
  const opened = await service.openPreview({ userId: user, orgId: ORG }, created.value.sessionId, 3000);
  if (!opened.ok) throw new Error(opened.message);
  return { previewId: opened.value.previewId, launchUrl: new URL(opened.value.url) };
}

const req = (url: string, init: RequestInit & { host?: string } = {}) => {
  const u = new URL(url);
  const headers = new Headers(init.headers);
  headers.set("host", init.host ?? u.host);
  return new Request(`http://localhost:3000/sandbox-preview${u.pathname}${u.search}`, { ...init, headers });
};

async function launch(launchUrl: URL): Promise<string> {
  const res = await handlePreviewRequest(req(launchUrl.toString()), deps());
  expect(res.status).toBe(303);
  const cookie = res.headers.get("set-cookie")!;
  expect(cookie).toMatch(/HttpOnly/);
  return cookie.split(";")[0]!;
}

beforeEach(() => {
  store = createMemoryStore(now);
  runtime = createMockRuntime();
  store.members.set(ORG, new Map([[ALICE, "owner"], [BOB, "member"]]));
  upstreamCalls = [];
  upstreamResponse = () => new Response("<h1>app</h1>", { status: 200, headers: { "content-type": "text/html", "x-frame-options": "DENY" } });
});

describe("preview gateway", () => {
  it("only answers on preview hosts for the configured domain", async () => {
    const { previewId } = await openPreview();
    expect((await handlePreviewRequest(req(`http://localhost:3000/`), deps())).status).toBe(404);
    expect((await handlePreviewRequest(req(`http://p-${previewId}.evil.test/`), deps())).status).toBe(404);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("launches once, sets a host cookie and then forwards with the runtime's token", async () => {
    const { previewId, launchUrl } = await openPreview();
    const cookie = await launch(launchUrl);
    expect(cookie.startsWith(`${PREVIEW_COOKIE_DEV}=`)).toBe(true);
    expect((await handlePreviewRequest(req(launchUrl.toString()), deps())).status).toBe(403); // second use

    const res = await handlePreviewRequest(
      req(`http://p-${previewId}.${DOMAIN}/dashboard?tab=1`, { headers: { cookie: `${cookie}; app=1; sb-abc-auth-token=secret; fb_ws=org` } }),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>app</h1>");
    expect(upstreamCalls[0]!.url).toMatch(/^https:\/\/3000-mock\d+\.mock\.test\/dashboard\?tab=1$/);
    const sent = new Headers(upstreamCalls[0]!.init.headers);
    expect(sent.get("e2b-traffic-access-token")).toBe("test-token");
    expect(sent.get("cookie")).toBe("app=1");
    expect(sent.get("host")).toBeNull();
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBe(`frame-ancestors ${APP}`);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("refuses requests without the cookie, with another preview's cookie, or with a forged one", async () => {
    const a = await openPreview();
    const b = await openPreview();
    const cookieA = await launch(a.launchUrl);
    expect((await handlePreviewRequest(req(`http://p-${a.previewId}.${DOMAIN}/`), deps())).status).toBe(401);
    expect((await handlePreviewRequest(req(`http://p-${b.previewId}.${DOMAIN}/`, { headers: { cookie: cookieA } }), deps())).status).toBe(401);
    const forged = await signPreviewToken({ kind: "access", p: a.previewId, u: ALICE, exp: 9e9 }, "w".repeat(48));
    expect((await handlePreviewRequest(req(`http://p-${a.previewId}.${DOMAIN}/`, { headers: { cookie: `${PREVIEW_COOKIE_DEV}=${forged}` } }), deps())).status).toBe(401);
    const launchToken = a.launchUrl.searchParams.get("t")!;
    expect((await handlePreviewRequest(req(`http://p-${a.previewId}.${DOMAIN}/`, { headers: { cookie: `${PREVIEW_COOKIE_DEV}=${launchToken}` } }), deps())).status).toBe(401);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("refuses an expired launch link and links for someone else's preview", async () => {
    const { previewId } = await openPreview();
    const expired = await signPreviewToken({ kind: "launch", p: previewId, u: ALICE, exp: Math.floor(now().getTime() / 1000) - 1 }, SECRET);
    expect((await handlePreviewRequest(req(`http://p-${previewId}.${DOMAIN}/__farbaek/launch?t=${expired}`), deps())).status).toBe(401);
    const bobs = await signPreviewToken({ kind: "launch", p: previewId, u: BOB, exp: Math.floor(now().getTime() / 1000) + 30 }, SECRET);
    expect((await handlePreviewRequest(req(`http://p-${previewId}.${DOMAIN}/__farbaek/launch?t=${bobs}`), deps())).status).toBe(403);
  });

  it("stops forwarding once the preview is revoked or the person leaves the workspace", async () => {
    const revoked = await openPreview();
    const c1 = await launch(revoked.launchUrl);
    await store.revokePreview(revoked.previewId, ALICE);
    expect((await handlePreviewRequest(req(`http://p-${revoked.previewId}.${DOMAIN}/`, { headers: { cookie: c1 } }), deps())).status).toBe(403);

    const left = await openPreview();
    const c2 = await launch(left.launchUrl);
    store.members.get(ORG)!.delete(ALICE);
    expect((await handlePreviewRequest(req(`http://p-${left.previewId}.${DOMAIN}/`, { headers: { cookie: c2 } }), deps())).status).toBe(403);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("keeps every request on the sandbox's own host (no SSRF through the path)", async () => {
    const { previewId, launchUrl } = await openPreview();
    const cookie = await launch(launchUrl);
    await handlePreviewRequest(req(`http://p-${previewId}.${DOMAIN}//evil.example/steal`, { headers: { cookie } }), deps());
    await handlePreviewRequest(req(`http://p-${previewId}.${DOMAIN}/x`, { headers: { cookie, "x-forwarded-host": "169.254.169.254", forwarded: "host=10.0.0.1" } }), deps());
    for (const call of upstreamCalls) expect(new URL(call.url).host).toMatch(/^3000-mock\d+\.mock\.test$/);
    const sent = new Headers(upstreamCalls[1]!.init.headers);
    expect(sent.get("x-forwarded-host")).toBeNull();
    expect(sent.get("forwarded")).toBeNull();
  });

  it("rewrites upstream redirects and drops attempts to overwrite the gateway cookie", async () => {
    const { previewId, launchUrl } = await openPreview();
    const cookie = await launch(launchUrl);
    upstreamResponse = () => {
      const h = new Headers({ location: "https://3000-mock1.mock.test/login" });
      h.append("set-cookie", `${PREVIEW_COOKIE_DEV}=hijack; Path=/`);
      h.append("set-cookie", "session=abc; Path=/");
      return new Response(null, { status: 302, headers: h });
    };
    const res = await handlePreviewRequest(req(`http://p-${previewId}.${DOMAIN}/`, { headers: { cookie } }), deps());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.getSetCookie()).toEqual(["session=abc; Path=/"]);
  });

  it("refuses WebSocket upgrades and shows a clear page when nothing listens", async () => {
    const { previewId, launchUrl } = await openPreview();
    const cookie = await launch(launchUrl);
    expect((await handlePreviewRequest(req(`http://p-${previewId}.${DOMAIN}/_next/webpack-hmr`, { headers: { cookie, upgrade: "websocket" } }), deps())).status).toBe(501);
    const failing: GatewayDeps = { ...deps(), fetch: (async () => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch };
    const res = await handlePreviewRequest(req(`http://p-${previewId}.${DOMAIN}/`, { headers: { cookie } }), failing);
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("Nothing answered on port 3000");
  });

  it("ignores hosts with a valid-looking id that has no preview", async () => {
    const res = await handlePreviewRequest(req(`http://p-${newPreviewId()}.${DOMAIN}/`), deps());
    expect(res.status).toBe(401);
  });
});

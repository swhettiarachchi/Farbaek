import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ ctx: null as unknown, signedIn: true as boolean, contextLoads: 0, allowed: true as boolean, rpcError: null as { message: string } | null }));
vi.mock("@/server/workspace/context", () => ({
  isDemoMode: () => false,
  loadAppContext: async () => {
    state.contextLoads++;
    return state.ctx;
  },
}));
vi.mock("@/server/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: async () => ({ data: state.signedIn ? { claims: { sub: USER } } : null }) } }),
}));
vi.mock("@/server/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: async () => ({ data: state.allowed, error: state.rpcError }) }),
}));
const { relayHub, withRelayBrowser } = await import("./relay-http");
const presence = await import("@/app/api/v1/mesh/relay/presence/route");
const joinRoute = await import("@/app/api/v1/mesh/relay/sessions/[id]/join/route");

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const live = { mode: "live", user: { id: USER }, current: { id: ORG }, role: "member" };

const request = (method = "POST", headers: Record<string, string> = {}) =>
  new Request("https://www.farbaek.com/api/v1/mesh/relay/calls", { method, headers: { origin: "https://www.farbaek.com", "x-farbaek-device": DEVICE, ...headers } });
const call = async (r: Request) => {
  let seen: unknown = null;
  const res = await withRelayBrowser(r, async (ctx) => {
    seen = ctx.relay;
    return new Response("ok");
  });
  return { status: res.status, body: res.status === 200 ? null : ((await res.json()) as { error: { code: string } }).error.code, seen };
};

beforeEach(() => {
  state.ctx = live;
  state.signedIn = true;
  state.contextLoads = 0;
  state.allowed = true;
  state.rpcError = null;
});

describe("a browser's relay routes", () => {
  it("name the browser by the person and its device, in their current workspace", async () => {
    expect(await call(request())).toEqual({ status: 200, body: null, seen: { agentId: `browser:${USER}:${DEVICE}`, orgId: ORG } });
  });

  it("refuse no session, the demo, no workspace, another site, no device, and too many requests", async () => {
    state.ctx = null;
    expect((await call(request())).status).toBe(401);
    state.ctx = { ...live, mode: "demo" };
    expect((await call(request())).status).toBe(403);
    state.ctx = { ...live, role: null };
    expect((await call(request())).status).toBe(403);
    state.ctx = live;
    expect(await call(request("POST", { origin: "https://evil.example" }))).toMatchObject({ status: 403, body: "FORBIDDEN" });
    expect(await call(request("POST", { "x-farbaek-device": "not-a-uuid" }))).toMatchObject({ status: 400, body: "INVALID_REQUEST" });
    state.allowed = false;
    expect(await call(request())).toMatchObject({ status: 429, body: "RATE_LIMITED" });
    state.allowed = true;
    state.rpcError = { message: "down" };
    expect((await call(request())).status).toBe(503);
  });

  it("keep a browser reachable in memory only, hand it calls from its workspace, and let it join (ADR 0097)", async () => {
    const url = "https://www.farbaek.com/api/v1/mesh/relay/presence";
    const headers = { origin: "https://www.farbaek.com", "x-farbaek-device": DEVICE, "content-type": "application/json" };
    const phone = "0123456789abcdef";
    const on = await presence.POST(new Request(url, { method: "POST", headers, body: JSON.stringify({ fingerprint: phone, on: true }) }));
    expect(on.status).toBe(200);
    expect(relayHub().isReachable(`browser:${USER}:${DEVICE}`)).toBe(true);
    expect((await presence.POST(new Request(url, { method: "POST", headers, body: JSON.stringify({ on: true }) }))).status).toBe(400);

    // A computer of another workspace can't reach it; one of the same workspace can.
    expect(relayHub().call({ agentId: "agent-elsewhere", orgId: "44444444-4444-4444-8444-444444444444" }, phone, "fedcba9876543210", "relay")).toMatchObject({ ok: false, code: "NOT_REACHABLE" });
    const called = relayHub().call({ agentId: "agent-studio", orgId: ORG }, phone, "fedcba9876543210", "direct");
    if (!called.ok) throw new Error(called.message);
    const waited = await presence.GET(new Request(`${url}?wait=0`, { headers: { "x-farbaek-device": DEVICE } }));
    expect(((await waited.json()) as { data: unknown }).data).toEqual({ calls: [{ session: called.value.session, from: "fedcba9876543210", mode: "direct" }] });

    const join = (id: string, h: Record<string, string> = headers) => joinRoute.POST(new Request(`https://www.farbaek.com/api/v1/mesh/relay/sessions/${id}/join`, { method: "POST", headers: h, body: "{}" }), { params: Promise.resolve({ id }) });
    expect((await join(called.value.session, { ...headers, origin: "https://evil.example" })).status).toBe(403);
    expect((await join(called.value.session)).status).toBe(200);
    expect((await join("55555555-5555-4555-8555-555555555555")).status).toBe(404);

    expect((await presence.POST(new Request(url, { method: "POST", headers, body: JSON.stringify({ on: false }) }))).status).toBe(200);
    expect(relayHub().isReachable(`browser:${USER}:${DEVICE}`)).toBe(false);
  });

  it("answer 401 in words when the session has ended, instead of a page helper's redirect to sign-in", async () => {
    state.signedIn = false;
    expect(await call(request())).toMatchObject({ status: 401, body: "UNAUTHENTICATED", seen: null });
    expect(await call(request("GET"))).toMatchObject({ status: 401, body: "UNAUTHENTICATED" });
    expect(state.contextLoads).toBe(0);
  });

  it("let a read through without an origin, since it can't change anything or be read by another site", async () => {
    expect((await call(new Request("https://www.farbaek.com/api/v1/mesh/relay/sessions/x/data", { headers: { "x-farbaek-device": DEVICE } }))).status).toBe(200);
  });
});

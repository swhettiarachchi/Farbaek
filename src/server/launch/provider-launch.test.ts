import { describe, expect, it } from "vitest";
import type { LaunchOrderView, LaunchStore } from "./provider-store";
import { authorizeVercelLaunch, connectVercel, disconnectVercel, fileSha256, refreshVercelLaunch, runVercelLaunch, type LaunchDeps, type LaunchPerson } from "./provider-launch";
import { openToken, vaultKey } from "./token-vault";
import type { VercelClient, VercelDeployment, VercelResult } from "./vercel-client";

const KEY = vaultKey({ PROVIDER_TOKEN_KEY: Buffer.alloc(32, 3).toString("base64") })!;
const owner: LaunchPerson = { orgId: "o1", userId: "u-owner", role: "owner", permissions: {} };
const TOKEN = "vercel_token_abcdefghijklmnop";
const FILES = [
  { path: "index.html", content: "<h1>Hi</h1>" },
  { path: "styles.css", content: "body{}" },
].map((f) => ({ ...f, sha256: fileSha256(f.content) }));
const PLAN = { kind: "static" as const, build: null, output: null };
const SETTINGS = { framework: null, buildCommand: null, outputDirectory: null };

const deployment = (readyState: string, extra: Partial<VercelDeployment> = {}): VercelDeployment => ({
  id: "dpl_1",
  url: "storefront-abc123.vercel.app",
  inspectorUrl: "https://vercel.com/suvin/storefront/dpl_1",
  readyState,
  errorMessage: null,
  aliases: [],
  ...extra,
});

function fakes(over: { states?: string[]; uploadFails?: boolean; createFails?: boolean; whoamiFails?: boolean; authorizeError?: string; orderStatus?: LaunchOrderView["status"]; sealed?: string | null } = {}) {
  const calls: string[] = [];
  const updates: Parameters<LaunchStore["update"]>[0][] = [];
  const health: number[] = [];
  let stored: string | null = null;
  const states = [...(over.states ?? ["BUILDING", "READY"])];
  const order = (status: LaunchOrderView["status"]): LaunchOrderView =>
    ({ id: "ord_1", status, filesDigest: "x", deploymentId: "dpl_1", updatedAt: new Date(Date.now() - 60_000).toISOString() }) as LaunchOrderView;
  const store: LaunchStore = {
    connect: async (i) => {
      stored = i.sealed;
      calls.push(`connect:${i.accountName}:${i.limit}`);
      return { ok: true, value: "c1" };
    },
    disconnect: async () => ({ ok: true, value: null }),
    sealedToken: async () => (over.sealed === null ? null : { sealed: over.sealed ?? stored ?? "", teamId: null }),
    authorize: async (i) => (calls.push(`authorize:${i.digest.length}:${i.fileCount}`), over.authorizeError ? { ok: false, error: over.authorizeError } : { ok: true, value: "ord_1" }),
    update: async (i) => (updates.push(i), { ok: true, value: null }),
    recordHealth: async (i) => (health.push(i.status), { ok: true, value: null }),
    order: async () => order(over.orderStatus ?? "authorized"),
  };
  const vercel = (token: string): VercelClient =>
    ({
      whoami: async () => (over.whoamiFails ? { ok: false, code: "AUTH", message: "Vercel didn't accept the token." } : token === TOKEN ? { ok: true, value: { id: "u_1", username: "suvin" } } : { ok: false, code: "AUTH", message: "wrong" }),
      uploadFile: async (content: Buffer) => (calls.push(`upload:${content.length}`), over.uploadFails ? { ok: false, code: "INVALID", message: "Vercel refused it." } : { ok: true, value: { sha: "s".repeat(40), size: content.length } }),
      createDeployment: async () => (calls.push("create"), over.createFails ? { ok: false, code: "PAYMENT", message: "Vercel says this account needs a payment method." } : { ok: true, value: deployment("QUEUED") }),
      getDeployment: async (): Promise<VercelResult<VercelDeployment>> => {
        const state = states.shift() ?? "READY";
        calls.push(`state:${state}`);
        return { ok: true, value: deployment(state, state === "READY" ? { aliases: ["storefront.vercel.app"] } : state === "ERROR" ? { errorMessage: "Command \"npm run build\" exited with 1" } : {}) };
      },
    }) as unknown as VercelClient;
  const deps: LaunchDeps = { store, key: KEY, vercel, netlify: () => { throw new Error("Netlify isn't part of these tests."); }, files: async () => FILES, probe: async () => 200, sleep: async () => undefined };
  return { deps, calls, updates, health, sealed: () => stored };
}

const authorizeInput = { projectId: "p1", key: "k1", target: "storefront", confirm: "storefront", overrideReason: null, plan: PLAN, settings: SETTINGS };

describe("connecting Vercel", () => {
  it("lets owners and admins connect after Vercel confirms the token, and stores it sealed", async () => {
    const f = fakes();
    expect(await connectVercel(f.deps, owner, { token: ` ${TOKEN} `, teamId: null, limit: 1 })).toEqual({ ok: true, value: { accountName: "suvin" } });
    expect(f.calls).toEqual(["connect:suvin:1"]);
    expect(f.sealed()).not.toContain(TOKEN);
    expect(openToken(f.sealed()!, KEY, { orgId: "o1", provider: "vercel" })).toBe(TOKEN);
  });

  it("refuses members, a server without a vault, a malformed token or team, and a token Vercel rejects", async () => {
    expect(await connectVercel(fakes().deps, { ...owner, role: "member" }, { token: TOKEN, teamId: null, limit: 1 })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await connectVercel({ ...fakes().deps, key: null }, owner, { token: TOKEN, teamId: null, limit: 1 })).toMatchObject({ ok: false, message: expect.stringMatching(/isn't set up/) });
    expect(await connectVercel(fakes().deps, owner, { token: "short", teamId: null, limit: 1 })).toMatchObject({ ok: false, message: expect.stringMatching(/doesn't look like a Vercel token/) });
    expect(await connectVercel(fakes().deps, owner, { token: TOKEN, teamId: "team id", limit: 1 })).toMatchObject({ ok: false, message: expect.stringMatching(/team ID/) });
    expect(await connectVercel(fakes({ whoamiFails: true }).deps, owner, { token: TOKEN, teamId: null, limit: 1 })).toMatchObject({ ok: false, message: "Vercel didn't accept the token." });
    expect(await disconnectVercel(fakes().deps, { ...owner, role: "member" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("authorizing a launch", () => {
  it("refuses projects Vercel doesn't suit, bad names, a missing confirmation and a short reason", async () => {
    const d = fakes().deps;
    expect(await authorizeVercelLaunch(d, owner, { ...authorizeInput, plan: { ...PLAN, kind: "node_server" } })).toMatchObject({ ok: false, message: expect.stringMatching(/long-running/) });
    expect(await authorizeVercelLaunch(d, owner, { ...authorizeInput, target: "Store Front", confirm: "Store Front" })).toMatchObject({ ok: false, code: "INVALID_NAME" });
    expect(await authorizeVercelLaunch(d, owner, { ...authorizeInput, confirm: "store" })).toMatchObject({ ok: false, message: "Type storefront to confirm." });
    expect(await authorizeVercelLaunch(d, owner, { ...authorizeInput, overrideReason: "soon" })).toMatchObject({ ok: false, message: expect.stringMatching(/at least 10/) });
    expect(await authorizeVercelLaunch(d, { ...owner, role: "viewer" }, authorizeInput)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await authorizeVercelLaunch(d, { ...owner, role: "member", permissions: { publish: false } }, authorizeInput)).toMatchObject({ ok: false, code: "PERMISSION_WITHHELD" });
  });

  it("says plainly why the database refused it", async () => {
    expect(await authorizeVercelLaunch(fakes({ authorizeError: "EVIDENCE_REQUIRED" }).deps, owner, authorizeInput)).toMatchObject({ ok: false, message: expect.stringMatching(/isn't verified/) });
    expect(await authorizeVercelLaunch(fakes({ authorizeError: "LAUNCH_RUNNING" }).deps, owner, authorizeInput)).toMatchObject({ ok: false, message: expect.stringMatching(/already under way/) });
  });

  it("authorizes exactly these files and starts once; a repeated press doesn't start it again", async () => {
    const f = fakes();
    expect(await authorizeVercelLaunch(f.deps, owner, authorizeInput)).toEqual({ ok: true, value: { orderId: "ord_1" } });
    expect(f.calls[0]).toBe("authorize:64:2");
    const again = fakes({ orderStatus: "building" });
    await authorizeVercelLaunch(again.deps, owner, authorizeInput);
    await new Promise((r) => setTimeout(r, 10));
    expect(again.calls.filter((c) => c.startsWith("upload"))).toEqual([]);
  });
});

describe("carrying out a launch", () => {
  const input = { orgId: "o1", orderId: "ord_1", target: "storefront", settings: SETTINGS, files: FILES };

  it("uploads each file, deploys to production, follows the build, and checks the public address", async () => {
    const f = fakes();
    await connectVercel(f.deps, owner, { token: TOKEN, teamId: null, limit: 1 });
    expect(await runVercelLaunch(f.deps, input)).toBe("ready");
    expect(f.calls.filter((c) => c.startsWith("upload"))).toHaveLength(2);
    expect(f.updates.map((u) => u.status)).toEqual(["uploading", "building", "ready"]);
    expect(f.updates[1]).toMatchObject({ deploymentId: "dpl_1", inspectorUrl: "https://vercel.com/suvin/storefront/dpl_1" });
    expect(f.updates[2]).toMatchObject({ url: "https://storefront.vercel.app" });
    expect(f.health).toEqual([200]);
  });

  it("records why, when a file doesn't upload, Vercel refuses the deployment, or the build fails", async () => {
    const upload = fakes({ uploadFails: true });
    await connectVercel(upload.deps, owner, { token: TOKEN, teamId: null, limit: 1 });
    expect(await runVercelLaunch(upload.deps, input)).toBe("failed");
    expect(upload.updates.at(-1)).toMatchObject({ status: "failed", failure: expect.stringMatching(/^index.html didn't upload/) });

    const create = fakes({ createFails: true });
    await connectVercel(create.deps, owner, { token: TOKEN, teamId: null, limit: 1 });
    expect(await runVercelLaunch(create.deps, input)).toBe("failed");
    expect(create.updates.at(-1)).toMatchObject({ failure: "Vercel says this account needs a payment method." });

    const build = fakes({ states: ["BUILDING", "ERROR"] });
    await connectVercel(build.deps, owner, { token: TOKEN, teamId: null, limit: 1 });
    expect(await runVercelLaunch(build.deps, input)).toBe("failed");
    expect(build.updates.at(-1)).toMatchObject({ failure: expect.stringMatching(/^Vercel's build stopped: Command "npm run build" exited with 1/) });
  });

  it("asks to connect again when the token can't be opened", async () => {
    const f = fakes({ sealed: "v1.k1.not-a-real-seal-but-long-enough-to-parse-aaaaaaaa" });
    expect(await runVercelLaunch(f.deps, input)).toBe("failed");
    expect(f.updates).toEqual([{ id: "ord_1", status: "failed", failure: expect.stringMatching(/Connect Vercel again/) }]);
  });

  it("picks up a build the background follow lost, when the page looks", async () => {
    const f = fakes({ states: ["READY"], orderStatus: "building" });
    await connectVercel(f.deps, owner, { token: TOKEN, teamId: null, limit: 1 });
    await refreshVercelLaunch(f.deps, "o1", "ord_1");
    expect(f.updates.map((u) => u.status)).toEqual(["ready"]);
  });
});

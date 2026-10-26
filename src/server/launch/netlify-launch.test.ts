import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { NetlifyClient, NetlifyDeploy, NetlifyResult, NetlifySite } from "./netlify-client";
import { authorizeNetlifyLaunch, connectNetlify, refreshNetlifyLaunch, runNetlifyLaunch } from "./netlify-launch";
import { fileSha256, type LaunchDeps, type LaunchPerson } from "./provider-launch";
import type { LaunchOrderView, LaunchStore } from "./provider-store";
import { openToken, sealToken, vaultKey } from "./token-vault";

const KEY = vaultKey({ PROVIDER_TOKEN_KEY: Buffer.alloc(32, 5).toString("base64") })!;
const owner: LaunchPerson = { orgId: "o1", userId: "u-owner", role: "owner", permissions: {} };
const TOKEN = "nfp_netlify_token_abcdefghijklmnop";
const FILES = [
  { path: "index.html", content: "<h1>Hi</h1>" },
  { path: "about/index.html", content: "<h1>Hi</h1>" },
  { path: "styles.css", content: "body{}" },
].map((f) => ({ ...f, sha256: fileSha256(f.content) }));
const sha1 = (s: string) => createHash("sha1").update(Buffer.from(s, "utf8")).digest("hex");
const SITE: NetlifySite = { id: "site_1", name: "storefront", adminUrl: "https://app.netlify.com/sites/storefront", publishedDeployId: "dep_1" };
const AUTH = { projectId: "p1", key: "00000000-0000-4000-8000-000000000001", target: "storefront", confirm: "storefront", overrideReason: null, plan: { kind: "static" as const } };

type Over = { site?: NetlifySite | null; createSiteFails?: boolean; states?: string[]; firstState?: string; required?: string[]; uploadFails?: boolean; published?: string | null; errorMessage?: string; teamMissing?: boolean };

function fakes(over: Over = {}) {
  const calls: string[] = [];
  const updates: Parameters<LaunchStore["update"]>[0][] = [];
  const health: number[] = [];
  const sealed = sealToken(TOKEN, KEY, { orgId: "o1", provider: "netlify" });
  let stored: string | null = null;
  const states = [...(over.states ?? ["processing", "ready"])];
  const deploy = (state: string, extra: Partial<NetlifyDeploy> = {}): NetlifyDeploy => ({ id: "dep_1", siteId: "site_1", state, required: [], errorMessage: null, ...extra });
  const store: LaunchStore = {
    connect: async (i) => ((stored = i.sealed), calls.push(`connect:${i.provider}:${i.accountName}:${i.teamId}`), { ok: true, value: "c1" }),
    disconnect: async () => ({ ok: true, value: null }),
    sealedToken: async (_org, provider) => (calls.push(`token:${provider}`), { sealed: stored ?? sealed, teamId: null }),
    authorize: async (i) => (calls.push(`authorize:${i.provider}:${i.fileCount}`), { ok: true, value: "ord_1" }),
    update: async (i) => (updates.push(i), { ok: true, value: null }),
    recordHealth: async (i) => (health.push(i.status), { ok: true, value: null }),
    order: async () =>
      ({ id: "ord_1", provider: "netlify", status: over.states ? "building" : "authorized", filesDigest: "x", deploymentId: "dep_1", targetName: "storefront", updatedAt: new Date(Date.now() - 60_000).toISOString() }) as LaunchOrderView,
  };
  const netlify = (token: string): NetlifyClient =>
    ({
      whoami: async (): Promise<NetlifyResult<{ id: string; name: string }>> =>
        over.teamMissing ? { ok: false, code: "INVALID", message: "This token can't reach a Netlify team called studio." } : token === TOKEN ? { ok: true, value: { id: "u_1", name: "Suvin W" } } : { ok: false, code: "AUTH", message: "wrong" },
      findSite: async (name: string) => (calls.push(`find:${name}`), { ok: true, value: over.site === undefined ? SITE : over.site }),
      createSite: async (name: string) => (calls.push(`create-site:${name}`), over.createSiteFails ? { ok: false, code: "INVALID", message: "Netlify refused the site name storefront." } : { ok: true, value: { ...SITE, publishedDeployId: null } }),
      createDeploy: async (siteId: string, files: Record<string, string>, opts: { title: string; async: boolean }) => {
        calls.push(`deploy:${siteId}:${Object.keys(files).sort().join(",")}:${opts.async}:${opts.title.startsWith("Farbaek launch ")}`);
        return { ok: true, value: deploy(over.firstState ?? "uploading", { required: over.required ?? [sha1("<h1>Hi</h1>"), sha1("<h1>Hi</h1>"), sha1("body{}")] }) };
      },
      getDeploy: async () => {
        const state = states.shift() ?? "ready";
        calls.push(`state:${state}`);
        return { ok: true, value: deploy(state, { required: over.required ?? [sha1("body{}")], errorMessage: state === "error" ? (over.errorMessage ?? null) : null }) };
      },
      getSite: async () => ({ ok: true, value: { ...SITE, publishedDeployId: over.published === undefined ? "dep_1" : over.published } }),
      uploadFile: async (_d: string, path: string) => (calls.push(`upload:${path}`), over.uploadFails ? { ok: false, code: "INVALID", message: "Netlify refused it." } : { ok: true, value: null }),
    }) as unknown as NetlifyClient;
  const deps: LaunchDeps = {
    store,
    key: KEY,
    vercel: () => {
      throw new Error("Vercel isn't part of these tests.");
    },
    netlify,
    files: async () => FILES,
    probe: async () => 200,
    sleep: async () => undefined,
  };
  return { deps, calls, updates, health, sealed: () => stored };
}

const run = (f: ReturnType<typeof fakes>) => runNetlifyLaunch(f.deps, { orgId: "o1", orderId: "ord_1", target: "storefront", digest: "a".repeat(64), files: FILES });

describe("connecting Netlify", () => {
  it("lets owners and admins connect after Netlify confirms the token, sealed to Netlify", async () => {
    const f = fakes();
    expect(await connectNetlify(f.deps, owner, { token: ` ${TOKEN} `, teamId: "", limit: 2 })).toEqual({ ok: true, value: { accountName: "Suvin W" } });
    expect(f.calls).toContain("connect:netlify:Suvin W:null");
    expect(openToken(f.sealed()!, KEY, { orgId: "o1", provider: "netlify" })).toBe(TOKEN);
    expect(openToken(f.sealed()!, KEY, { orgId: "o1", provider: "vercel" })).toBeNull();
  });

  it("refuses members, a server without a vault, a malformed token or team, and a team the token can't reach", async () => {
    expect(await connectNetlify(fakes().deps, { ...owner, role: "member" }, { token: TOKEN, teamId: null, limit: 1 })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await connectNetlify({ ...fakes().deps, key: null }, owner, { token: TOKEN, teamId: null, limit: 1 })).toMatchObject({ ok: false, message: expect.stringMatching(/isn't set up/) });
    expect(await connectNetlify(fakes().deps, owner, { token: "short", teamId: null, limit: 1 })).toMatchObject({ ok: false, message: expect.stringMatching(/doesn't look like a Netlify token/) });
    expect(await connectNetlify(fakes().deps, owner, { token: TOKEN, teamId: "my team", limit: 1 })).toMatchObject({ ok: false, message: expect.stringMatching(/team slug/) });
    expect(await connectNetlify(fakes({ teamMissing: true }).deps, owner, { token: TOKEN, teamId: "studio", limit: 1 })).toMatchObject({ ok: false, message: expect.stringMatching(/can't reach a Netlify team/) });
  });
});

describe("authorizing a Netlify launch", () => {
  it("serves only static projects, and refuses a path Netlify can't serve, a bad name or a missing confirmation", async () => {
    const f = fakes();
    expect(await authorizeNetlifyLaunch(f.deps, owner, { ...AUTH, plan: { kind: "vite" } })).toMatchObject({ ok: false, message: expect.stringMatching(/needs a build first/) });
    expect(await authorizeNetlifyLaunch(f.deps, owner, { ...AUTH, target: "Store_Front", confirm: "Store_Front" })).toMatchObject({ ok: false, code: "INVALID_NAME" });
    expect(await authorizeNetlifyLaunch(f.deps, owner, { ...AUTH, confirm: "storefron" })).toMatchObject({ ok: false, message: "Type storefront to confirm." });
    expect(await authorizeNetlifyLaunch(f.deps, { ...owner, role: "member", permissions: { publish: false } }, AUTH)).toMatchObject({ ok: false, code: "PERMISSION_WITHHELD" });
    const hashed = fakes();
    hashed.deps.files = async () => [{ path: "notes#1.html", content: "x", sha256: fileSha256("x") }];
    expect(await authorizeNetlifyLaunch(hashed.deps, owner, AUTH)).toMatchObject({ ok: false, message: expect.stringMatching(/notes#1\.html/) });
    expect(f.calls.filter((c) => c.startsWith("authorize"))).toEqual([]);
  });

  it("authorizes exactly these files with Netlify as the provider, and starts the launch", async () => {
    const f = fakes();
    expect(await authorizeNetlifyLaunch(f.deps, owner, AUTH)).toEqual({ ok: true, value: { orderId: "ord_1" } });
    expect(f.calls[0]).toBe("authorize:netlify:3");
  });
});

describe("a Netlify launch", () => {
  it("deploys the digest to the existing site, uploads each needed file once, and checks the live address", async () => {
    const f = fakes();
    expect(await run(f)).toBe("ready");
    expect(f.calls).toContain("find:storefront");
    expect(f.calls).not.toContain("create-site:storefront");
    expect(f.calls).toContain("deploy:site_1:/about/index.html,/index.html,/styles.css:false:true");
    // Two files share the same bytes: Netlify gets them once.
    expect(f.calls.filter((c) => c.startsWith("upload:"))).toEqual(["upload:index.html", "upload:styles.css"]);
    expect(f.updates.map((u) => u.status)).toEqual(["uploading", "uploading", "building", "ready"]);
    expect(f.updates[1]).toMatchObject({ deploymentId: "dep_1", inspectorUrl: "https://app.netlify.com/sites/storefront/deploys/dep_1" });
    expect(f.updates.at(-1)).toMatchObject({ status: "ready", url: "https://storefront.netlify.app" });
    expect(f.health).toEqual([200]);
  });

  it("makes the site when the account has none by that name, and says why when Netlify refuses the name", async () => {
    const made = fakes({ site: null });
    expect(await run(made)).toBe("ready");
    expect(made.calls).toContain("create-site:storefront");
    const refused = fakes({ site: null, createSiteFails: true });
    expect(await run(refused)).toBe("failed");
    expect(refused.updates.at(-1)).toMatchObject({ status: "failed", failure: "Netlify refused the site name storefront." });
  });

  it("waits for Netlify to compare the files before uploading, when it compares in the background", async () => {
    const f = fakes({ firstState: "preparing", states: ["preparing", "prepared", "processing", "ready"] });
    expect(await run(f)).toBe("ready");
    const firstUpload = f.calls.findIndex((c) => c.startsWith("upload:"));
    expect(f.calls.indexOf("state:prepared")).toBeLessThan(firstUpload);
    // After comparing, Netlify needed only the stylesheet.
    expect(f.calls.filter((c) => c.startsWith("upload:"))).toEqual(["upload:styles.css"]);
  });

  it("fails in words when a file doesn't upload, the deploy errors, or publishing is locked", async () => {
    const upload = fakes({ uploadFails: true });
    expect(await run(upload)).toBe("failed");
    expect(upload.updates.at(-1)).toMatchObject({ failure: expect.stringMatching(/didn't upload: Netlify refused it\./) });

    const error = fakes({ states: ["error"], errorMessage: "Failed during stage 'processing site'" });
    expect(await run(error)).toBe("failed");
    expect(error.updates.at(-1)).toMatchObject({ failure: "Netlify stopped the deploy: Failed during stage 'processing site'" });

    const locked = fakes({ published: "dep_0" });
    expect(await run(locked)).toBe("failed");
    expect(locked.updates.at(-1)).toMatchObject({ failure: expect.stringMatching(/publishing is locked for this site/) });
    expect(locked.health).toEqual([]);
  });

  it("refuses a file Netlify asks for that Farbaek didn't send", async () => {
    const f = fakes({ required: ["f".repeat(40)] });
    expect(await run(f)).toBe("failed");
    expect(f.updates.at(-1)).toMatchObject({ failure: "Netlify asked for a file Farbaek didn't send. Launch again." });
  });

  it("picks up a deploy the background follow lost, when the page looks", async () => {
    const f = fakes({ states: ["ready"] });
    await refreshNetlifyLaunch(f.deps, "o1", "ord_1");
    expect(f.calls).toContain("token:netlify");
    expect(f.updates).toEqual([{ id: "ord_1", status: "ready", url: "https://storefront.netlify.app" }]);
  });
});

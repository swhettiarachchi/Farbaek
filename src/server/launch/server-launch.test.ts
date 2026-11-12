import { describe, expect, it } from "vitest";
import type { LaunchGitHub } from "@/server/github/launch-commit";
import type { FlyClient } from "./fly-client";
import { fileSha256, type LaunchPerson } from "./provider-launch";
import type { LaunchOrderView, LaunchStore } from "./provider-store";
import type { RailwayClient } from "./railway-client";
import type { RenderClient } from "./render-client";
import { authorizeServerLaunch, runFlyLaunch, runRailwayLaunch, runRenderLaunch, type ServerLaunchDeps } from "./server-launch";
import { sealToken, vaultKey } from "./token-vault";

const KEY = vaultKey({ PROVIDER_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64") })!;
const owner: LaunchPerson = { orgId: "o1", userId: "u-owner", role: "owner", permissions: {} };
const COMMIT = "c".repeat(40);
const FILES = [
  { path: "package.json", content: '{"scripts":{"start":"node src/server.js"}}' },
  { path: "src/server.js", content: "require('http').createServer((q,s)=>s.end('ok')).listen(process.env.PORT)\n" },
].map((f) => ({ ...f, sha256: fileSha256(f.content) }));
const COMMANDS = { build: null, start: "npm start" };
const RUN = { orgId: "o1", orderId: "ord_1", projectId: "p1", target: "fieldnote", digest: "d".repeat(64), files: FILES, commands: COMMANDS };

/** A git API that answers like GitHub for one push to an empty launch branch. */
function github(log: string[]): LaunchGitHub {
  return {
    call: async (method: string, path: string, body?: { tree?: { path: string; content?: string }[] }) => {
      log.push(`github:${method}:${path.replace(/^\/repos\/ama\/fieldnote/, "")}`);
      if (path.includes("/git/ref/heads/")) return { ok: false, code: "NOT_FOUND" };
      if (path.endsWith("/git/trees")) return { ok: true, status: 201, json: { sha: "7".repeat(40), tree: body?.tree } };
      if (path.includes("/git/trees/")) {
        const { gitBlobId } = await import("@/server/github/launch-commit");
        return { ok: true, status: 200, json: { truncated: false, tree: FILES.map((f) => ({ path: f.path, type: "blob", sha: gitBlobId(Buffer.from(f.content)) })) } };
      }
      if (path.endsWith("/git/commits")) return { ok: true, status: 201, json: { sha: COMMIT } };
      return { ok: true, status: 201, json: {} };
    },
  } as unknown as LaunchGitHub;
}

function fakes(provider: "render" | "railway" | "flyio", over: { teamId?: string | null; noRepo?: boolean; flyOtherOrg?: boolean; renderTaken?: boolean; flyForeignMachine?: boolean; railwayService?: { repo: string | null } } = {}) {
  const log: string[] = [];
  const updates: Parameters<LaunchStore["update"]>[0][] = [];
  const store: LaunchStore = {
    connect: async () => ({ ok: true, value: "c1" }),
    disconnect: async () => ({ ok: true, value: null }),
    sealedToken: async (_org, p) => ({ sealed: sealToken("a-long-provider-token-123456", KEY, { orgId: "o1", provider: p }), teamId: over.teamId === undefined ? (provider === "flyio" ? "personal" : null) : over.teamId }),
    authorize: async (i) => (log.push(`authorize:${i.provider}`), { ok: true, value: "ord_1" }),
    update: async (i) => (updates.push(i), { ok: true, value: null }),
    recordHealth: async (i) => (log.push(`health:${i.status}`), { ok: true, value: null }),
    order: async () => ({ id: "ord_1", provider, status: "authorized", filesDigest: "x" }) as LaunchOrderView,
  };
  const render = {
    owners: async () => ({ ok: true, value: [{ id: "tea-abcdef12", name: "Ama" }] }),
    whoami: async () => ({ ok: true, value: { id: "tea-abcdef12", name: "Ama" } }),
    findService: async () => ({
      ok: true,
      value: over.renderTaken ? { id: "srv-other123", name: "fieldnote", url: "https://fieldnote.onrender.com", dashboardUrl: null, repo: "https://github.com/someone/else", branch: "main" } : null,
    }),
    createService: async (i: object) => (
      log.push(`render:create:${JSON.stringify(i)}`),
      { ok: true, value: { id: "srv-abcdef12", name: "fieldnote", url: "https://fieldnote.onrender.com", dashboardUrl: "https://dashboard.render.com/web/srv-abcdef12", repo: "https://github.com/ama/fieldnote", branch: "farbaek/launch", deployId: "dep-first123" } }
    ),
    updateService: async () => ({ ok: false, message: "unused" }),
    deployCommit: async (s: string, c: string) => (log.push(`render:deploy:${s}:${c}`), { ok: true, value: { id: "dep-abcdef12", status: "created" } }),
    getDeploy: async () => ({ ok: true, value: { id: "dep-abcdef12", status: "live", commitId: COMMIT } }),
  } as unknown as RenderClient;
  const railway = {
    whoami: async () => ({ ok: true, value: { id: "u1", name: "Ama", workspaces: [] } }),
    findProject: async () => ({
      ok: true,
      value: over.railwayService
        ? { id: "11111111-1111-4111-8111-111111111111", name: "fieldnote", environmentId: "22222222-2222-4222-8222-222222222222", services: [{ id: "55555555-5555-4555-8555-555555555555", name: "fieldnote", repo: over.railwayService.repo }] }
        : null,
    }),
    createProject: async (name: string) => (log.push(`railway:project:${name}`), { ok: true, value: { id: "11111111-1111-4111-8111-111111111111", name, environmentId: "22222222-2222-4222-8222-222222222222", services: [] } }),
    createService: async (i: { repo?: string | null }) => (log.push(`railway:service:${i.repo ?? "empty"}`), { ok: true, value: { id: "33333333-3333-4333-8333-333333333333", name: "fieldnote" } }),
    setVariables: async (i: { serviceId: string; variables: Record<string, string> }) => (log.push(`railway:vars:${i.serviceId}:${JSON.stringify(i.variables)}`), { ok: true, value: null }),
    setCommands: async (i: { startCommand: string }) => (log.push(`railway:start:${i.startCommand}`), { ok: true, value: null }),
    connectRepo: async (i: { repo: string; branch: string }) => (log.push(`railway:connect:${i.repo}:${i.branch}`), { ok: true, value: null }),
    disableAutoDeploys: async (i: { serviceId: string }) => (log.push(`railway:manual:${i.serviceId}`), { ok: true, value: null }),
    ensureDomain: async () => ({ ok: true, value: "fieldnote-production.up.railway.app" }),
    deployCommit: async (i: { commitSha: string }) => (log.push(`railway:deploy:${i.commitSha}`), { ok: true, value: { id: "44444444-4444-4444-8444-444444444444" } }),
    getDeployment: async () => ({ ok: true, value: { id: "44444444-4444-4444-8444-444444444444", status: "SUCCESS" } }),
  } as unknown as RailwayClient;
  const fly = {
    whoami: async (slug: string) => ({ ok: true, value: { id: slug, name: slug } }),
    getApp: async () => ({ ok: true, value: over.flyOtherOrg ? { name: "fieldnote", orgSlug: "someone-else" } : null }),
    createApp: async (name: string, org: string) => (log.push(`fly:app:${name}:${org}`), { ok: true, value: { name } }),
    ensurePublicIps: async () => (log.push("fly:ips"), { ok: true, value: null }),
    listMachines: async () => ({ ok: true, value: over.flyForeignMachine ? [{ id: "1234567890abcdef", state: "started", region: null, metadata: {} }] : [] }),
    createMachine: async (_app: string, config: { image: string; init: { cmd: string[] } }) => (log.push(`fly:machine:${config.image}:${config.init.cmd.join(" ")}`), { ok: true, value: { id: "abcdef1234567890", state: "created", region: null } }),
    updateMachine: async () => ({ ok: false, message: "unused" }),
    waitStarted: async () => ({ ok: true, value: true }),
    getMachine: async () => ({ ok: true, value: { id: "abcdef1234567890", state: "started", region: null } }),
  } as unknown as FlyClient;
  const deps: ServerLaunchDeps = {
    store,
    key: KEY,
    vercel: () => {
      throw new Error("not in these tests");
    },
    netlify: () => {
      throw new Error("not in these tests");
    },
    render: () => render,
    railway: () => railway,
    fly: () => fly,
    files: async () => FILES,
    repo: {
      link: async () => (over.noRepo ? { error: "Link this project to a GitHub repository first." } : { owner: "ama", repo: "fieldnote", gh: github(log) }),
      recentCommits: async () => [],
      recordCommit: async (order, commit) => (log.push(`record:${order}:${commit}`), true),
    },
    probe: async () => 200,
    sleep: async () => undefined,
  };
  return { deps, log, updates };
}

describe("launching to hosts that run a server (ADR 0191)", () => {
  it("Render: one commit of exactly the files on the launch branch, a free service with deploys off, that commit deployed", async () => {
    const { deps, log, updates } = fakes("render");
    expect(await runRenderLaunch(deps, RUN)).toBe("ready");
    expect(log).toContain(`record:ord_1:${COMMIT}`);
    const created = JSON.parse(log.find((l) => l.startsWith("render:create:"))!.slice("render:create:".length));
    expect(created).toMatchObject({ ownerId: "tea-abcdef12", name: "fieldnote", repo: "https://github.com/ama/fieldnote", branch: "farbaek/launch", startCommand: "npm start" });
    // A new service's own first deploy is the one followed: no second deploy is started.
    expect(log.some((l) => l.startsWith("render:deploy:"))).toBe(false);
    expect(updates.find((u) => u.status === "building")).toMatchObject({ deploymentId: "srv-abcdef12/dep-first123" });
    expect(updates.at(-1)).toMatchObject({ status: "ready", url: "https://fieldnote.onrender.com" });
    expect(log.some((l) => l.includes("heads/main"))).toBe(false);
  });

  it("Render leaves alone a service by that name that runs another repository", async () => {
    const { deps, log, updates } = fakes("render", { renderTaken: true });
    expect(await runRenderLaunch(deps, RUN)).toBe("failed");
    expect(updates.at(-1)?.failure).toMatch(/already has a service called fieldnote/);
    expect(log.some((l) => l.startsWith("render:create") || l.startsWith("render:deploy"))).toBe(false);
  });

  it("Fly.io leaves alone an app that runs machines Farbaek didn't make", async () => {
    const { deps, log, updates } = fakes("flyio", { flyForeignMachine: true });
    expect(await runFlyLaunch(deps, { ...RUN, entry: "src/server.js" })).toBe("failed");
    expect(updates.at(-1)?.failure).toMatch(/machines Farbaek didn't make/);
    expect(log.some((l) => l.startsWith("fly:machine"))).toBe(false);
  });

  it("Render and Railway stop before anything is made when the project has no linked repository", async () => {
    const { deps, log, updates } = fakes("render", { noRepo: true });
    expect(await runRenderLaunch(deps, RUN)).toBe("failed");
    expect(updates.at(-1)).toMatchObject({ status: "failed" });
    expect(log.some((l) => l.startsWith("render:"))).toBe(false);
  });

  it("Railway: an empty service set up before it's given the launch branch, deploys on push off, the commit deployed", async () => {
    const { deps, log, updates } = fakes("railway");
    expect(await runRailwayLaunch(deps, RUN)).toBe("ready");
    const at = (prefix: string) => log.findIndex((l) => l.startsWith(prefix));
    expect(log).toContain("railway:service:empty");
    expect(log).toContain(`railway:vars:33333333-3333-4333-8333-333333333333:${JSON.stringify({ PORT: "8080", NPM_CONFIG_IGNORE_SCRIPTS: "true" })}`);
    expect(log).toContain("railway:start:npm start");
    expect(log).toContain("railway:connect:ama/fieldnote:farbaek/launch");
    // Variables and commands are in place before the repository can start a build.
    expect(at("railway:vars")).toBeLessThan(at("railway:connect"));
    expect(at("railway:start")).toBeLessThan(at("railway:connect"));
    expect(at("railway:manual")).toBeLessThan(at("railway:deploy"));
    expect(log).toContain(`railway:deploy:${COMMIT}`);
    expect(updates.at(-1)).toMatchObject({ status: "ready", url: "https://fieldnote-production.up.railway.app" });
  });

  it("Railway reuses its own service for the linked repository without connecting it again", async () => {
    const { deps, log } = fakes("railway", { railwayService: { repo: "Ama/Fieldnote" } });
    expect(await runRailwayLaunch(deps, RUN)).toBe("ready");
    expect(log.some((l) => l.startsWith("railway:service:") || l.startsWith("railway:connect:"))).toBe(false);
    expect(log).toContain("railway:manual:55555555-5555-4555-8555-555555555555");
    expect(log).toContain(`railway:deploy:${COMMIT}`);
  });

  it("Railway leaves alone a service by that name that builds another repository, or none", async () => {
    for (const repo of ["someone/else", null]) {
      const { deps, log, updates } = fakes("railway", { railwayService: { repo } });
      expect(await runRailwayLaunch(deps, RUN)).toBe("failed");
      expect(updates.at(-1)?.failure).toMatch(repo ? /builds another repository/ : /with no repository/);
      expect(log.some((l) => /^railway:(vars|start|connect|manual|deploy)/.test(l))).toBe(false);
    }
  });

  it("Fly.io: an app in the connected organization, public addresses, Node's own image running the project's entry", async () => {
    const { deps, log, updates } = fakes("flyio");
    expect(await runFlyLaunch(deps, { ...RUN, entry: "src/server.js" })).toBe("ready");
    expect(log).toContain("fly:app:fieldnote:personal");
    expect(log).toContain("fly:ips");
    expect(log.find((l) => l.startsWith("fly:machine:"))).toMatch(/node:22-slim:node \/app\/src\/server\.js$/);
    expect(updates.at(-1)).toMatchObject({ status: "ready", url: "https://fieldnote.fly.dev" });
  });

  it("Fly.io refuses an app name another organization owns", async () => {
    const { deps, log } = fakes("flyio", { flyOtherOrg: true });
    expect(await runFlyLaunch(deps, { ...RUN, entry: "src/server.js" })).toBe("failed");
    expect(log.some((l) => l.startsWith("fly:machine"))).toBe(false);
  });

  it("refuses a static site, a bad name and a missing repository before authorizing", async () => {
    const { deps, log } = fakes("render");
    const base = {
      projectId: "p1",
      key: "00000000-0000-4000-8000-000000000001",
      target: "fieldnote",
      confirm: "fieldnote",
      overrideReason: null,
      plan: { kind: "node_server" as const, hosting: "server" as const, start: { command: "npm run start", source: "found" as const }, build: null },
      commands: COMMANDS,
      project: { pkgText: FILES[0]!.content, paths: FILES.map((f) => f.path), totalBytes: 200, linkedRepo: true },
    };
    expect((await authorizeServerLaunch(deps, owner, "render", { ...base, plan: { ...base.plan, hosting: "static" } })).ok).toBe(false);
    expect((await authorizeServerLaunch(deps, owner, "render", { ...base, target: "Not A Name", confirm: "Not A Name" })).ok).toBe(false);
    expect((await authorizeServerLaunch(deps, owner, "railway", { ...base, project: { ...base.project, linkedRepo: false } })).ok).toBe(false);
    expect(log.filter((l) => l.startsWith("authorize:"))).toEqual([]);
    expect((await authorizeServerLaunch(deps, owner, "render", base)).ok).toBe(true);
    expect(log).toContain("authorize:render");
  });
});

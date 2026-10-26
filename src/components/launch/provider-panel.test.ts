import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LaunchOrderView } from "@/server/launch/provider-store";

vi.mock("@/app/app/projects/[projectId]/launch/launch-actions", () => ({
  connectProviderAction: async () => ({ status: "idle" }),
  launchProviderAction: async () => ({ status: "idle" }),
  disconnectProviderAction: async () => undefined,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
const { ProviderPanel } = await import("./provider-panel");

const base = {
  provider: "vercel" as const,
  projectId: "p1",
  launchKey: "00000000-0000-4000-8000-000000000001",
  target: "storefront",
  connection: null,
  orders: [],
  busy: false,
  files: { count: 12, bytes: 40_960, digest: "d".repeat(64) },
  evidence: "verified" as const,
  builds: "nextjs, next build",
  unfit: null,
  connectReason: null,
  launchReason: null,
  canOverride: true,
  canDisconnect: true,
};
const render = (over: Partial<Parameters<typeof ProviderPanel>[0]> = {}) => renderToStaticMarkup(createElement(ProviderPanel, { ...base, ...over }));
const CONNECTED = { provider: "vercel" as const, accountName: "suvin", teamId: null, createdAt: "2026-10-25T10:00:00.000Z", lastUsedAt: null };
const order = (o: Partial<LaunchOrderView>): LaunchOrderView =>
  ({
    id: "o1",
    provider: "vercel",
    status: "ready",
    targetName: "storefront",
    accountName: "suvin",
    filesDigest: "d".repeat(64),
    fileCount: 12,
    totalBytes: 40_960,
    evidence: "verified",
    evidenceProofPack: "e".repeat(64),
    overrideReason: null,
    authorizedBy: "u1",
    authorizedAt: "2026-10-25T10:00:00.000Z",
    deploymentId: "dpl_1",
    url: "https://storefront.vercel.app",
    inspectorUrl: "https://vercel.com/suvin/storefront/dpl_1",
    failure: null,
    healthStatus: 200,
    healthCheckedAt: "2026-10-25T10:03:00.000Z",
    updatedAt: "2026-10-25T10:03:00.000Z",
    finishedAt: "2026-10-25T10:03:00.000Z",
    ...o,
  }) as LaunchOrderView;

describe("ProviderPanel with Vercel", () => {
  it("says who pays and that nothing is bought, and asks to connect first", () => {
    const html = render();
    expect(html).toContain("bills that account under your plan there");
    expect(html).toContain("buys nothing for you");
    expect(html).toContain("Not connected");
    expect(html).toContain("Connect Vercel");
    expect(html).toContain('type="password"');
  });

  it("explains when Vercel doesn't suit the project, instead of offering it", () => {
    const html = render({ unfit: "Vercel runs functions, not a long-running Node.js server." });
    expect(html).toContain("long-running Node.js server");
    expect(html).not.toContain("Connect Vercel");
  });

  it("shows exactly what goes, and asks for the name to confirm", () => {
    const html = render({ connection: CONNECTED });
    expect(html).toContain("Connected as suvin");
    expect(html).toContain("12 files, 40 KB");
    expect(html).toContain("Production");
    expect(html).toContain("nextjs, next build");
    expect(html).toContain("to confirm");
    expect(html).not.toContain("Why launch without verified evidence");
  });

  it("asks an owner for a reason without verified evidence, and tells a member why they can't", () => {
    expect(render({ connection: CONNECTED, evidence: "none" })).toContain("Why launch without verified evidence");
    expect(render({ connection: CONNECTED, evidence: "none", canOverride: false })).toContain("an owner or admin has to launch it with a reason");
  });

  it("follows each launch in words, with its live check and links", () => {
    const html = render({ connection: CONNECTED, orders: [order({}), order({ id: "o2", status: "failed", url: null, failure: "Vercel's build stopped: exit 1", healthStatus: null }), order({ id: "o3", status: "building", url: null, healthStatus: null })], busy: true });
    expect(html).toContain("Live");
    expect(html).toContain("Answering (200).");
    expect(html).toContain("storefront.vercel.app");
    expect(html).toContain("Build log on Vercel");
    expect(html).toContain("Vercel&#x27;s build stopped: exit 1");
    expect(html).toContain("Building on Vercel");
    expect(html).toContain("A launch is under way");
  });

  it("explains a protected address instead of calling it broken", () => {
    expect(render({ connection: CONNECTED, orders: [order({ healthStatus: 401 })] })).toContain("Deployment Protection is on");
  });
});

describe("ProviderPanel with Netlify", () => {
  const netlify = (over: Partial<Parameters<typeof ProviderPanel>[0]> = {}) => render({ provider: "netlify", builds: "Files as they are, no build", ...over });

  it("asks for a Netlify personal access token, and says Netlify serves the files as they are", () => {
    const html = netlify();
    expect(html).toContain("Launch to Netlify");
    expect(html).toContain("Netlify personal access token");
    expect(html).toContain("Connect Netlify");
    expect(html).toContain("serves the files exactly as they are");
    expect(html).toContain('id="launch-netlify"');
  });

  it("explains a project that needs a build, instead of offering it", () => {
    const html = netlify({ unfit: "Netlify's direct upload serves files as they are, and this project needs a build first. Vercel builds it for you." });
    expect(html).toContain("needs a build first");
    expect(html).not.toContain("Connect Netlify");
  });

  it("shows what goes, with the site name rule, and follows a launch in its own words", () => {
    const connected = { ...CONNECTED, provider: "netlify" as const, accountName: "Suvin W" };
    const html = netlify({
      connection: connected,
      orders: [
        order({ provider: "netlify", url: "https://storefront.netlify.app", inspectorUrl: "https://app.netlify.com/sites/storefront/deploys/dep_1" }),
        order({ id: "o2", provider: "netlify", status: "building", url: null, healthStatus: null }),
      ],
      busy: true,
    });
    expect(html).toContain("Files as they are, no build");
    expect(html).toContain("Netlify site name");
    expect(html).toContain("name.netlify.app");
    expect(html).toContain("storefront.netlify.app");
    expect(html).toContain("Deploy on Netlify");
    expect(html).toContain("Publishing on Netlify");
    expect(html).toContain("Disconnect Netlify");
    expect(netlify({ connection: connected, orders: [order({ provider: "netlify", healthStatus: 401 })] })).toContain("password protection is on");
  });

  it("waits while a launch to the other provider is under way", () => {
    expect(netlify({ connection: { ...CONNECTED, provider: "netlify" }, busy: true })).toContain("A launch is under way");
  });
});

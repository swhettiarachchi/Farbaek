import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LaunchOrderView } from "@/server/launch/provider-store";

vi.mock("@/app/app/projects/[projectId]/launch/vercel-actions", () => ({
  connectVercelAction: async () => ({ status: "idle" }),
  launchVercelAction: async () => ({ status: "idle" }),
  disconnectVercelAction: async () => undefined,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
const { VercelPanel } = await import("./vercel-panel");

const base = {
  projectId: "p1",
  launchKey: "00000000-0000-4000-8000-000000000001",
  target: "storefront",
  connection: null,
  orders: [],
  files: { count: 12, bytes: 40_960, digest: "d".repeat(64) },
  evidence: "verified" as const,
  settings: { framework: "nextjs" as const, buildCommand: "next build", outputDirectory: null },
  unfit: null,
  connectReason: null,
  launchReason: null,
  canOverride: true,
  canDisconnect: true,
};
const render = (over: Partial<Parameters<typeof VercelPanel>[0]> = {}) => renderToStaticMarkup(createElement(VercelPanel, { ...base, ...over }));
const CONNECTED = { provider: "vercel" as const, accountName: "suvin", teamId: null, createdAt: "2026-10-25T10:00:00.000Z", lastUsedAt: null };
const order = (o: Partial<LaunchOrderView>): LaunchOrderView =>
  ({
    id: "o1",
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

describe("VercelPanel", () => {
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
    const html = render({ connection: CONNECTED, orders: [order({}), order({ id: "o2", status: "failed", url: null, failure: "Vercel's build stopped: exit 1", healthStatus: null }), order({ id: "o3", status: "building", url: null, healthStatus: null })] });
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

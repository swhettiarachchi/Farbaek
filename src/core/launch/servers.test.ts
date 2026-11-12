import { describe, expect, it } from "vitest";
import { flyAppUrl, inspectorAddress, launchAddress, railwayAppUrl, renderAppUrl } from "./providers";
import { nodeEntry, serverCommands, serverFit, serverName } from "./servers";

const plain = JSON.stringify({ scripts: { start: "node src/server.js", test: "node --test" } });
const next = JSON.stringify({ dependencies: { next: "16.4.0" }, scripts: { build: "next build", start: "next start" } });
const nodePlan = { kind: "node_server" as const, hosting: "server" as const, start: { command: "npm run start", source: "found" as const }, build: null };
const nextPlan = { kind: "nextjs" as const, hosting: "server" as const, start: { command: "npm run start", source: "found" as const }, build: { command: "npm run build", source: "found" as const } };

describe("server hosts (ADR 0191)", () => {
  it("keep every address on its own provider's domain", () => {
    expect(renderAppUrl("https://fieldnote.onrender.com/x")).toBe("https://fieldnote.onrender.com");
    expect(renderAppUrl("https://fieldnote.onrender.com.evil.example")).toBeNull();
    expect(railwayAppUrl("fieldnote-production.up.railway.app")).toBe("https://fieldnote-production.up.railway.app");
    expect(railwayAppUrl("https://fieldnote.railway.app")).toBeNull();
    expect(flyAppUrl("https://fieldnote.fly.dev")).toBe("https://fieldnote.fly.dev");
    expect(flyAppUrl("http://fieldnote.fly.dev")).toBeNull();
    expect(launchAddress("flyio", "https://fieldnote.onrender.com")).toBeNull();
    expect(inspectorAddress("render", "https://dashboard.render.com/web/srv-abc")).toBe("https://dashboard.render.com/web/srv-abc");
    expect(inspectorAddress("railway", "https://railway.com.evil.example/project")).toBeNull();
  });

  it("name services the way all three accept", () => {
    expect(serverName("Café Members!")).toBe("cafe-members");
    expect(serverName("---")).toBe("farbaek-app");
  });

  it("find the file Node runs, only inside the project", () => {
    expect(nodeEntry(plain, ["package.json", "src/server.js"])).toBe("src/server.js");
    expect(nodeEntry(JSON.stringify({ scripts: { start: "node ../evil.js" } }), ["package.json"])).toBeNull();
    expect(nodeEntry(JSON.stringify({ main: "index.js" }), ["index.js"])).toBe("index.js");
    // A start script that does more than run one file isn't swapped for main, which may be another program.
    expect(nodeEntry(JSON.stringify({ main: "index.js", scripts: { start: "node --env-file=.env server.js" } }), ["index.js", "server.js"])).toBeNull();
  });

  it("installs the dev tools a build needs", () => {
    const tsOnly = JSON.stringify({ devDependencies: { typescript: "5.9.3" }, scripts: { build: "tsc", start: "node dist/server.js" } });
    expect(serverCommands(nodePlan, tsOnly)).toEqual({ build: "npm install --ignore-scripts --no-audit --no-fund && npm run build", start: "npm start" });
  });

  it("install without scripts, build when there's a build, and start with npm start", () => {
    expect(serverCommands(nodePlan, plain)).toEqual({ build: null, start: "npm start" });
    expect(serverCommands(nextPlan, next)).toEqual({ build: "npm install --ignore-scripts --no-audit --no-fund && npm run build", start: "npm start" });
  });

  it("send each project only where it can run, and say why not", () => {
    const small = { pkgText: plain, paths: ["package.json", "src/server.js"], totalBytes: 9_000, linkedRepo: false };
    expect(serverFit("flyio", nodePlan, small)).toBeNull();
    expect(serverFit("render", nodePlan, small)).toMatch(/Link this project to a GitHub repository/);
    expect(serverFit("render", nodePlan, { ...small, linkedRepo: true })).toBeNull();
    expect(serverFit("flyio", nextPlan, { ...small, pkgText: next })).toMatch(/no dependencies/);
    expect(serverFit("railway", { ...nodePlan, hosting: "static" }, small)).toMatch(/static site/);
    expect(serverFit("flyio", nodePlan, { ...small, totalBytes: 600 * 1024 })).toMatch(/larger than a Fly\.io launch/);
  });
});

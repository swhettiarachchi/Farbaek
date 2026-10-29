import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_DOWNLOAD, AGENT_LINUX, AGENT_MAC, AGENT_STORE_URL, agentDownloadUrl } from "./agent-download";

describe("the desktop agent download", () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("names the installer of the app's own version", () => {
    const app = JSON.parse(read("desktop/app/package.json")) as { version: string };
    expect(AGENT_DOWNLOAD.version).toBe(app.version);
    expect(AGENT_DOWNLOAD.file).toBe(`Farbaek-Agent-Setup-${app.version}.exe`);
  });

  it("gives a fingerprint and size people can check", () => {
    expect(AGENT_DOWNLOAD.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(AGENT_DOWNLOAD.bytes).toBeGreaterThan(10 * 1024 * 1024);
    expect(agentDownloadUrl).toBe(`/downloads/${AGENT_DOWNLOAD.file}`);
  });

  it("offers the Store, Mac and Linux builds only once they're published, and then exactly", () => {
    const app = JSON.parse(read("desktop/app/package.json")) as { version: string };
    if (AGENT_STORE_URL !== null) expect(AGENT_STORE_URL).toMatch(/^https:\/\/apps\.microsoft\.com\/detail\/[0-9A-Za-z]{12}(\?.*)?$/);
    if (AGENT_MAC !== null) {
      expect(AGENT_MAC.version).toBe(app.version);
      expect(AGENT_MAC.file).toBe(`Farbaek-Agent-${app.version}-mac.dmg`);
      expect(AGENT_MAC.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(AGENT_MAC.bytes).toBeGreaterThan(10 * 1024 * 1024);
    }
    if (AGENT_LINUX !== null) {
      expect(AGENT_LINUX.version).toBe(app.version);
      expect(AGENT_LINUX.file).toBe(`Farbaek-Agent-${app.version}-linux-x86_64.AppImage`);
      expect(AGENT_LINUX.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(AGENT_LINUX.bytes).toBeGreaterThan(10 * 1024 * 1024);
    }
  });

  it("builds the Linux AppImage under the name the page offers (ADR 0111)", () => {
    const builder = read("desktop/electron-builder.yml");
    expect(builder).toContain("artifactName: Farbaek-Agent-${version}-linux-x86_64.${ext}");
    expect(read(".github/workflows/agent-linux.yml")).toContain("Farbaek-Agent-*-linux-x86_64.AppImage");
  });

  it("is served by Caddy from the downloads folder, on www only", () => {
    const caddy = read("deploy/vps/caddy/Caddyfile");
    expect(caddy).toMatch(/@downloads \{\s*host www\.farbaek\.com\s*path \/downloads\/\*\s*\}/);
    expect(caddy).toContain("root * /srv/downloads");
    expect(read("deploy/vps/compose.yaml")).toContain("/opt/farbaek/downloads:/srv/downloads:ro");
  });
});

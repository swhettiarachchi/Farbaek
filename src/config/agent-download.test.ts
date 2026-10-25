import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_DOWNLOAD, agentDownloadUrl } from "./agent-download";

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

  it("is served by Caddy from the downloads folder, on www only", () => {
    const caddy = read("deploy/vps/caddy/Caddyfile");
    expect(caddy).toMatch(/@downloads \{\s*host www\.farbaek\.com\s*path \/downloads\/\*\s*\}/);
    expect(caddy).toContain("root * /srv/downloads");
    expect(read("deploy/vps/compose.yaml")).toContain("/opt/farbaek/downloads:/srv/downloads:ro");
  });
});

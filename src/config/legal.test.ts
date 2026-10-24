import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGAL } from "./legal";

/** The policies state these facts; each must match the script that makes it true (ADR 0066). */
describe("legal facts", () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("keeps as many nightly backups as the Privacy Policy says", () => {
    const keep = read("scripts/vps/db-backup.sh").match(/^KEEP=(\d+)$/m)?.[1];
    expect(Number(keep)).toBe(LEGAL.backupDays);
  });

  it("caps each service's logs at the size the Privacy Policy says", () => {
    const opts = read("scripts/vps/bootstrap.sh").match(/"max-size":"(\d+)m","max-file":"(\d+)"/);
    expect(opts).not.toBeNull();
    expect(`${Number(opts![1]) * Number(opts![2])} MB`).toBe(LEGAL.logLimit);
  });

  it("has Caddy keep no access log", () => {
    expect(read("deploy/vps/caddy/Caddyfile")).not.toMatch(/^\s*log\b/m);
  });
});

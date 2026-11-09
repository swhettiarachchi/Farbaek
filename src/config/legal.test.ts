import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGAL, SUBPROCESSORS } from "./legal";

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

  it("deletes sign-in request counts as soon as the Privacy Policy says", () => {
    // The newest migration that defines app_rate_limit is the one in force.
    const dir = new URL("../../supabase/migrations/", import.meta.url);
    const latest = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(new URL(f, dir), "utf8"))
      .filter((sql) => /create (or replace )?function public\.app_rate_limit\(/.test(sql))
      .at(-1);
    expect(latest).toContain(`window_start < now() - interval '${LEGAL.rateLimitHours / 24} day'`);
  });

  it("has Caddy keep no access log", () => {
    expect(read("deploy/vps/caddy/Caddyfile")).not.toMatch(/^\s*log\b/m);
  });

  it("lists the services that run Farbaek by what they do, not by company (stage 171)", () => {
    const text = JSON.stringify(SUBPROCESSORS) + LEGAL.hosting;
    for (const company of ["Hostinger", "Cloudflare", "Turnstile", "R2", "Spaceship", "Spacemail", "Vercel", "E2B", "Supabase", "Boston", "confirming"]) {
      expect(text, company).not.toContain(company);
    }
    // People still learn where their work and their visits go.
    for (const named of ["Anthropic", "Google", "OpenAI", "Google Analytics"]) expect(SUBPROCESSORS.some((p) => p.name === named), named).toBe(true);
  });
});

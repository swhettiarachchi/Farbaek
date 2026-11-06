/**
 * The API host's front door (ADR 0176). Nothing here can test Caddy itself, so this keeps the rules from quietly going away:
 * a wrong sign-in code guessed from outside was never limited before them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const caddy = readFileSync("deploy/vps/caddy/Caddyfile", "utf8").replace(/\r\n/g, "\n");
const compose = readFileSync("deploy/vps/supabase/compose.farbaek.yaml", "utf8");
const site = caddy.slice(caddy.indexOf("api.farbaek.com {"), caddy.indexOf("# *.farbaek.si"));

describe("api.farbaek.com", () => {
  it("lets outsiders reach only what signing in with Google or Apple needs, and an email's link", () => {
    expect(site).toMatch(/@signIn \{[^}]*not remote_ip private_ranges[^}]*path \/auth\/v1\/authorize \/auth\/v1\/callback\n/);
    expect(site).toMatch(/@emailLink \{[^}]*not remote_ip private_ranges[^}]*method GET[^}]*path \/auth\/v1\/verify\n/);
    expect(site).toMatch(/handle @outside \{\s*respond "Not found" 404/);
  });

  it("checks outsiders before the rule that forwards the APIs, since the first match wins", () => {
    expect(site.indexOf("handle @signIn")).toBeLessThan(site.indexOf("handle @outside"));
    expect(site.indexOf("handle @emailLink")).toBeLessThan(site.indexOf("handle @outside"));
    expect(site.indexOf("handle @outside")).toBeLessThan(site.indexOf("handle @api"));
  });

  it("treats this server as inside, or the app couldn't reach its own database", () => {
    expect(site.match(/not remote_ip private_ranges 2\.25\.88\.188/g)).toHaveLength(3);
  });

  it("sets the address itself, and removes any someone else sent", () => {
    expect(site.match(/header_up X-Farbaek-Client-Ip \{remote_host\}/g)).toHaveLength(2);
    expect(site).toContain("header_up -X-Farbaek-Client-Ip");
  });
});

describe("Auth's limits", () => {
  it("limits by the address Caddy names, and allows more than the default 30 sign-in emails an hour", () => {
    expect(compose).toContain("GOTRUE_RATE_LIMIT_HEADER: X-Farbaek-Client-Ip");
    expect(compose).toMatch(/GOTRUE_RATE_LIMIT_EMAIL_SENT: "\d{3,}"/);
  });
});

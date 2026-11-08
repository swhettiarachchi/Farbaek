import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What the public front door gives away (stage 171): server-only routes are
 * not found from outside, and no response names the server, the proxy or a
 * route the app rewrote to. Caddy's own CI job checks the file loads.
 */
const caddy = readFileSync("deploy/vps/caddy/Caddyfile", "utf8").replace(/\r\n/g, "\n");

/** The body of the site block that starts with `head {`. */
function block(head: string): string {
  const start = caddy.indexOf(`\n${head} {\n`);
  expect(start, `${head} block`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = caddy.indexOf("{", start); i < caddy.length; i++) {
    if (caddy[i] === "{") depth++;
    if (caddy[i] === "}" && --depth === 0) return caddy.slice(start, i + 1);
  }
  throw new Error(`${head} never closes`);
}

describe("the public front door", () => {
  it("strips every header that names how Farbaek is built, on every site", () => {
    const quiet = block("(quiet)");
    for (const h of ["Server", "Via", "X-Powered-By", "X-Middleware-Rewrite", "X-Nextjs-Cache", "X-Nextjs-Prerender", "X-Nextjs-Stale-Time", "X-Envoy-Upstream-Service-Time"]) {
      expect(quiet).toContain(`-${h}\n`);
    }
    expect(quiet).toContain("defer");
    for (const site of ["www.farbaek.com, officespace.farbaek.com", "farbaek.com", "api.farbaek.com", "https://"]) {
      expect(block(site), site).toMatch(/^\s*import quiet$/m);
    }
  });

  it("answers not found from outside for the email templates and the internal routes", () => {
    const www = block("www.farbaek.com, officespace.farbaek.com");
    const matcher = www.slice(www.indexOf("@serverOnly {"), www.indexOf("}", www.indexOf("@serverOnly {")));
    for (const path of ["/auth-email/*", "/api/internal/*", "/api/sites/tls-allowed"]) expect(matcher).toContain(path);
    expect(matcher).toContain("not remote_ip private_ranges 2.25.88.188");
    expect(www).toMatch(/handle @serverOnly \{\n\s*respond "Not found" 404\n\s*\}/);
    // Checked before anything is proxied to the app.
    expect(www.indexOf("handle @serverOnly")).toBeLessThan(www.indexOf("reverse_proxy app:3000"));
  });

  it("is reached by the server's own timers directly, never through the public name", () => {
    for (const script of ["scripts/vps/jobs.sh", "scripts/vps/sweep.sh", "scripts/vps/apple-web-secret.sh"]) {
      expect(readFileSync(script, "utf8"), script).toContain("http://127.0.0.1:3000/api/internal/");
    }
    expect(caddy).toContain("ask http://app:3000/api/sites/tls-allowed");
  });
});

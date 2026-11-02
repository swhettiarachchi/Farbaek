# Stage 131: App previews in production

- **Branch:** `feat/preview-wildcard`.
- **Migration:** none.
- **ADR:** 0152.

## 2026-11-02

### Why

The review account's real project showed the gap. The project page's Preview button said "Previews need SANDBOX_PREVIEW_DOMAIN, a separate host for running apps, which isn't set on this server." The state doc's highest-value next slice names an app preview in a sandbox, from a signed-in workspace on www.farbaek.com.

### Done

- **Caddy with Cloudflare's DNS module:**
  - `deploy/vps/caddy-image/Dockerfile` builds Caddy 2.10.2 with `caddy-dns/cloudflare` v0.2.4, both pinned;
  - `compose.yaml` builds it on the server as `farbaek-caddy:2.10.2-cloudflare-0.2.4`;
  - `deploy.sh` builds it as its own step, and a failed build keeps today's Caddy and app (after `install.sh` is run again).
- **The wildcard site, written on the server only:**
  - the Caddyfile imports `extra/*.caddy`, and nothing is there until the owner's script writes it;
  - `previews.caddy.template` holds one `*.farbaek.si` site, with the DNS challenge checked on public resolvers;
  - `extra/` is in `.gitignore` and `.dockerignore`, because the app image copies the checkout.
- **`scripts/vps/set-preview-domain.ps1`** checks, from the server:
  - the token, the zone and its active state;
  - DNS editing, with one test TXT record, added and removed;
  - Caddy's module.

  Then it writes the site, validates and reloads Caddy, and waits up to 3 minutes for a trusted certificate. If none comes, it puts Caddy back. Last, it sets `SANDBOX_PREVIEW_DOMAIN=farbaek.si` and restarts the app. `-Off` reverses it.
- **The `Caddy` workflow** builds the image and checks the module is in it. It validates the Caddyfile without the wildcard site, then with it, using a stand-in token.
- **Docs:** `docs/deploy/vps.md`, "Previews", has the owner's Cloudflare and Hostinger steps. farbaek.si's records today: A `@`, `*` and `sites` to the server, and CNAME `www` to `farbaek.si`; no mail or other records (read from public DNS on 2026-11-02).

### Verified

- **The script's server part** ran on this PC against stand-ins for Cloudflare's API, Docker, Caddy and `farbaek-set-env`, in six cases:
  - success, through to SANDBOX_PREVIEW_DOMAIN saved;
  - an inactive token;
  - a zone still pending;
  - no DNS edit permission;
  - no Caddy module;
  - a certificate that never comes. Caddy is put back, and the settings file removed.

  Every request carried the token in a header file, never on a command line.
- **The PowerShell side:** it parses, the token check refuses short tokens, quotes, slashes and spaces, and results are reported as written.
- `bash -n` on `deploy.sh`.
- **The `Caddy` workflow, run #1, passed in 2m 26s:**
  - the compose tag matches the Dockerfile;
  - the image built, with `dns.providers.cloudflare` in `caddy list-modules`;
  - the Caddyfile validates without the wildcard site (and has none), then with it.

### Production setup, 2026-11-02

Done in the owner's Chrome at their request, after they signed in to Cloudflare:
- **Cloudflare:** added `farbaek.si` to account d45ca46b…7a0aa9, on the Free plan.
  - The scan found `*`, `@` and `www`, all set to Proxied. Each was set to DNS only, and `sites` was added.
  - The zone now holds exactly A `*`, `@` and `sites` → 2.25.88.188, and CNAME `www` → `farbaek.si`, all DNS only, TTL Auto.
- **Before the switch:**
  - farbaek.si has no DS or DNSKEY records (DNSSEC off), so moving the nameservers can't break resolution;
  - both Cloudflare nameservers, queried directly, answered 2.25.88.188 for the apex, `sites`, any name and `www`.
- **Hostinger:** farbaek.si's nameservers changed from `apollo` and `athena.dns-parking.com` to `benedict.ns.cloudflare.com` and `lily.ns.cloudflare.com`. Cloudflare was told, and is waiting for the registry, which takes up to a few hours.
- **The token form:** filled in up to its summary:
  - `farbaek-caddy-dns`, with Zone: Read and DNS: Edit on farbaek.si only;
  - no expiry, so certificate renewal can't silently stop;
  - no IP filter, since the server may reach Cloudflare over IPv6.

  The owner presses Create Token, because the token is a secret Claude doesn't see.

### Live in production, 2026-11-02

- **Cloudflare marked farbaek.si active** within the hour. Public DNS showed `benedict` and `lily.ns.cloudflare.com`, and farbaek.si and www.farbaek.si still redirected to www.farbaek.com from 2.25.88.188.
- **PR #164 was merged and deployed** (`7b81d34`): compose built the new Caddy image, and the app stayed healthy.
- **The owner created the token and ran `set-preview-domain.ps1`.** Every check passed: token and zone, DNS edit, Caddy module, Caddy reloaded, certificate. The app restarted live on `7b81d34`.
- **The certificate:** `CN=*.farbaek.si`, issued by Let's Encrypt (YE1), valid 2026-11-02 to 2027-01-31. Caddy renews it.
  - A preview name that isn't a session answers 401 over trusted HTTPS.
  - farbaek.si and www.farbaek.si still answer 308.
- **A real preview from the review account:** the project page's Preview button is enabled, where it used to show the SANDBOX_PREVIEW_DOMAIN message. Pressing it started a sandbox and opened `https://p-lvac72rmpvmdrzm6guyuqcsarf.farbaek.si/` in a new tab, serving the applied Ember & Rye site, including the public-holiday line and the map.

### Next

- **The owner:** the four steps in `docs/deploy/vps.md`, "Previews". Then Claude opens a preview of a running app from the review account to check it end to end.
- **Adding farbaek.si to the Public Suffix List**, so previews and sites can't set cookies for each other.

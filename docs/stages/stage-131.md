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

### Not verified yet

- **The Caddy workflow's first run** (the image build and both validations) follows the push.
- **Production:** it needs the owner's Cloudflare zone, the nameserver change at Hostinger, and the token.

### Next

- **The owner:** the four steps in `docs/deploy/vps.md`, "Previews". Then Claude opens a preview of a running app from the review account to check it end to end.
- **Adding farbaek.si to the Public Suffix List**, so previews and sites can't set cookies for each other.

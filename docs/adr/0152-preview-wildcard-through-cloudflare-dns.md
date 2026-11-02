# ADR 0152: App previews on farbaek.si, with one wildcard certificate through Cloudflare DNS

- Status: accepted (2026-11-02).
- Follows ADR 0029 (publishing), ADR 0035 (the VPS), ADR 0045 (site certificates and custom domains).

## Context

**A running app's preview** opens at its own host, `p-<id>.farbaek.si`. Each preview gets its own origin, so one person's app can't read another's storage. In production the Preview button said "Previews need SANDBOX_PREVIEW_DOMAIN, a separate host for running apps, which isn't set on this server."

**Every preview is a new name.** Caddy makes published sites' certificates on their first visit (on-demand TLS). Doing the same for previews would mean one new certificate per preview, and Let's Encrypt allows 50 a week per domain. So previews need one wildcard certificate, `*.farbaek.si`.

**A wildcard needs a DNS-01 challenge:** Caddy writes a TXT record in the domain's DNS.
- farbaek.si's DNS is at Hostinger, and Caddy has no Hostinger module.
- Cloudflare's free plan hosts DNS with a scoped API token, and Caddy has a maintained module for it, `caddy-dns/cloudflare`.
- The owner already has a Cloudflare account (R2 backups).

## Decision

**farbaek.si's DNS moves to Cloudflare, records unchanged:**
- `@`, `*` and `sites` are A records to the server;
- `www` is a CNAME to `farbaek.si`;
- all "DNS only", not proxied, so Caddy keeps answering every name, and people's own domains can still point at `sites.farbaek.si`.

The registrar stays Hostinger; only the nameservers change. farbaek.com stays at Spaceship.

**Caddy is built with the module.**
- `deploy/vps/caddy-image/Dockerfile` builds Caddy 2.10.2 with `caddy-dns/cloudflare` v0.2.4 (March 2026; needs Caddy 2.7.5 or later).
- `compose.yaml` names the image `farbaek-caddy:2.10.2-cloudflare-0.2.4` and builds it on the server when that tag is missing.
- `deploy.sh` builds it before swapping containers, and a failed build keeps today's Caddy and app. That takes effect once `install.sh` is run again; until then compose builds it within `up -d`.
- The `Caddy` workflow builds the image on GitHub, checks the module is in it, and validates the Caddyfile with and without the wildcard site, on every change to them.

**The wildcard site is written on the server, never in git.**
- The Caddyfile imports `extra/*.caddy`; with nothing there, nothing changes.
- `scripts/vps/set-preview-domain.ps1` writes `extra/previews.caddy` from `previews.caddy.template` with the Cloudflare token, readable by its owner only.
- The folder is gitignored and in `.dockerignore`, because the app image copies the checkout.

**One certificate for every `<name>.farbaek.si`.** The wildcard block serves previews and published sites alike. Published sites then need no certificates of their own. People's own domains and farbaek.si itself keep on-demand certificates.

**The owner's script checks before it changes anything.** In one SSH session, from the server:
1. the token is active, can read the farbaek.si zone, and Cloudflare reports the zone active (the nameservers have moved);
2. it can edit DNS: it adds one test TXT record and removes it;
3. the running Caddy has `dns.providers.cloudflare`;
4. Caddy validates and reloads with the wildcard site;
5. a preview name answers over HTTPS with a trusted certificate within 3 minutes. If it doesn't, the wildcard site is removed and Caddy reloaded, so published sites are back as they were;
6. only then is `SANDBOX_PREVIEW_DOMAIN=farbaek.si` saved and the app restarted.

`-Off` reverses it.

**The token's scope:** Zone > Zone > Read and Zone > DNS > Edit, for farbaek.si only, created by the owner. It can't touch farbaek.com, the R2 bucket or anything else in the account.

## Consequences

- **The Preview button works in production** for apps the sandbox runs, at `p-<id>.farbaek.si`, and the CSP frames that domain.
- **Fewer certificates:** published sites on farbaek.si share the wildcard.
- **Another dependency:** Cloudflare DNS for farbaek.si.
  - If the token is revoked, Caddy can't renew the wildcard. Renewal starts 30 days before expiry, so there's time to run the script again with a new token.
  - If Cloudflare DNS went down, farbaek.si names wouldn't resolve; farbaek.com is unaffected.
- **Previews and published sites share a registrable domain.**
  - Each is its own origin, and site names can't start with `p-`.
  - farbaek.si isn't on the Public Suffix List, so a page could set a cookie for all of farbaek.si. Neither previews nor published sites use cookies for anything that matters. Farbaek's own sign-in lives on farbaek.com.
  - Adding farbaek.si to the Public Suffix List is a later step.
- **The owner's steps** are in `docs/deploy/vps.md` under "Previews".

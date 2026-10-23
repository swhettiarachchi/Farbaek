# ADR 0045: Site certificates on demand, and custom domains

- Status: accepted (2026-10-23).
- Builds on ADR 0029 (publish), ADR 0035 (the VPS) and ADR 0032 (staff controls). It settles ADR 0029's open item "custom domains".

## Context

**Sites aren't served yet.** Published sites live at `<name>.farbaek.si`. On the VPS they need certificates. The plan in `docs/deploy/vps.md` was one wildcard certificate through DNS-01, which needs:
- farbaek.si's DNS moved to Cloudflare;
- an API token on the server;
- a custom Caddy build.

None of that has happened, so production doesn't serve published sites.

**Custom domains** (`www.yourshop.com`) were listed as not built.

## Decision

### Certificates on demand, after Farbaek says yes

Caddy's on-demand TLS makes a certificate for a name the first time it's visited, and renews it, after asking `http://app:3000/api/sites/tls-allowed?domain=<name>`.

**The answer** is 200 only for:
- a live site's name on the site domain (`harbour-lane.farbaek.si`);
- a verified custom domain whose site is live.

**"Live"** follows `app_site_for_serving`: published, and not blocked, paused or suspended. Answers are kept for 30 seconds.

**Everything else gets 404, so it gets no certificate:**
- preview names;
- unknown names;
- pending domains;
- Farbaek's own names.

**The Caddyfile** gains the global `on_demand_tls { ask … }` and a last `https://` block with `tls { on_demand }`. Farbaek's own names keep their own blocks.

**DNS for farbaek.si.** It needs one wildcard A record pointing at the server. No token, no Cloudflare move and no custom build.

**Previews stay off on-demand.** Each preview is a new name, and Let's Encrypt allows 50 new certificates a week under one registered domain. Published sites change names rarely, so they fit; previews wait for the wildcard certificate.

### Custom domains

**Adding a domain.** On the Publish panel, a contributor adds up to two domains per site. `normalizeDomain` turns what they type into a lower-case ASCII host (IDN included), and refuses:
- IPs;
- single labels;
- Farbaek's own zones.

The database checks the shape again, and that the name is unique.

**The records to set:**
- a TXT record at `_farbaek.<domain>` with `farbaek-verify=<token>` (32 random characters), to prove control;
- a CNAME to `sites.farbaek.si` for a subdomain;
- an A record to `SITES_TARGET_IP` for a root domain. Without that setting, root domains are refused with the reason.

**Verifying.** "Check DNS now" reads the records on the server, with a 4-second timeout and at most one check per domain each 15 seconds. `app_mark_site_domain` records the result.
- **A verified domain needs both records.** A subdomain may instead resolve straight to the server's address, which covers DNS providers that flatten CNAMEs.
- **Checking again after a record is removed** puts the domain back to pending.

**Serving.**
- Once sites are connected, any other real name goes to the site route (`decideRoute` → `custom-site`).
- The route serves a site only when `app_site_name_for_domain` finds a verified domain, and answers 404 otherwise.
- The site route's rules are unchanged: static files only, hidden folders not served, and staff controls apply.

**Security.**
- **Only the server marks a domain verified**, after reading DNS itself. All writes go through service-role functions that check the person is a contributor and the workspace isn't suspended. Each write is audited.
- **Certificates exist only for names that serve a live site.** Someone pointing their DNS at Farbaek gets nothing until they've proved control and the site is live.

## Consequences

- **Owner steps** (see `docs/deploy/vps.md`):
  1. at Hostinger, add `*.farbaek.si` and `sites.farbaek.si` as A records to the server;
  2. set `SANDBOX_PREVIEW_DOMAIN=farbaek.si` and `SITES_TARGET_IP`;
  3. deploy. The deploy reloads Caddy.
- **The first visit to a new name takes a few seconds** while its certificate is made.
- **Let's Encrypt allows 50 new certificates a week under farbaek.si** (renewals are exempt). If more new sites than that are published in a week, the rest wait until the window moves, or until the wildcard certificate is set up.
- **Not done:**
  - re-checking verified domains on a schedule;
  - a domain list in Office Space;
  - redirecting `example.com` to `www.example.com`.

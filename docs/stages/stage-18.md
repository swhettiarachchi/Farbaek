# Stage 18: Site certificates on demand, and custom domains

Production didn't serve published sites: the planned wildcard certificate for farbaek.si needed a DNS move, an API token and a custom Caddy build. With Caddy's on-demand TLS, each live site's name gets its own certificate on its first visit, after Farbaek says yes. The same mechanism lets people connect their own domains.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0045-site-certificates-and-custom-domains.md`.
- **Branch:** `feat/site-domains`, from `main`.

## 2026-10-23

### Done

**Migration v30** (`20261101090000_site_domains.sql`):
- **The table** `site_domains`:
  - a unique, lower-case hostname, checked against a hostname pattern and kept out of Farbaek's own zones;
  - a verification token;
  - a status of pending or verified;
  - at most 2 per site.
  - **Access:** members read it; only the server writes.
- **The functions:**
  - `app_add_site_domain`, `app_mark_site_domain` and `app_remove_site_domain`, for contributors, refused for suspended workspaces and blocked sites, each audited;
  - `app_site_name_for_domain`, which answers for verified domains only.

**The logic:** `src/core/publish/domains.ts`:
- `normalizeDomain`: what people type to an ASCII host; it refuses IPs, single labels and Farbaek's zones;
- `dnsRecordsFor`: a TXT plus a CNAME, or an A record for a root domain;
- `checkDomainRecords`: a verdict, with the missing records named in words.

**The server:**
- **`src/server/publish/domains.ts`:**
  - adding, checking and removing domains;
  - checks happen at most every 15 seconds, and DNS failures change nothing;
  - `tlsAllowed`.
- **`src/server/publish/dns.ts`:** a resolver with a 4-second timeout.
- **`GET /api/sites/tls-allowed`:** Caddy's question, answered 200 or 404 and cached for 30 seconds.
- **Serving:**
  - `decideRoute` sends other real names to the site route once sites are connected, never local names or addresses;
  - the site route serves a verified domain's site, and answers 404 otherwise.
- **Config:** `SITES_TARGET_IP` for root domains (in `.env.example`).

**Caddy:** `on_demand_tls` with the ask URL, and a last `https://` block with `tls { on_demand }`. Farbaek's own names keep their blocks.

**The Publish panel:** "Your own domain":
- adding a domain;
- each domain's status in words and an icon;
- the records to set, with copy buttons;
- "Check DNS now", with the missing record named;
- a visit link once verified;
- Remove.

**Docs:** `docs/deploy/vps.md` has the owner's steps for farbaek.si.

### Verified

- **`tests/db/site-domains.test.ts`** (7 tests):
  - adding a domain: pending, audited, unique, at most two, bad names and Farbaek's zones refused, contributors only, through the server only;
  - verification and its removal both change the mapping;
  - members read only their own workspace's domains;
  - removing a domain frees its name;
  - domains go with their site.
- **`src/core/publish/domains.test.ts`** (8 tests): normalization (IDN, ports, paths, IPs, Farbaek's zones), the records, and every verdict.
- **`src/server/publish/domains.test.ts`** (7 tests):
  - adding, with each refusal explained;
  - checking: verified, a missing TXT named, a DNS timeout changes nothing, the rate limit;
  - `tlsAllowed`: live names and verified domains allowed; paused sites, previews, unknown names and junk refused.
- **`hosts.test.ts`** and **`serve.test.ts`:**
  - other real names route to the site only when sites are connected, never the app, the office, Farbaek's names, local names or addresses;
  - a verified domain serves its site, and an unverified one gets 404.
- **Caddy:** `caddy validate` of the new Caddyfile inside the running container on the server, from a copy in `/tmp`, says "Valid configuration", and `caddy fmt` makes no changes. The live config wasn't touched.
- **The full suite:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,195 passed, 14 skipped.
- **In the browser,** on the film stage's publish scene (`/film-stage/build?t=44000`, dev only). It renders the real Publish panel; its sample got two domains temporarily, and that change was reverted afterwards:
  - the verified domain shows its chip, "Visit https://…", and its records with "Keep these records in place";
  - the waiting domain shows "Waiting for DNS", both records with copy buttons, and "Check DNS now";
  - with two domains, the add form is unavailable with "A site can have 2 domains";
  - in the phone format the card is 312px wide, nothing overflows, and the chip and Remove wrap under the name.
- **Not run:**
  - a local production build answering for a custom Host header (the routing and serving are unit-tested);
  - a real certificate and a real domain, which need the owner's DNS records first.

**Production database:** migration v30 applied to the self-hosted database on 2026-10-23.
- **How:** the SHA-256 (`6774b4d9…39fcbed82`) matched on the server; one transaction with `ON_ERROR_STOP`.
- **Read-only checks:**
  - `site_domains` has RLS with one read policy;
  - signed-in users can read and not write, and anonymous users can't read;
  - only the server can run the four functions.
- **Afterwards:** the API schema cache was reloaded.

### Next

- Re-check verified domains on a schedule, and show domains in Office Space.
- Redirect a root domain to its www name when both are connected.

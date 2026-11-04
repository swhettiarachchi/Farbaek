# 0029. Publish: static sites live on the site domain, gated by a security check

- Status: accepted (code built and tested; migration 19 not yet applied to the hosted project)
- Date: 2026-10-19

## Context

People who build a site with Farbaek want to put it on the internet. Farbaek's difference is proof and safety. Publishing should show both: what went live is exact and recorded, and it went live only after a check found nothing critical. People's content must never share an origin with Farbaek.

## Decision

**Where sites live.** Each site is at `<name>.<site domain>`, which is farbaek.si in production. That's the same separate domain previews use (ADR 0023).
- A wildcard DNS record sends every name there.
- The proxy serves:
  - preview hosts (`p-<id>`) through the preview gateway;
  - valid site names through `/site-serve`;
  - the bare domain as a redirect to Farbaek;
  - anything else as a 404.
- `/site-serve` checks the host again, so Farbaek's own host never serves people's files.

**What a deployment is.** It's the exact list of the project's file revisions that went live: path, revision, SHA-256 and size. It's recorded with a digest of that list and the security check it passed (migration 19: `sites`, `site_deployments`).
- Stored revisions never change, so a deployment needs no copy of the files.
- Rolling back points the site at an earlier deployment. Unpublishing points it at none.

**The gate, checked twice.** `publishSite` checks it so the page can explain what's missing; `app_publish_site` checks it again and has the final word. To publish, all of these must hold:
- there's a finished security check;
- it started after every file change, deletions included;
- it found no critical findings;
- the files being published are exactly the project's current revisions;
- an `index.html` exists;
- the project isn't archived;
- the person is a contributor.

**Names.**
- 3 to 40 lowercase letters, numbers and single hyphens.
- Unique across Farbaek.
- Not starting with `p-`, and not one of Farbaek's own (www, app, admin, mail and so on).
- The database repeats these rules.

**Serving.**
- Only GET and HEAD.
- Pages are found the way previews find them (`/about` can be `about.html`).
- Responses carry an ETag from the file's SHA-256, `nosniff` and a strict referrer policy, and no cookies.
- Which deployment is live is cached for 10 seconds; stored revisions are cached while there's room.

## Consequences

- Publishing is one click after a passing check, and every version can be made live again.
- **Plans.** Publishing needs a security check, which today comes with the trial and with the Plus plan and up. Whether Free should publish (for example after a rules-only check) is the owner's decision.
  - **Decided in ADR 0168 (2026-11-04):** every plan can publish. Plans below Plus run a rules check, which the publish gate accepts like any other finished check.
- **Shared parent domain.** Sites on farbaek.si share it, so one site's scripts could set cookies for `.farbaek.si`. Farbaek's own preview cookies are `__Host-` cookies and can't be overwritten that way. Adding farbaek.si to the Public Suffix List would isolate sites from each other; that's a request the owner files.
- **Not built yet:**
  - publishing apps with a server;
  - custom domains;
  - a live/unpublished-changes dot outside the project page.
- **To go live:**
  - apply migration 19;
  - connect `*.farbaek.si` on Railway;
  - add the DNS records at Hostinger;
  - set `SANDBOX_PREVIEW_DOMAIN`.

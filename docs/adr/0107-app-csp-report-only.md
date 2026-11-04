# ADR 0107: A nonce Content-Security-Policy for the app, report-only first

- Status: accepted (2026-10-29). Enforced by default since ADR 0169 (stage 155, 2026-11-04); `APP_CSP_ENFORCE=0` sends it report-only again.
- Builds on ADR 0032 (Office Space already has an enforced nonce CSP).

## Context

The customer app (`/app`) shows AI output, task notes and people's own files. Its only Content-Security-Policy covered framing, the base URI, forms and objects, with no `script-src`. `docs/architecture/current-state.md` listed the nonce `script-src` as still to come.

An enforced policy written blind could break signed-in features that the demo can't show. So the policy goes out report-only first.

## Decision

**The policy.** The proxy sends a per-request nonce policy on `/app` and `/admin` (`server/http/app-headers.ts`):
- **scripts** only from the nonce, with `'strict-dynamic'`. Next.js reads the nonce from the request header and puts it on every script, because app pages render per request;
- **connections** to Farbaek only, and **frames** from Farbaek and the preview domain;
- **objects** none, `base-uri` none, and `frame-ancestors` none;
- **images, fonts, styles and media** open to `https:`, because previews of people's sites inherit the policy.

Sign-in isn't covered: it loads Cloudflare Turnstile. Marketing pages are pre-rendered, so they can't carry a per-request nonce.

**Report-only.** It's sent as `Content-Security-Policy-Report-Only` with `report-uri /api/csp-report`:
- not `report-to`: Chrome ignores `report-uri` when `report-to` is present, and its batched delivery never arrived in testing;
- the endpoint logs each violation as its directive, the blocked origin and the page's path, never a full URL;
- it drops bodies over 16 KB and more than 120 violations a minute;
- it skips reports from preview frames.

`APP_CSP_ENFORCE=1` sends the same policy as `Content-Security-Policy`.

**Zod's probe.** Zod probes for `eval` with `new Function`, which a strict policy reports. The browser sets `jitless` (`components/app/csp-safe.tsx`) so the probe never runs; the server keeps Zod's compiled parsers.

## What report-only found (demo build, every app route at 375 and 1280 pixels)

- **Zod's `eval` probe** on the Mesh and task pages. Fixed by `jitless`.
- **Inline scripts in previews of people's own sites.** `StaticPreview` runs a site's scripts in a `srcdoc` frame, and a `srcdoc` frame inherits the app's policy, so enforcing would stop those scripts in previews.

**Enforcing waits until previews load from their own origin** (the preview domain), where the app's policy doesn't reach. Until then, enforcing stays off.

## Consequences

- Production reports show anything else the policy would block, from real signed-in use.
- Turning it on is one setting once the reports are clean and previews have moved.

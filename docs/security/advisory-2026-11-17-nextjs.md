# Next.js advisories fixed in 16.4.5: upgraded from 16.4.2

## What happened

On 2026-11-17, `pnpm build` stopped once on a security notice from Next.js; a retry built. As on 2026-10-23, the notice's own instructions to run its upgrade agent weren't followed; the claim was checked independently.

- **npm's advisory database** (`/-/npm/v1/security/advisories/bulk`) lists one advisory for `next@16.4.2`, and none for 16.4.5 or 16.4.6.
- **GitHub's advisory database** has the same one, published 2026-11-16 as CVE-2026-119790.
- **The 16.4.5 release notes** (GitHub's releases API, published 2026-11-03) list seven moderate advisories it fixes. Only the first is public in the advisory databases so far; the other six links are repository advisories whose details weren't readable on 2026-11-17, so their affected versions are taken from the release, not confirmed.

| Advisory (moderate) | Exposure here |
| --- | --- |
| GHSA-mfr8-8qww-v76h: information disclosure across root params when a `'use cache'` function is called through `unstable_cache()` (16.3.0 to 16.4.4) | Not reachable: the app has no `'use cache'` and no `unstable_cache` |
| GHSA-vc7v-qv4w-wrv8: cache leak across root param values in nested `'use cache'` functions | Not reachable, for the same reason |
| GHSA-rhh4-g77r-r9qj: cross-user cache disclosure and poisoning in `use cache` with binary arguments | Not reachable, for the same reason |
| GHSA-vvgp-ww4w-46vf: cache poisoning of shared fallback shells in Cache Components via request-supplied placeholder route params | Not reachable: Cache Components aren't turned on in `next.config` |
| GHSA-pc58-hwjq-p385: cross-client response injection and disclosure in self-hosted apps forwarding fetched responses | **Possible**: farbaek.com is self-hosted, and the sandbox preview gateway (`src/server/sandbox/gateway.ts`) forwards responses fetched from a person's running app. The details aren't public yet |
| GHSA-7qx7-33qx-rqx2: SVG rejection bypass in image optimization | Low: `next/image` is used in six components and the optimizer is on, but only for this site's own images (no remote patterns) |
| GHSA-f3mh-rxg3-f5g2: HttpOnly cookie exposure through an internal response header on Edge runtime routes | Not reachable: no route runs on the Edge runtime |

## The fix

`next` and `eslint-config-next` are pinned to exactly **16.4.5**, the security release, published 2026-11-03 (two weeks old; 16.4.6, from 2026-11-09, also has no advisories but is newer than needed). The release notes for 16.4.3 to 16.4.5 list bug fixes and these security fixes, with no renamed settings or new Node.js requirement.

- **The lockfile:** updated with lifecycle scripts off. Only Next.js's own packages changed (`next`, `@next/env`, `@next/swc-*`, `@next/eslint-plugin-next`, `eslint-config-next`).
- **The advisory database** returns no advisories for `next@16.4.5`.

## Checked

- `pnpm typecheck` and `pnpm lint` are clean.
- `pnpm test`: 3,762 passed, 17 skipped, the same as before the upgrade.
- `pnpm build` on Next.js 16.4.5 builds the first time, with no security stop.
- The build, served locally with the demo workspace: the homepage, `/chat`, `/build`, `/pricing` and `/api/health` answer 200; `/app` sends a signed-out visitor to `/sign-in`; the image optimizer serves AVIF to browsers that take it and JPEG otherwise (its very first request, while the server warmed up, answered 400 once; every repeat answered 200); no server errors in the log.

## Still to do

Production runs 16.4.2 until the fix is merged and deployed (merges to main deploy by themselves). Whether GHSA-pc58-hwjq-p385 was ever used against the preview gateway can't be told from this record; once its details are public, read them against `gateway.ts`.

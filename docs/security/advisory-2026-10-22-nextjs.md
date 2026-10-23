# Next.js advisories of 2026-10-22: upgraded to 16.4.2

## What happened

On 2026-10-23, `pnpm build` stopped on a security notice from Next.js. The notice's own instructions to run its upgrade agent weren't followed; the claim was checked independently.

- **npm's advisory database** (`/-/npm/v1/security/advisories/bulk`) listed three advisories for `next@16.4.0`, the version farbaek.com was running.
- **GitHub's advisory API** gave the same three, all published 2026-10-22.

| Advisory | Severity | Vulnerable | Fixed | Exposure here |
| --- | --- | --- | --- | --- |
| GHSA-2464-fhr4-w9xw: unauthenticated RCE in the Image Optimization API when SVG files are used | critical | 16.0.0 to 16.4.0 | 16.4.1 | Possible: `next/image` is used in three components, and the image endpoint is on by default |
| GHSA-673q-mjm6-r5xr: unauthenticated RCE in `use cache` functions returning typed arrays | critical | 16.0.0 to 16.4.0 | 16.4.1 | Not reachable: the app has no `use cache` |
| GHSA-p3m5-59mp-jv5r (CVE-2026-94482): denial of service in the App Router using Server Actions | high | 16.0.0 to 16.4.0 | 16.4.1 | Yes: Server Actions are used throughout |

## The fix

`next` and `eslint-config-next` are pinned to exactly **16.4.2**, the current stable release. It was published 2026-10-15 and contains the 16.4.1 fixes; neither version has install scripts.

- **The lockfile:** updated with lifecycle scripts off. Only Next.js's own packages changed (`next`, `@next/env`, `@next/swc-*`, `@next/eslint-plugin-next`, `eslint-config-next`).
- **The advisory database** returns no advisories for `next@16.4.2`.

## Checked

- `pnpm typecheck` and `pnpm lint` are clean.
- `pnpm test`: 1,111 passed, 14 skipped (smoke tests).
- A production build, served locally, with the pages and a server action answering.

## Still to do

Production runs 16.4.0 until the fix is merged and `farbaek-deploy main` runs on the server. No sign of exploitation was looked for, or found, in this record. Checking the server's logs for unusual `/_next/image` requests with SVG sources needs the owner.

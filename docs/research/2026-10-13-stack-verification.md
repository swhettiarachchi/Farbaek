# Stack verification, 2026-10-13

Checked in this session from the npm registry and the documentation bundled with Next.js 16.4.0 (`node_modules/next/dist/docs`).

| Fact | Source | Result |
| --- | --- | --- |
| Latest Next.js | `npm view next version` | 16.4.0 |
| Latest React | `npm view react version` | 19.3.0 |
| Next 16.4.0 peer React range | `npm view next@16.4.0 peerDependencies` | `^18.2.0 \|\| ^19.0.0` |
| TypeScript 7 usable by tools | `npm view typescript@7.0.2 main` | No `main` entry: compiler API not exposed. Pinned 6.0.3 |
| eslint-config-next 16.4.0 with ESLint 10 | `pnpm peers check` | Unmet peers (react, jsx-a11y and import plugins top out at ESLint 9). Pinned ESLint 9.39.5 |
| zod 4.6.7, vitest 5.0.4 release dates | `npm view <pkg> time` | Both published 2026-10-12 (one day old). Used 4.6.5 (2026-09-13) and 5.0.3 (2026-09-30) |
| `next build` runs lint | Next docs, installation guide | No longer, as of Next 16. Lint runs via `pnpm lint` |
| `next/image` LCP flag | Next docs, Image component | `priority` deprecated in 16; use `preload` |
| ESLint flat config for Next | Next docs, ESLint config | `eslint-config-next/core-web-vitals` (+ `/typescript`) with `defineConfig` |
| Phosphor icon names | Package typings | `*Icon` names; old names deprecated; server components import from `@phosphor-icons/react/ssr` |
| Logo file | WebP header and `sharp` pixel scan | 1024x1536, alpha channel, gold trim mean #D5A76E |

## Not verified this session (still marked [VERIFY] in the spec)

Dodo Payments API and eligibility, sandbox vendor pricing, Expo SDK version, MCP revision, OWASP list titles, auth provider details. None of these are implemented yet, so nothing depends on them.

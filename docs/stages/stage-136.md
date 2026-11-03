# Stage 136: A sitemap and robots.txt for Google Search Console

- **Branch:** `feat/sitemap-robots`.
- **Migration:** none.
- **ADR:** none.

## 2026-11-03

### Asked

The owner started adding farbaek.com to Google Search Console. Checking the site first showed that `/sitemap.xml` and `/robots.txt` both answered 404.

### Done

- **`src/core/seo/crawl.ts`** (pure, tested):
  - the public pages: home, Pricing, Security, Verify, the ProofPack spec, Privacy, Terms and Acceptable use;
  - the paths crawlers are asked to leave alone: the signed-in app, admin, the API, sign-in links and the password sign-in page, Office Space, invites, account deletion, the offline page, previews, published-site serving and the film stage;
  - the rules per host: the app's own host gets the public site and the sitemap's address; any other name that reaches the file (Office Space, a name nothing uses) gets "stay away" for everything.
- **`/robots.txt`** (`src/app/robots.ts`): chooses its rules from the request's host. Published sites keep answering their own `/robots.txt` from the site route.
- **`/sitemap.xml`** (`src/app/sitemap.ts`): every public page as an absolute address from `NEXT_PUBLIC_SITE_URL`, built on request, so the build never needs the address.
- **Search Console:** the owner adds the Domain property `farbaek.com`, verified with a TXT record at Spaceship (DNS edits are the owner's). Once it's verified, submit `https://www.farbaek.com/sitemap.xml`. `farbaek.si` stays out: it holds people's published sites.

### Verified

- `vitest` on `src/core/seo` and `tests/design`: 11 files and 148 tests. The new tests cover the rules per host, that no public page is also private, absolute sitemap addresses, and that every listed page exists in `src/app/(site)`.
- `pnpm typecheck`, and ESLint on the new files.
- **A production build, served locally:**
  - `/robots.txt` on the app's host: allow `/`, the 13 private paths disallowed, and the sitemap's address;
  - `/robots.txt` for another host (`officespace.localhost`): `Disallow: /` only;
  - `/sitemap.xml`: the 8 public pages as `application/xml`, and each of them answers 200.
- **Production before this change** (2026-11-03): `/api/health` answers ok on `8a636f3` (PR #174), and the app's pages send `payment=(self)`.

### Next

- After the merge: submit the sitemap in Search Console.

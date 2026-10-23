# Stage 27: Every build can finish

The owner asked for a platform real users can use from start to finish. Production showed where the journey stopped:
- **The account:** one account (the owner's).
- **The work so far:** 13 tasks, 5 finished cloud runs, 6 applied changes, a publish.
- **Where it stopped:** all three tasks waiting in "Verifying" were static sites whose plans listed no checks. Verification couldn't run, the task page offered nothing to do, and publishing needed an override.

- **Decision record:** `docs/adr/0054-site-check.md`.
- **Branch:** `feat/site-check`, from `main` after #33.

## 2026-10-23

### Done

**Farbaek's site check, `farbaek check-site`:**
- `checkSite` in `src/core/realityloop/site-check.ts`;
- the generated script in `site-check-script.ts`, built by `scripts/site-check-script.mjs` with a staleness test;
- what it checks:
  - an index.html;
  - each page's doctype, language, title and phone viewport;
  - local links, scripts, styles, images and CSS `url()`s, by Farbaek Sites' own path rules;
  - image alt text;
  - no insecure `http://` resources.

**Running it:**
- **The sandbox check run** writes the script into the sandbox, outside the project's folders, after hashing the applied files, and names it in the receipt with the script's hash.
- **`checksToRun`** chooses the plan's checks, or the site check for a static site whose plan lists none. It's used by:
  - the sandbox wiring;
  - the verification runner;
  - the task page.

**Plans:**
- the drafting prompt asks for `farbaek check-site` for existing static sites;
- the draft gets it when the model listed no checks;
- new projects (empty when drafted) fall back at verification time.

**The task page:**
- a static site with no checks in its plan shows the site check and "Check the site now";
- a project with packages and no checks now explains that nothing can verify it, and what to do next.

### Verified

- **Unit tests:**
  - a sound site passes, with links resolved the way Farbaek Sites serves them;
  - each problem is named;
  - links can't climb out of the site;
  - `isStaticSite` and `checksToRun`;
  - the generated script is current;
  - it runs under Node from a project folder: it exits 0 for a sound site, and lists problems and exits 1 otherwise, ignoring its own folder.
- **The sandbox service** (mock runtime): the site check writes the script, runs `node .farbaek-checks/check-site.mjs`, and records `farbaek check-site (script sha256:…)`. The task is marked verified.
- **The verification runner:** a static site with no checks starts; a project with packages and no checks is still refused.
- **Drafting:** a static site with no model checks gets the site check; a project with packages, or an empty one, doesn't; the model's own checks are kept.
- **Production data:** the three stuck tasks are all static sites (an index.html, nothing to install), so this unblocks them once deployed.
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean; the full suite is in the PR.

### Not verified

- **A live sandbox run of the site check.** The owner's stuck tasks are the first real runs.

### Next

- Run "Check the site now" on the three waiting tasks after the deploy, and confirm they reach Verified and publish without a reason.
- A site check for apps with packages (build succeeds, pages render), likely in the sandbox with the app's own build.

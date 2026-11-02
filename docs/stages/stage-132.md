# Stage 132: Static sites with a bare package.json, and the Launch page's promise

- **Branch:** `fix/static-with-package-json`.
- **Migration:** none.
- **ADR:** none. It widens ADR 0033's static rule and keeps ADR 0078's "explain instead of offering".

## 2026-11-02

### Found

Getting ready to launch the owner's "Tip calculator" to Vercel with a real account.

- **No host would take it.** The project is `index.html`, `src/app.js` and a `package.json` holding only a name and a version. The Launch page said "a project Farbaek can't place yet", offered no host, and Farbaek Sites said "Add an index.html", which it already had. Every host would serve it exactly as it is.
- **Previews were wrong about it too:** the run page said "There's no index.html yet" for the same reason. Both used the same path-only rule: index.html and no package.json.
- **A promise the page didn't keep:** the "Where it can go" card said "Connect your own account below" for Vercel and Netlify. For a project neither can take, the panel below rightly explains why and offers no connect form (ADR 0078's tests), so the link led nowhere.
- **A stale line:** a server app's run preview said "Live app previews turn on when the preview domain is connected". It has been connected since stage 131.

### Done

- **`src/core/workspace/static-site.ts`** has one rule, used everywhere:
  - `inertPackageJson` is true when package.json parses and has no dependencies of any kind, no workspaces, and no build, start, dev, serve, preview, prestart, postinstall or prepare script;
  - `isStaticSite` is true for index.html with no package.json, or an inert one;
  - `needsPackageJson` is true when both files are there, so callers read package.json only then.
- **Where it's used:**
  - `runProfile(paths, packageJson)` and the Launch Planner, whose evidence now reads "index.html, and a package.json that installs and runs nothing";
  - the run preview, the project and design pages, and publishing's readiness (an optional `packageJson` read, wired in `publishDeps`).

  Thumbnails already handled this case.
- **Messages:**
  - For a project with an index.html whose package.json does install or run something, Farbaek Sites and the run preview now say so, instead of asking for an index.html.
  - A server app's run preview points to the project's Preview while the preview domain is set, and gives the reason when it isn't.
- **The Launch page's cards:** when a host can't take the project, the card says "Not for this project. Why, below." Each host's fit is worked out once and shared by the card and its panel.

### Verified

- `static-site.test.ts`:
  - inert and busy package.json;
  - unreadable ones;
  - the static rule;
  - when to read package.json.
- `planner.test.ts`: the bare package.json case is static, ready for Farbaek Sites, and agrees with `runProfile`. One with a dev dependency stays unknown, with the new reason.
- **Test runs:** 42 files and 287 tests across core, launch, publish, workspace, content and the launch panel; `tests/design` (141).
- `pnpm typecheck` and ESLint on every changed file.

### Next

- **In production, after merge:** the Tip calculator's Launch page should show Farbaek Sites, Vercel and Netlify as possible. Then a real Vercel launch, with a token the owner creates and pastes into the connect form; Claude never sees it.

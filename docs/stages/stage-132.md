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

### In production, 2026-11-02

- **#166 deployed** (`473b6b9`). The Tip calculator's Launch page reads "A static website, ready for Farbaek Sites", with "index.html, and a package.json that installs and runs nothing". Its Vercel section offers the connect form.
- **The first real launch to Vercel (LaunchOS, ADR 0078):**
  - **The token:** Claude filled in Vercel's token form: `farbaek-launch-test`, scope "Suvin's projects" (All Projects, since the launch creates a new project), 1 day. The owner created it and pasted it into Farbaek's hidden token field. Claude never saw it. The Team ID is `team_OShrLOPoOQrfxJXRZTEgoV3V`.
  - **Connected** as `swhettiarachchi`. The launch showed 3 files, 794 bytes, `sha256:d76911…07a5`, No evidence, Production. It needed a reason ("Launch check at the owner's request…") and the name typed.
  - **The launch:** "Launch started. Vercel is building it now", then **Live** within a minute, "Answering (200)", at `tip-calculator-opal-six.vercel.app`, with the build log linked.
  - **Checked from outside:** `/` 200 (`<title>Tip calculator</title>`, 326 bytes), `/src/app.js` 200 (419 bytes). `package.json` (49 bytes) isn't served by Vercel, as expected. Together that's the 794 bytes sent.
  - **Disconnected afterwards.** The launch stays in the project's history. The Vercel project `tip-calculator` remains in the owner's team for them to keep or delete, and the token expires 2026-11-03.

### Next

- **Netlify, the same way,** once the owner has a Netlify account.
- **More hosting providers (Render, Railway, Fly.io):** still roadmap.

### Links with a full stop on the end

- **Found** when the owner opened "farbaek.com/sign-in/password." (copied from the end of a sentence) and got "We can't find that page".
- **Fixed** in its own pull request (`fix/stray-punctuation-links`): on the app's own host, a GET or HEAD whose path ends in `.`, `,`, `;`, `:`, `!`, `)` or `]` is redirected (308) to the same path without them, keeping the query. Published sites and previews never take this path. The rule is in `src/server/http/stray-end.ts`.
- **Verified:**
  - `stray-end.test.ts`;
  - in the dev server: `/sign-in/password.` redirects to `/sign-in/password`, `/pricing,?plan=pro` to `/pricing?plan=pro`, and `/delete-account).` to `/delete-account`; the plain path answers 200, and a POST is untouched.

# Stage 211: Dark for every signed-in page, beside Crystal White

- **Date:** 2026-11-22
- **Branch:** `feat/stage-211-dark-mode`, on top of `feat/new-logo-cat` (stage 210, PR #274)
- **Decision:** ADR 0227
- **Migration:** none. **New dependency:** none.
- **Skills applied:** `farbaek-ui`, `farbaek-human-made`, `premium-app-ui` (its dark mode rules: off-black, lighter surfaces as they rise, hairlines for depth, off-white text, a lighter accent, and both looks tested apart), `ui-ux-pro-max` (contrast and touch rules).

## What the owner asked

The brief of 2026-11-22: a premium Crystal White theme with "an equally polished Dark Mode", across the whole product, and "do not merely invert colors".

## What was built

- **Two looks, one set of token names.** Crystal White is the light look as it stands (`src/styles/tokens.css`), and the default. Dark is Chat's night palette, moved to `src/styles/theme-dark.css` and now every signed-in page's.
- **One choice.** Light, Dark or Auto, in Settings (a new Appearance card) and in Chat's settings: one component, `ThemeChoice`. Saved in the cookie `fb_theme` for a year. Chat's older cookie is still read, so a choice made in Chat is kept.
- **Right at first paint, no script.** The app's frame, the staff console and admin read the cookie on the server and render a mark (`ThemeMark`); the stylesheet reads it from the root with `:has()`. The root layout stays static, so public pages are still built ahead of time.
- **Instant change.** Choosing changes the mark in place: nothing reloads. The browser's own bars take the page colour.
- **Pieces that keep a look.** `data-theme="dark"` or `"light"` on an element. The picture of Chat at night on the public Chat page uses it.
- **The logo's paper.** One value, `--logo-paper`: nothing by day, white at night, for the small logo everywhere and the large cat on Chat's welcome screen. The hero's 3D scene has no paper and stays off on a dark page; its 2D drawing runs, now in night colours (`LOOM_NIGHT`).
- **Chat** no longer has a theme of its own: its night colours and cookie code are gone, and it shows the page's look.
- **A check for both looks.** `pnpm qa:responsive --theme=dark` photographs every route as someone who chose Dark.
- **Records:** `docs/farbaek/FARBAEK_DESIGN_SYSTEM.md` (every token in both looks), CLAUDE.md, AGENTS.md and the `farbaek-ui` skill.

## Verified

- `pnpm typecheck`, `pnpm lint`: clean. `pnpm build`: passes.
- `pnpm test`: 4,306 passed, 17 skipped (478 files passed, 5 skipped).
- **New tests:**
  - `tests/design/dark-theme.test.ts`: every text and control pair in Dark at WCAG AA (17 text colours on 5 backgrounds, graphics at 3:1, both buttons), every colour has a night value, Auto is exactly Dark, nothing follows the device unless Auto was chosen, no gold, amber or purple, the logo's paper, and the browser bar colours equal the tokens.
  - `src/core/theme/theme.test.ts`: only the three choices are ever read from a cookie, Chat's older choice is kept, the newer one wins, and the cookie's reach.
  - `loom-geometry.test.ts`: every colour the hero drawing uses has a night partner.
- **By eye, on the local demo workspace in Dark:**
  - 28 signed-in pages at 1280 px and 21 at 390 px (including Survey Studio's steps), each photographed and looked at on contact sheets. The audit found no sideways scroll, cut-off content, small targets or console errors on any of them.
  - Home, Settings, Billing, Build and Build's workspace at full size.

## What "assumes light" turned up

- **The logo** (a black cat): solved with its paper.
- **The hero drawing's colours** were fixed light values on a canvas: it now has night partners.
- **A token parser** (`scripts/ios-tokens.mjs`) expected `:root {` exactly: it reads the light rule whatever shares it.
- **Survey Studio's plan drawing** follows the look, so at night it shows light lines on charcoal, as CAD programs do. Exports (PDF, DXF) are unaffected. Whether the on-screen sheet should stay white paper is a choice for Survey's next stage.
- **Pictures of people's sites** (thumbnails, previews) are theirs and keep their own colours.

## Not verified, or not in this stage

- **Real phones.** The checks are emulated screens.
- **Choosing in the browser: checked later the same day, after the merge.** The three buttons were pressed in a browser on the local demo workspace, once as a light device and once as a dark one:
  - the page starts Light on both, since nothing follows the device unless Auto is chosen;
  - Dark turns the page at once, saves the cookie and changes the browser bar's colour;
  - Auto is light on the light device and dark on the dark one;
  - Light turns it back;
  - after a reload the choice is still shown and still chosen, another page has it too, and the public site stays light;
  - no errors on the page.
  Still not done: the same presses in a real signed-in session on production.
- **The staff console and admin in Dark** were wired the same way and typechecked, but not photographed: both need a signed-in staff session.
- **The public site** stays light. Its pages are built ahead of time and carry the most hand-made light; it needs its own pass.
- **The iPhone and desktop apps** are light only.
- **Firefox before version 121** and browsers before 2022 have no `:has()`: they stay light.

## Next

- Stage 212: one navigation, with Chat as the simple home.
- The public site in Dark.

# Stage 211, part 2: the public site in Dark

- **Date:** 2026-11-23
- **Branch:** `feat/stage-211-site-dark`, from `main`
- **Decision:** ADR 0232
- **Migration:** none. **New dependency:** none.

## What the owner asked

A Dark look on every page, beside Crystal White. Stage 211 did every signed-in page and left the public site light, because its pages are built ahead of time and no server reads a cookie for them.

## What was built

- **The public site follows the person's choice** (`src/app/(site)/layout.tsx`): the homepage, the spaces' pages, pricing, sign-in, the legal pages and the rest.
- **No white flash for someone who chose Dark.** A fixed script straight after the page's mark writes the saved choice on it before the page paints (`src/core/theme/site-script.ts`, `SiteThemeScript`). It accepts only "dark" or "system".
- **The mark stays right afterwards** (`SiteThemeMark`): arriving from the app without a full load, and changing the choice.
- **A control in the footer:** Light, Dark or Auto, the one Settings has. It is the same choice everywhere: change it on the site and the app has it, and the other way round.
- **Light is still what a new visitor sees,** also on a device set to dark.
- **The sign-in pages' script policy allows exactly this script, by its hash** (`src/server/http/app-headers.ts`).
- **A page already drawn stays in step with the choice** (`ThemeSync`, on the site and in the app): after Back and Forward, after another tab chooses, after a link inside the site, and when a device turns for someone on Auto.
- The rule in `CLAUDE.md` and `AGENTS.md` now says Dark is for every page.

## Verified

- **By pressing the control in a real browser,** at 1280 px on a light device and at 375 px on a dark device, with the same result on both:
  - a new visitor arrives in Light;
  - Dark turns the page at once and saves the choice;
  - the next page is already dark before the app's own scripts run, and so is the sign-in page under its script policy;
  - a link inside the site keeps it; the signed-in app shows the same look;
  - Auto follows the device, and turns when the device's setting turns;
  - Light is kept on the next visit;
  - no console errors.
- **Looked at, screen by screen, in Dark at 1280 px:** the homepage, Build, Pricing, Survey and Sign in, and the homepage's first screen with motion on (the 3D scene). At 375 px: the homepage.
- **Photographed in Dark with no console errors:** Chat, Images, Video, Proof, Security, Check a ProofPack, Privacy and the ProofPack format (their sheets were made, not each studied).
- **Layout audit in Dark,** 15 public routes at 375 and 1280 px: none scrolling sideways, none cutting content off, no small or lost taps, none out of proportion, no errors.
- **Accessibility audit** on the homepage, Pricing and Sign in at both widths: no findings.
- **Tests:** the script against a pretend page (writes Dark or Auto, leaves Light for anything else, reads only its own cookie, never throws); the script and the live page agreeing on fourteen cookie texts; its hash in the sign-in policy; no other inline script allowed there. `pnpm test`: 4,341 pass. `pnpm typecheck`, lint on the changed folders and `pnpm build` pass, and the public pages are still built ahead of time.

## Found by a fresh review before the pull request, and fixed

Every check above had passed. An independent read of the commit then found five faults, each confirmed and fixed, and each checked afterwards by doing what triggers it in a browser:

- **The browser's bar went light again after the first link inside the site** (the tags that colour it are replaced on each such link). It now stays dark over two links, and follows the device on Auto.
- **Back into the app showed the old look** after choosing on the site. It now shows the new one.
- **A choice made in this tab outranked the cookie for the tab's life,** so another tab's later choice was ignored. The cookie comes first now.
- **The script and the live page read two cookies of the same name differently.** Both take the first now, and a test holds them together.
- **One test proved nothing** (it compared the script with itself). Replaced.

The review also corrected two statements in the decision record: the offline page does turn, and two more pages stay light.

## Not done

- **Not seen on a real phone,** or on the live site.
- **Pages outside the site's layout that no server marks stay light:** shared links, the device page, the desktop app's connect page, and the page for an address that doesn't exist.
- **An installed app keeps its older, light copy of the offline page** until its service worker next updates.
- **With scripts off, the public site is Light** whatever was chosen.
- **The hero's cat on its white paper is a large white card at night,** on phones most of the first screen. That is the logo's rule (ADR 0226); a quieter treatment for the hero alone is the owner's call.
- The browser's own bars turn a moment after the page, once it is live.

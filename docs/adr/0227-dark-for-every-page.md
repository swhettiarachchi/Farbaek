# ADR 0227: Crystal White by default, Dark for every page as the person's choice

- **Status:** accepted (stage 211, 2026-11-22)
- **Builds on:** ADR 0008 (White Signal), ADR 0055 (no filters), ADR 0183 (status), ADR 0213 (Chat's Dark), ADR 0217 (the spectrum), ADR 0226 (the logo)
- **Changes:** ADR 0008's "one light theme", and ADR 0213's "Chat alone offers Dark"

## Context

The owner's brief of 2026-11-22 asks for "a premium Crystal White theme" with "an equally polished Dark Mode", and says a dark mode must be a design of its own, not an inversion.

Until now Farbaek had one light theme (ADR 0008). Farbaek Chat alone offered Dark (ADR 0213), with its night colours scoped to Chat's own frame and a cookie only Chat's pages received. Someone who chose Dark in Chat met a white page the moment they opened Home, Settings or Build.

Two facts made a product-wide Dark practical rather than a rewrite:

- **Colour already comes from tokens.** Tests refuse hard-coded colours, so a second set of values for the same names reaches nearly every screen. Sixteen files hold a colour literal, most of them pictures of people's own sites.
- **The night values exist and have been lived with.** Chat's palette has been in production since stage 199, was looked at by the owner, and is tested for contrast.

The study of the reference products (ChatGPT, Claude, Grok, Antigravity) found the same shape in all of them: a quiet light look, a dark look that is its own design, and one setting with three choices.

## Decision

**Two looks, one set of names.**

- **Crystal White** is the light look and the default. It is the White Signal palette as it stands (`src/styles/tokens.css`): a near-white page, white surfaces, graphite text, grey hairlines, soft ink-tinted shadows, signal blue as the one accent. Nothing in it changes with this ADR; it gains a name.
- **Dark** is the person's choice, for every page (`src/styles/theme-dark.css`). It is Chat's night palette, now everyone's: deep charcoal instead of black, surfaces that get lighter as they rise, hairlines and a faint top edge instead of shadows, soft white text, signal blue lightened so it doesn't vibrate, the status colours lightened to read on charcoal. The media frames (terminal, sandbox output) are dark in both looks.
- **Auto** follows the device's own setting. Nothing follows the device unless the person chose Auto.

**Light stays the default.** A person who never chooses sees exactly what they saw before. This is also the rule for the sites Farbaek builds for people.

**Every signed-in page, the staff console and admin.** "Every page" in this ADR means every page behind sign-in. The public site stays light for now (see the end). *Changed by ADR 0232 (stage 211, part 2): the public site follows the same choice.*

**One choice, saved once.** A cookie, `fb_theme`, on every page for a year. Chat's older cookie is still read where the browser sends it, so a choice made in Chat is kept; the first change anywhere replaces it. The control is one component (`ThemeChoice`), in Settings and in Chat's settings.

**Right at first paint, with no script.** The frames that render per request (the signed-in app, the staff console, admin) read the cookie on the server and render a mark, `data-page-theme`, inside the page. The stylesheet reads it from the root with `:has()`, so the whole page is turned before it paints, dialogs and menus included. The root layout stays static, so the public pages keep being built ahead of time. Browsers without `:has()` (before 2022, and Firefox before version 121) stay light.

**Pieces can differ from their page.** `data-theme="dark"` turns one piece (the picture of Chat at night on the public Chat page). `data-theme="light"` keeps one piece light on a dark page (a sheet of paper, a picture of the light app).

**The logo keeps its paper at night.** The black cat sits on its own white (ADR 0226) wherever the page is dark, through one value, `--logo-paper`. It is never inverted.

**Changing it is instant.** Choosing sets the cookie and changes the server's mark in place, so nothing reloads. Only pages that carry a mark turn, so the public site doesn't depend on which page someone came from. The browser's own bars take the page colour (`generateViewport` on the server, and in place when the choice changes).

## What was checked for "assumes light"

Every signed-in route was photographed in Dark at phone and desktop width and looked at (`pnpm qa:responsive --theme=dark --shots`, a new option). What needed its own decision is listed in `docs/stages/stage-211.md`.

## Consequences

- CLAUDE.md, AGENTS.md and the `farbaek-ui` skill say: two looks, light by default, colours from tokens only, and check a new screen in both.
- `tests/design/dark-theme.test.ts` holds Dark to the same contrast rules as Light, checks that every colour has a night value, that Auto is exactly Dark, and that there is no gold, amber or purple.
- A new colour token needs a night value, or the test fails.
- A colour literal in a component is now wrong twice over: it breaks the token rule and it will not turn.
- **Not in this stage:**
  - The public site. Its pages are built ahead of time and carry the most hand-made light (the hero, the halos, the product windows). It stays light until it has had its own pass.
  - The films are recordings of the light interface.
  - The iPhone app is light only. The desktop app is light only.
  - Sites and apps that Farbaek builds for people are theirs: their look is their plan's choice, not this setting.

# Stage 158: Phones that feel native, and ready for Play

- **Branch:** `feat/phone-polish`, from `main` after PR #202.
- **Decision:** ADR 0171.
- **Research:** the report of 2026-11-05 on hybrid iOS rules and premium UX, kept outside the repo. It places the keyboard, text size, first paint and in-app reporting ahead of the Play production application, expected around 16 November.
- **Skills used** (the owner asked for them on every build): `mobile-app-ui-design`, `premium-app-ui`, `ui-ux-pro-max` and `farbaek-ui` for the phone work, `ecc-security-review` for the inline script and the share input, and `chrome-browser` and `built-in-browser` for the walks.

## What changed

Everything except the Android shell reaches the Android app on merge, with no store update.

- **No price at first paint.** An inline script of our own marks the page before it paints, and CSS hides web purchase controls, web prices and the FAQ answers about how the website takes payment. Ordinary browsers are unaffected.
- **Report this result.** A link beside the plan, the change, the run and the project's preview opens the in-app form with the `abuse` topic. It's named from a record the person can read, and it needs no migration.
- **The keyboard.** `interactive-widget=resizes-content` keeps pinned boxes above it. `KeyboardMark` tells the keyboard from the screen's height, and the tab bar, the cookie notice and the staff console's bar step aside while it's up.
- **Text size.** The `text-scale` meta, and every text size in rem, except the recorded film stages and the showcase mockups. Below 18em, things that stay on one line may wrap and stack, which normal text on a phone never reaches. The tab bar keeps its height, its labels stop at 14 px, and with the largest text the logo stands alone.
- **Touch targets.** Small buttons are 48 px on touch and 44 px with a mouse.
- **Sharing.** Text or a link shared to Farbaek becomes a draft in the build box. It's never sent by itself.
- **The Android shell (version 1.2.0, code 4).** A share target and a splash image. This one needs a store update.
- **Smaller:**
  - the pricing page's "at $19.99" became "on Plus", so a price isn't written into a sentence;
  - `CLAUDE.md` and the `farbaek-ui` skill carry the new rules.

## Found by an independent review, and fixed

An agent that hadn't seen my reasoning read the risky files and the real source of `androidbrowserhelper` 2.7.4. It confirmed the metadata names, the share target's absolute address and the first-paint script under the enforced policy. It also found these:

- **My keyboard design could lose taps (the most serious).** I first hid the tab bar while a field had focus, in CSS. But focus leaves the field on the way to a tap, so the bar came back at that moment, moved the Send button 64 px, and the tap could miss. Pressing Back to close the keyboard also left the bar hidden. It's now told from the screen's height, and the bar stays put until the keyboard really goes.
- **Someone with no workspace lost what they shared,** because the layout replaces the page there. Their kept prompt could also send itself. The build box now reads the address itself, wherever it's shown.
- **"No price at first paint" wasn't true on `/pricing`:** the plan prices, the comparison, the homepage's plans and the FAQ's payment answers all still showed. They're now hidden in the app.
- **Carrying a shared draft through sign-in put the person's words into an emailed link and could break a form post.** I removed it. A person who's signed out signs in and shares again.
- **`?resume=1&text=hi`** sent a kept prompt, because the text was too short to count as shared. Any shared field now turns off the automatic send.
- **A page shared from a browser** could lose its title. It's now the title, then the address.
- **The `text-scale` tag** could arrive late on dynamic pages through streamed metadata, so it's in the head by hand.
- **The film players' own text** had been left in pixels along with the recorded stages.

## Found by looking at it

The audit reported no problems at 200% on these, and my eyes did:

- "Farbaek" broke into "Farbae / k", so with the largest text the logo now stands alone.
- The Approvals badge swelled over its icon, so the tab bar's badge now keeps a fixed size.
- At 320 px and 200%, a workflow step's link was 32 px wide, its words stacked letter by letter. The audit only caught this as a small target. So below 18em, flex rows now wrap instead of squeezing.

## Verified

- **Checks:** typecheck and lint are clean. The full suite passes 2,675 tests, with 17 skipped.
- **Scanners on a demo production build:**
  - `pnpm qa:responsive`: 550 page views, 0 issues;
  - `pnpm qa:a11y`: 96 page views, 0 findings;
  - `pnpm qa:vitals`, phone profile, lab numbers: LCP 1.1 to 2.0 s, CLS at most 0.056, TBT 117 to 210 ms.
- **Text size, using the new `--text-scale`, which raises the browser's default font size:**
  - at 200% on 320 and 375 px, every route: 100 page views, 0 issues;
  - at 150% on 375 px, every route: 50 page views, 0 issues.
- **First paint, with Next.js's scripts blocked so nothing hydrates:**
  - on `/pricing` in the Android app, 0 of 11 purchase controls show, and in a plain tab all 11 do. After hydration, no web price or mention of the web's payment provider is left on the page;
  - on `/app/billing` the mark is set under the enforced policy;
  - there are no policy violations.
- **The keyboard, by shrinking a touch screen with a field focused:** the tab bar goes and `--tab-bar` is 0. The approve bar sits at 748 of 812 px, and at the bottom edge with the keyboard up. When focus leaves it doesn't move, and it comes back only when the keyboard goes. A smaller window with no text field in use changes nothing.
- **Sharing:** with a kept prompt and `resume=1`, the box fills with the title and address, the note shows, and no request is sent.

**Not checked, because only a real phone can show it:**

- the keyboard itself, and whether a tap survives it;
- `text-scale` inside a Trusted Web Activity, as the audit uses the browser's default font size instead;
- whether `text-size-adjust: 100%` gets in its way;
- the Android shell's share target and splash;
- the bottom bar's icons on 3-button navigation, where the research notes a Chrome regression on versions 153 to 156.

## Next

- **The owner's Android phone, after the merge, about a minute each:**
  - typing in Help keeps the box above the keyboard, and Send works on the first tap;
  - Android's text size at maximum;
  - the bottom bar's icons on 3-button navigation;
  - no price flash on Billing.
- **Android 1.2.0** goes to Play with the next upload, once the owner has run `set-google-play.ps1`.
- **Stage 159:** signature moments and the motion system, within the research's budgets.
- **Stage 160 on:** the iPhone.

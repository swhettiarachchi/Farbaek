# ADR 0171: Phones that feel native

- Status: accepted (2026-11-05).
- Amends ADR 0150 (nothing is bought from the web in the Android app), ADR 0099 (Android) and ADR 0079 (the installed app). Follows the owner's research report of 2026-11-05 on hybrid iOS rules and premium UX, kept outside the repo; what this decision takes from it is stated below.

## Context

Farbaek for Android is the website in a Trusted Web Activity, so most of what makes it feel native lives in the site's HTML and CSS. Production access on Google Play is expected around 16 November (ADR 0154), and the research places the keyboard, text size, first paint and in-app reporting ahead of that application.

- The keyboard covered anything pinned to the bottom, because Chrome resizes only the visual viewport by default.
- Android's text size setting did nothing: there was no `text-scale`, and 394 text sizes were in pixels.
- Inside the app, buy buttons showed until hydration, because React can't know it's in the app before then. ADR 0150 hides them to follow Play's Payments policy.
- Play's AI-Generated Content policy asks for reporting that works without leaving the app. Google names neither AI app builders nor private previews, so treating Farbaek as covered is the cautious reading.
- Small buttons were 44 px, against Google's 48 dp for primary controls.

## Decision

**No price at first paint.** An inline script of our own marks `<html>` before anything paints, and CSS hides web purchase controls. It's built from the same constants as `inAndroidApp`, and a test runs the script against that function on every combination. It renders in the app layout, with the request's nonce, and in the public layout, whose policy doesn't limit scripts. It isn't in the root layout, because reading a nonce there would make every page dynamic. Ordinary browsers are unaffected. As ADR 0150 says, this follows a store's rule and isn't a security boundary.
- The same mark hides web prices and the questions about how the website takes payment on the pricing page, the comparison and the homepage's plans. Where Google Play sells a plan, its own price shows instead.

**Report this result.** A link beside the plan, the change, the run and the project's preview opens the in-app form with the existing `abuse` topic, which Office Space already filters on. The form is named from a record the person can read, so nothing typed into the address reaches it. No migration.

**The keyboard.** `interactive-widget=resizes-content` makes the keyboard shrink the page, so boxes pinned to the bottom stay above it. On a touch screen, while the keyboard is up, the tab bar steps aside, because it would otherwise ride on top of the keyboard. So does the cookie notice, and the staff console's bar. One `--tab-bar` variable sits behind everything pinned above the bar.
- `KeyboardMark` tells the keyboard from the screen's height: a resize that loses at least a fifth of the height at the same width, with a text field in use. Focus alone can't be the signal. It leaves the field on the way to a tap, so a bar that came back at that moment would move what's being tapped, and the tap would miss.
- iPhone's Safari ignores `interactive-widget`, so it behaves as it did. The iPhone app is native.

**Text size.** `<meta name="text-scale" content="scale">` asks Chrome to scale the root with Android's setting, and text sizes are in rem. The meta tag is written into the root layout's head by hand, because dynamic pages can stream their metadata later. `tests/design/rem-text.test.ts` keeps pixels out, except in the film stages (recorded canvases) and the showcase mockups (other people's designs). The players around the films are ordinary page text, and follow it.
- A block in `globals.css` applies below 18em, and lets what stays on one line or side by side at normal sizes wrap and stack. A 320 px phone at normal text is 20em, so normal text never reaches it.
- The tab bar stays 64 px tall, and its labels stop growing at 14 px, because five labels can't double in width.
- `pnpm qa:responsive --text-scale=2` checks this by changing the browser's default font size, the same value Chrome scales.

**Touch targets.** Small buttons are 48 px on touch screens and 44 px with a mouse. Links keep their 44 px minimum, since the 48 dp guidance is for primary controls.

**Sharing to Farbaek.** Text or a link shared from another app becomes a draft in the build box. It's never sent by itself: a shared address also turns off the automatic send of a kept prompt, so a crafted link can't start a build. The box reads the address itself, so this holds on the new build page and for someone with no workspace yet.
- Signed out, the words are not carried through sign-in. They'd go into an emailed link, and prompts are kept out of addresses (`PROMPT_STORAGE_KEY`). The person signs in and shares again.
- A shared draft does travel in this one address, so it can reach server access logs, as any web share target's GET does. A POST target would avoid that, but it can't be tested here without a phone.
- A very long share can pass the server's limit for an address, and shows an error. It's rare, because apps usually share a title and a link.

**The Android shell** gains a share target and a splash image, in version 1.2.0 (code 4). It needs a store update, which waits for the owner's Google Play key. Everything else reaches Android on merge.

## Left alone

- The offline page and service worker already exist.
- The research rates moving the safe area from `padding` to `bottom` as low priority, since `viewport-fit=cover` means Chrome's chin never appears.
- No `navigator.vibrate`: Android's own guidance prefers no haptics to buzzy ones.

## Consequences

- Typing never hides the field, and the app works at Android's largest text.
- People can report an AI result from where they see it, ahead of the Play application.
- A rule in `globals.css` overrides a few utilities below 18em. It's a blunt tool, chosen because hundreds of rows need the same allowance. It can't reach normal text on a phone: only a folded screen's 280 px cover gets there, where wrapping helps too.
- A real phone is the only full test of the keyboard, whether a tap survives it, `text-scale` inside a Trusted Web Activity, and the 3-button navigation bar's icons, where the research notes a Chrome regression on versions 153 to 156. These stay on the owner's short phone check.
- `text-size-adjust: 100%` stays for now. If it stops scaling on a real phone, it goes.

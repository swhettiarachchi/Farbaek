# Stage 187: Nearby on Android, redesigned (1.3.2)

- **Branch:** `feat/nearby-android-redesign`, from `main` (07c2cd5).
- **ADR:** none. The screen follows ADR 0008 (White Signal), ADR 0183 (status kinds and one icon set) and ADR 0193 (Nearby on Android); no decision changes.
- **Migration:** none.
- **Skills:**
  - **The look:** `premium-app-ui` (brief, dials, the premium moves, phone fallbacks), `mobile-app-ui-design` (thumb zone, one primary action, peak and end moments), `farbaek-ui` and `farbaek-human-made` (tokens, shape lock, StatusBadge's kinds, plain words, no tells).
  - **Checks:** `ui-ux-pro-max`'s touch, insets and text-size rules.

## What the owner asked

After pairing their phone (Redmi A5, Android 15) with their computer for the first time: how to check it works, and to make Nearby's screen more attractive and phone-friendly.

Their screenshots showed what was wrong:
- **Covered content:** the bottom card ran under Android's navigation buttons. Android 15 draws apps behind the bars, and the screen didn't make room for them.
- **A cut-off button:** "They don't match" wrapped onto two lines, and its pill was cut off at the card's edge.
- **Saying it twice:** "Paired with DESKTOP-9OIQ8KS" was both the heading and the line under it, and the only button was Done. Nothing said what to do next.
- **The wrong order:** the screen led with the phone's own settings. Sending to the computer, the reason people open it, came second.
- **A mismatch with the app around it:** the system font, no icons, and states shown in colour alone, where the website uses Geist, Phosphor icons and StatusBadge.

## Design brief

- **Feeling:** calm, sure and quick.
- **Primary action:** send photos and files to a paired computer. **Signature moment:** pairing or a transfer succeeding. The check grows in and the phone gives a short tap.
- **Direction:** Farbaek's own (White Signal), with one light theme and one accent.
- **Dials:** motion 3 of 10 (press-in, cards rising in once, smooth progress), depth level 1 (hairline borders and a faint ink-tinted shadow), standard density.

## What changed

**Layout:**
- **Edge to edge on every version:** a window insets listener keeps everything clear of the status bar, the navigation bar, the display cutout and the keyboard. Messages now appear at the bottom, above all of them, rather than at the top of a page that may have scrolled away.
- **Top bar:** Back to Farbaek, plus the screen's name, which appears once the large title has scrolled under the bar (with a hairline under it).

**The cards, in order:**
1. **What needs you:** a pairing code to check, or a file to accept, in the accent's border.
2. **Your computer(s):** the name, a badge ("On this Wi-Fi" or "Not on this Wi-Fi", with how to fix it), then one full-width **Send photos and files**. **Forget this computer** is a quiet button under it. With nothing paired, three numbered steps say how to pair.
3. **On this Wi-Fi, not paired:** **Pair with {name}** is the main button when nothing is paired yet.
4. **Receive on this phone:** the Visible switch with plain words on what it does and when it turns off, then this phone's name and key.
5. **Received:** Share and Delete for each folder.
6. **Pair by address:** folded away behind a disclosure, because most computers appear on their own.

**Pairing:**
- **The code:** the six digits sit on two tiles in Geist Mono.
- **The choice:** **They match** and **They don't match** are stacked full width, so neither gets cut off on a narrow phone.
- **When pairing finishes:** a check, then "Send it a photo to try it" with what the computer will show, and **Send photos and files**.

**Transfers:**
- **States:** every state is a StatusBadge kind (icon, words, colour and border).
- **Progress:** a 6dp bar in the accent.
- **What happens next:** one sentence where the badge alone doesn't say it, such as "Accept it on DESKTOP-9OIQ8KS, in Nearby." or "DESKTOP-9OIQ8KS checked every file when it arrived."

**Type, icons and motion:**
- **Type:** Geist and Geist Mono, the website's fonts. `scripts/android-fonts.mjs` unpacks the variable WOFF2 that Next.js ships into TrueType, following the W3C WOFF2 spec, with no new dependency. The licence travels in `assets/fonts/OFL.txt`.
- **Icons:** 23 Phosphor icons as vector drawables, made by `scripts/android-icons.mjs` from the installed package. Outlined icons name things, bold ones sit in buttons, and filled ones report states.
- **Buttons:** 52dp pills (44dp for quiet ones) that press in to 97%. TalkBack reads them as buttons.
- **Motion:** new cards rise in once. The success check pops once. All of it stops when Android's animations are off.

**Samples and version:**
- **Samples:** debug builds draw each state from samples (`src/debug`; the `src/release` stub offers none). The Android launch check screenshots every state, plus two at 130% text.
- **Version:** 1.3.2 (versionCode 7).

## How to check a real send (for the owner)

1. **Phone:** under Your computer, tap **Send photos and files** and pick a photo. The Transfers card shows "Waiting to be accepted".
2. **Computer:** Nearby shows "Redmi A5 wants to send…". Choose **Accept and choose folder**.
3. **Phone:** the badge moves through Sending to **Delivered**. **Computer:** **Received and checked**, then **Open folder** shows the photo.
4. **The other way:** turn on **Visible to your computers** on the phone, then send from the computer. The phone shows **Waiting for you**. Tap **Accept**, then **Share** to save it.
5. **No internet:** turn off mobile data and send again on the same Wi-Fi.

## Looked at, then fixed

The first launch check (run 43426226469) screenshotted every state on a Pixel 6 emulator (1080 by 2400). The screens matched the design, and these were fixed:

- **Two Sends after pairing:** the success card's and the computer's own. The success card now says how to try it and has only Done.
- **Layout slips:** the bar's hairline stopped short of the right edge, and a lone Cancel or Dismiss floated in the middle of its row.
- **An invisible switch:** off, the Visible switch was a white thumb on a pale track. It's now Android's current shape: outlined when off, filled with the accent when on.
- **Wording:** "Key" was set in Mono (only the key itself should be), and "Delivered" named the computer twice.

An independent review of the change found, and this stage fixed:
- **Messages that vanished early:** "Calling…" and "Getting files ready…" hid after about 4 seconds, while pairing can take 30. Now they stay until the work says how it went.
- **Redrawing everything:** progress (five times a second) rebuilt every card. That restarted spinners, cut animations short, re-enabled buttons already pressed, and moved TalkBack's focus. Now only the bars move, and the cards are drawn again only when something else changes.
- **Measuring on the main thread:** every received folder was measured on each drawing. Now only the 30 shown are, each once.
- **Covered input:** the keyboard could cover the address field once the window drew edge to edge. The scroll area now stops above the keyboard.
- **Android 7:** white navigation buttons over a near-white screen. They get a dark scrim there.
- **Accessibility:**
  - quiet buttons were 44dp (now 48);
  - the address field had a fixed name, so TalkBack didn't read what was typed;
  - steps were read twice;
  - the six digits could wrap at large text (they now stop growing at 130%).
- **A repeat:** the pairing check popped again after the phone was turned.
- **The launch check:** more time (35 minutes), a loud error if a sample doesn't open, and the code checked at 200% text.

The review found no defects in the font converter after checking it against the spec and the reference decoder, and no change to what the screen asks the node to do.

## Verified

- **Build:** `:app:compileDebugJavaWithJavac` and `:app:compileReleaseJavaWithJavac` pass, so the release build compiles without the samples. `:app:assembleDebug` builds, and Android lint reports no errors and no calls above minSdk 24.
- **The first launch check** (release APK on Android 14): Farbaek opens, Nearby opens from its link, Visible starts the service in the foreground, and nothing crashed. All 22 sample screenshots were taken with no crash.
- **The second launch check** (run 43428595092, after the fixes): passed, with 24 screenshots and no crash. Looked at by eye:
  - **After pairing:** one Send on the screen.
  - **Bar and buttons:** the bar's hairline runs edge to edge, and Dismiss sits at the start of its line.
  - **Switch and key:** the off switch is outlined and visible, and "Key" is in Geist with the key in Mono.
  - **Large text:** at 200% the six digits stay on one line, side by side, and every other word wraps without being cut off.
- **Lint:** Android lint after the fixes reports no errors, and no warnings about new APIs, unused resources or accessibility.
- **Fonts:** both TTFs load in Chrome, which rejects malformed fonts. At weights 400, 500 and 700 they draw pixel-identical to the original WOFF2 (0 differing pixels), and their widths differ from the fallback fonts'.
- **Web checks:** `tests/design` (180) passes, and lint is clean on the two new scripts.

## Not done

- **A real phone:** the owner's Redmi A5 gets 1.3.2 through Internal testing, which has no review wait.
- **The desktop app's Nearby:** unchanged here. Its words for the same states already match these.

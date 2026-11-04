# Stage 147: The launch audit

- **Branch:** `fix/launch-audit`.
- **Migration:** none.
- **ADR:** none (no decision changed).

## 2026-11-04

### Asked

A full audit of the website, the iOS app and the Android app before launch: everything working, consistent and premium on every screen size. Fix what's wrong without breaking anything.

### What was checked

- **Production on desktop, in the owner's Chrome** (signed in to the Free workspace):
  - every public page section by section;
  - Mission Control, Build, Projects, Tasks and Approvals;
  - 16 more app sections, and every subpage of the five projects (30).
  - Every page answered 200 with no error markers, and the pages viewed logged no console errors.
- **Production at phone width** (375 px, touch, in the in-app browser): the home, pricing and sign-in pages.
- **The signed-in app at phone width:** a local demo build of the code that's live (main at `a891466`), measured page by page for sideways scroll, cut-off content and touch targets under 44 px:
  - 25 app sections;
  - three projects with every subpage;
  - five tasks and six templates.
- **The Android app:** it's a Trusted Web Activity of www.farbaek.com, so the phone-width checks are its screens. Its site verification (`/.well-known/assetlinks.json`) lists both signing keys, so it opens full screen without a URL bar.
- **The iOS app** (SwiftUI) was read in code, since it can't be built on Windows:
  - its colours are generated from the web's tokens and are in sync;
  - its buttons are pills of 44 to 50 pt with a press response;
  - status uses an icon and words;
  - Reduce Motion is respected, and every screen has a loading state and a retry;
  - there are no em dashes or placeholders, and only plain SF Symbols.
- **Speed at phone width** (lab numbers, no CPU slowdown):
  - the home page paints its largest element at 1.7 s, with no layout shift, in 152 KB;
  - pricing at 1.2 s, with no layout shift.

### Fixed

- **Footer links were 18 px tall on phones.** They now give a 44 px target, like the legal links below them.
- **The sign-in page said "Farbaek is in early development, so expect rough edges"** while the home page says it's open. It now states the true fact a new person needs: a 14-day Pro trial with no card.
- **The page picker on multi-page template previews** was 36 px tall with 14 px text, which made iPhones zoom when it was tapped. It's now 44 px with 16 px text on phones.
- **iOS:** the Today count and the Welcome headline were fixed sizes. They now grow with the person's text size (Dynamic Type).

### Looked at and left as they are

- **The hero's "Now open" pill:** its box is 34 px, but its tap area extends to 46 px.
- **Inline links inside sentences:** they're exempt from the target size.
- **Hidden file inputs** behind upload buttons.
- **The Tip calculator's thumbnail looks unstyled.** That's the project itself (it has no stylesheet); its "Upgrade this site's design" task is waiting for the owner's approval.

### Not checked

- **Real phones:** the in-app browser emulates a phone's width and touch.
- **The iOS app running:** CI compiles it on this push.

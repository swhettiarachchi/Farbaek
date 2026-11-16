# ADR 0211: Proportioned on every screen

- **Status:** accepted
- **Date:** 2026-11-16
- **Stage:** 196
- **Amends:** ADR 0171 (phones that feel native: touch targets) and ADR 0184 (one field, four titles).
- **Extends:** ADR 0008 (White Signal), ADR 0049 (small text), ADR 0153 (denser phones).

## Context

The owner found Farbaek oversized and uncomfortable on phones, across the platform and in Survey Studio: letters, icons, buttons and parts too big, with poor spacing and proportion. Three read-only inventories and a design review found the causes in a few shared pieces, not page by page:

- **Sizes only stepped up.** The phone size was the base: app titles 28px, public titles 40px, focused titles 32px at every width, the home headline 46px over five lines, section titles 32px.
- **Spacing didn't compress.** 42 page wrappers used a 32px gap at every width, marketing sections padded 80px on a phone, and 35 double-bezel panels took 44px a side.
- **Controls were 48px everywhere,** with a mouse too: medium buttons, every field, segmented controls at 52px.
- **Tablets got the phone layout stretched,** with five tabs bunched into the middle 512px.
- **Survey Studio** had specific faults:
  - the step strip scrolled with a visible scrollbar;
  - one-line buttons overflowed at 360px;
  - title fields sat two to a row on a phone;
  - Save scrolled away while editing;
  - the sheet opened at a size where its text was 2px;
  - a finger on a label dragged it;
  - a second finger on a line never pinched;
  - point entry was a 640px table;
  - 14px selects made iPhones zoom.
- **The audits** never measured oversize, and skipped Survey Studio, office, admin and shared pages.

## Decision

1. **Type is sized phone first** and steps up at `sm` and `lg` (`src/components/ui/titles.ts`):

   | Style | Phone | `sm` | `lg` |
   | --- | --- | --- | --- |
   | `PAGE_TITLE` | 24px | 28px | 32px |
   | `DISPLAY_TITLE` | 30px | 40px | 48px |
   | `PUBLIC_TITLE` | 32px | 44px | 56px |
   | `FOCUSED_TITLE` | 26px | 32px | |
   | `HERO_TITLE` (new, the home headline) | 36px | 56px | 83px |
   | `SECTION_TITLE` (new, a public page's section) | 26px | 36px | 44px |
   | `PART_TITLE` (new, a part of a public document) | 22px | 28px | |

   - `LEAD` is the sentence under a public title.
   - `CardTitle` is 17px with a 16px icon on a phone, 18px with 20px from `sm`.
   - Big figures, prices and proof seals step down on a phone.
   - The pricing and home heroes leave their exemption.
   - `tests/design/system.test.ts` checks every title style starts at 36px or less, the page title at 24px.

2. **The visible size and the touch area are separate,** as native apps do. ADR 0171's 48px target stays; the pill gets smaller.
   - Buttons are 40px (`sm`) and 44px (`md`); an icon alone is a 40px circle (`icon`).
   - On a touch screen, `.tap` in `globals.css` widens each to 48px with an invisible `::after`. It's in the components layer, so a caller's own `absolute` or `sticky` still wins.
   - Fields are 44px with 16px text on touch, so phones don't zoom, and 40px with 14px text with a mouse from `lg`. This amends ADR 0184's 48px field.
   - Segmented controls are 40px options with the same widening. Inside a sideways scroller, where a widened area would be clipped, they're 44px on touch.
   - One `mergeClasses` (`src/components/ui/merge.ts`) serves buttons and fields. A caller's plain class replaces the default of its kind and that kind's defaults for other screens, so the office's code fields keep their large text with a mouse. It never replaces a state's (hover, focus, disabled).

3. **Spacing is sized phone first** (`src/components/ui/surfaces.ts`).
   - `PAGE_STACK` puts 24px between sections, 32px on a large screen.
   - `BEZEL`, the double panel, is 26px corners and 6px padding on a phone and 28 and 8 from `sm`, concentric with the 20px card inside.
   - Cards pad 16px on a phone, marketing sections 56px. `EmptyState` and `Disclosure` step down too.
   - `system.test.ts` keeps hand-written stacks, bezels and unstepped section padding from coming back.

4. **Tablets get no rail.** A tablet is short of width, not height. A rail would cut 720px of content to 648px and push every full-width fixed bar.
   - The tab bar widens from `md`, with each icon beside its name.
   - `PageHeader` goes side by side from `md`.
   - The phone header gains a search button for the command palette, since touch has no Ctrl+K.
   - Every office and admin table (`AdminTable`) is a card per row on a phone, keeping its table roles.

5. **Survey Studio's editor works with fingers.**
   - **Pointers:** every pointer starts in one place, so a second finger pinches wherever it lands. The pinch zooms about the fingers and moves with them (`src/core/survey/sheet/view-math.ts`, tested).
   - **Labels:** a finger moves a label only once it's selected.
   - **Tap areas:** a 14px stroke under every line and a 22px dot over every point. Browsers hit-test a path's screen-sized stroke, not a circle's, so a point's dot is a round-capped path.
   - **Panning:** the drawing is memoised, so panning only moves the view.
   - **Opening:** on a narrow screen the sheet opens on the drawing.
   - **Full screen:** phones and tablets can draw full screen.
   - **Toolbar:** it stays in reach.
   - **Side panel:** it splits off by a container query when the editor has room.
   - **Leaving:** following a link with unsaved edits asks first.
   - **Assistant:** it steps aside while another field is typed in (`[data-hide-for-keyboard]:not(:focus-within)`).

6. **The audits measure proportion.** `scripts/qa/responsive-audit.mjs` adds:
   - landscape phones and touch iPads;
   - every route (`scripts/qa/routes.mjs`, shared with the accessibility audit);
   - overlays opened by script;
   - a tap probe that a widened area still reaches its control;
   - a proportion report on phones, with limits that follow the text size: titles, reading text, icons in controls, one-line controls over 48px, card and section padding, nested insets, pinned cover, words one per line.

   `--strict` fails on them. `scripts/qa/contact-sheet.mjs` lays screenshots side by side, so every route is looked at, not only measured.

## Consequences

- Phones show more of what a page is for: smaller titles, tighter cards, calmer controls. Desktops lose nothing: titles and spacing reach their earlier sizes from `sm` and `lg`, and a mouse gets 40px fields.
- A touch target is still 48px where it's a button. The tap probe and the small-target check guard it, since a widened area that's clipped or covered is invisible in a screenshot.
- `.tap` makes every button `position: relative` on touch. Absolutely placed children of a button now place themselves against it, which is what they meant.
- The trust map keeps its sideways scroll on a phone (ADR 0132, ADR 0146): its nodes stay 44px targets, and the lists beside it say the same in words.
- A real phone remains the only test of iPhone zoom, the keyboard and notches. These stay on the owner's short phone check.

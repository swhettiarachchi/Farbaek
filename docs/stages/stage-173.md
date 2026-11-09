# Stage 173: Finish the system

- **Branch:** `feat/finish-system`, from `feat/premium-system` (#219).
- **ADR:** 0184. No migration.
- **Skills:** `farbaek-ui`, `farbaek-office` and `mobile-app-ui-design`.

## What the owner asked

"Continue building", after stage 172 had listed what it left. The goal stays the same: Farbaek should look like one premium system everywhere, with nothing that reads as generic, unfinished or generated.

## How it was done

- **Foundation, by the lead:** the shared field style, three named type steps, the four title styles, and the guard test.
- **Migration, by three agents in parallel:** one moved the fields in pages and the app's own components, one moved the fields in every other component, and one put section-title icons on the desktop and iPhone apps.
- **Films:** the films were re-recorded, so they show the new chips.
- **Checks:** the lead ran every check, one at a time.

## Found and fixed

**Fields.**
- About 300 text fields, selects and text areas had used a dozen hand-written styles, and most drew their edge at 1.2:1, too faint for a control. Every one now uses `inputClasses()` or `textareaClasses()`:
  - an edge that reaches 3:1;
  - 16px text;
  - a 48px target;
  - the accent edge and a soft ring on focus;
  - the failed colour when a field is in error;
  - a quieter look when disabled.
- Labels above fields share one style.
- A caller's own width, height, padding or size replaces the default of the same kind, so a select inside a sentence stays inline.
- Buttons beside a field now match its height.

**Type.**
- The theme names the three sizes the product uses most: 13px labels, 15px reading text and 17px item titles. 378 hand-written sizes became those names, with no change on screen.
- The half steps, such as 12.5px, 13.5px and 14.5px, folded into the nearest step.

**Titles.**
- Page titles had come in four sizes in the app and five on the public site. Every h1 now uses one of four styles:
  - app pages;
  - "What do you want to build?";
  - public pages that make a statement;
  - pages that do one job, such as sign-in.
- That includes the staff console's own pages and the phone sign-in handoff.

**Notices.** The last tinted notices (a task's checks, the second check's advice, the test space session, skills waiting for review) sit on the neutral surface. `Notice` has an error tone, and the staff console's "couldn't be read" notices use it.

**Desktop and iPhone.** Section titles carry their icon on both apps, as on the web, with the same icon for the same concept. The iPhone's You screen headers are labelled with icons.

**Films.** The proof film's caption and chapter now say what its studio shows ("The real results decide", "Before publishing"), and all six films were re-recorded with the new chips.

### From the independent review

A fresh review read the whole diff and found the Swift and the desktop changes clean. It found these, all fixed:

- **The shared field hid its focus outline.** High Contrast mode drops the ring and the border colour that replace it, so fields showed no focus at all there. The outline is now hidden, not removed, which High Contrast still paints.
- **A test space session's long name wrapped** over two or three lines instead of ending in an ellipsis, because the title style balances text. It stays on one line now.
- **A few page titles still had their own sizes:** the phone sign-in handoff, "not found" pages, the staff sign-in and add-device pages. They now use the shared styles, and the guard test checks every h1 apart from the home and pricing heroes.
- **Typed text took the label's medium weight** where a label wraps its field. Fields now set their own weight.
- **Short text areas grew taller** than their row count. The minimum is lower, so the rows decide.
- **Code chips beside word chips sat at different heights.** They now share a line height.

## Checked

| Check | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint` | Pass |
| `pnpm test` | 390 files and 2,861 tests pass, with the new system guard and the field helper's tests |
| `pnpm qa:responsive` on the demo build | 550 page views, no findings |
| `pnpm qa:a11y` | 96 page views, no findings |
| `pnpm films:record` and `pnpm films:loops` | All six films, posters and loops re-recorded. The build film's portrait version was re-recorded at CRF 23 to fit its 8 MB budget. The film tests pass |

- The desktop renderer bundles with esbuild.
- Settings was looked at at 375 px: the fields have a clear edge and a full-height target.

## Not done, and why

- **The iPhone app still isn't compiled by CI.** GitHub refuses the job until the Actions billing is sorted. The Swift was read line by line by its author and the reviewer.
- **Large display headings in marketing sections** (the hero, pricing, and section headlines) keep their own sizes, as designed display type.
- **A handful of result callouts keep a tint:** a failed or verified result card, and the approval callout. The decision record allows that, because the tint marks the one thing on the screen that needs reading first.

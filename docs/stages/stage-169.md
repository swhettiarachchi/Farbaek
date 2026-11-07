# Stage 169: The whole platform, walked and fixed

- **Branch:** `feat/audit`, from `feat/human-made` (stage 168), so the audit holds the human-made standard from the start.
- **Skills:** `farbaek-human-made` and `farbaek-ui` as the bar; `ui-ux-pro-max` for the rules on touch, forms, feedback and navigation; `premium-app-ui` for what premium means on a phone; `built-in-browser` for the walk; `code-review` on the fixes.

## What the owner asked

A comprehensive audit of the entire platform: every page, feature, setting and option inspected, tested and verified; every inconsistency, flaw, broken feature and incomplete implementation fixed; the result a user-friendly, enterprise-grade product where everything works together. And to keep going until it does.

## The plan

Random looking finds random things. This audit is built so nothing is skipped, and so that what it finds is fixed rather than listed:

1. **Every route, mechanically.** A production build of the demo workspace, then `pnpm qa:responsive` (every route at 320 to 1440 px: sideways scroll, cut-off content, small targets, console errors) and `pnpm qa:a11y` (nameless controls, alt text, headings, landmarks, hidden focusables, visible focus). The reports are the first list of defects.
2. **Every route, as a person.** The demo workspace at 375 px and 1280 px in the built-in browser, one route at a time, with one question per screen: what is this page for, what would I do first, and is anything confusing, technical, broken or AI-looking. Each route's answer goes into the table below.
3. **Every feature, end to end.** On production, signed in as the owner: build, approve, check, publish, undo, trial, second opinion, workflows, test space, desktop pairing, moving a project, skills, billing, settings, help. Each either works, is visibly unavailable with an honest reason, or is a defect.
4. **The code, by fresh eyes.** Independent reviewers on the areas the walk can't reach: server actions and their messages, the phone API, the office console, the desktop renderer.
5. **Fix, test, commit, in that order,** one group at a time, with the design guards and the full suite after each.

## Routes walked

| Route | What it's for | First action clear? | Found | Fixed |
| --- | --- | --- | --- | --- |

(Filled in as the walk goes.)

## Found and fixed

(Filled in as the work goes.)

## Not checked, and why

(Filled in at the end.)

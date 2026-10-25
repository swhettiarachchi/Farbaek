# Stage 63: Impact analysis

The plan catalog's "Impact analysis" (Max 2x and up), which was marked coming.

- **Decision record:** `docs/adr/0085-impact-analysis.md`.
- **Branch:** `feat/plan-features`, with stage 62.

## 2026-10-25

### Done

- `src/core/realityloop/impact.ts`:
  - imports read from JavaScript and TypeScript (all literal forms, comments removed) and from HTML script and stylesheet tags;
  - resolution: relative, extensions, `index`, tsconfig or jsconfig aliases, or `@/` assumed to mean `src/` and said so; packages ignored;
  - a walk back up to three steps, with "via";
  - pages, tests, and changed scripts no test reaches.
- `analyzeImpactAction`:
  - Max 2x and up on the server, and the demo as a sample;
  - reads the project as the person within limits, with the change's edits laid over;
  - says when it was cut short.
- `ImpactCard` on the task page under the change's review:
  - "Show what this change reaches";
  - a summary sentence, then groups with icons and words: "Imported by", "Further away", "Pages it reaches", "Tests that reach it", and "Not reached by any test" as a warning;
  - how it was found and what it can't follow.
- `FEATURE_STATUS.impact_analysis` is now live.

### Verified

- `impact.test.ts` (8):
  - every import form, with commented and computed ones skipped;
  - HTML references, with other sites skipped;
  - resolution, including `.js` imports of `.ts` files, JSON, packages and escaping the root;
  - tsconfig aliases with comments and trailing commas, and the assumption;
  - pages;
  - the demo case: a change to `src/lib/cart.ts` reaches `product-card.tsx` and `cart.test.ts` directly, and `src/app/page.tsx` through the card, with the test covering it;
  - the depth limit and "not reached by any test";
  - a static site's page reached through its script and stylesheet.
- **Demo build at 1280 and 375,** pressing the button on the sample change:
  - the summary sentence "1 file imports what this change touches, and 1 more file reaches it through them. 1 page is affected. 1 test reaches it.";
  - the groups, the sample label, and the note on the assumed alias;
  - only one direct importer, because the sample change edits `cart.test.ts` too, which then counts as changed, not as an importer;
  - no console errors, no sideways scroll.
- `pnpm qa:a11y` on the task page and Help: 0 findings.
- `pnpm typecheck` and lint are clean.

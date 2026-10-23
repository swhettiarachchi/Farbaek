# Stage 22: Natural type

The owner saw small text across the platform that read as "AI-looking", and asked for a natural, modern look. This stage retires the patterns behind it:
- code-comment labels;
- mono used for words;
- middot chains;
- tiny type;
- team vocabulary in the interface.

A test stops them from coming back.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0049-natural-type.md`, amending ADR 0008.
- **Branch:** `feat/natural-type`, from `feat/security-evals` (#28), so the new `/security` page follows the same rules.

## 2026-10-23

### Done

**The guard:** `tests/design/type-tells.test.ts` scans every `.tsx` in `src/app` and `src/components` and fails on:
- `//` labels;
- type under 11px, or 11px outside the tab bars and badges;
- two or more middots on a line;
- tracked-capital eyebrows.

The film stage is exempt from the size rule only, because it's recorded at two or more device pixels per CSS pixel. The showcase mockups are exempt entirely.

**44 `//` labels removed or rewritten:**
- **Overlines above page titles are gone:**
  - sign-in;
  - invitation;
  - 404 (its headline now says "We can't find that page.");
  - `/verify` and `/security`;
  - new build;
  - office sign-in and office 404.
- **Field and section labels** became sentence-case Geist:
  - "Approval window" and "Proposal hash";
  - "Farbaek Agent";
  - "Launch plan";
  - "Your plan, version 1" with its hash in mono;
  - "Template";
  - "Matching file names";
  - "Canonical payload (RFC 8785)";
  - "Contact";
  - the showroom's "Palette", "Type", "Signature" and "Skills it would use";
  - "What can be checked" and "Workspace Capsule";
  - "Console" and "Files".
- **The command palettes' group headers** are plain words ("Go to", "Workspaces").
- **The chrome subtitles** read "Admin console" and "Office Space".

**Mono kept for data only:**
- **Lifecycle statuses** are sentences ("Awaiting approval", "In progress").
- **Other labels:**
  - "Version 1" instead of "contract v1";
  - "Grade A";
  - "You" on run messages;
  - "Rules", followed by the hash.
- **Acceptance checks** read "(by a test)".
- **Lists:**
  - step numbers are Geist (`1.`, not `01`);
  - the homepage's policy outcomes are words ("Require approval") instead of constants;
  - the lifecycle is a stepped list with caret icons instead of an arrow string.
- **Dashboard and KPI numbers** in the admin console and Office Space use Geist with tabular figures.

**Meta lines rewritten as phrases:**
- the file header ("Python, 2 KB. Revision 3, updated …" with the hash on its own);
- task history ("By the agent, 23 Oct …", with the event name in a tooltip);
- runs ("Storefront, balanced effort. Started …");
- published versions;
- security reports;
- ProofPack and recovery records;
- the file editor;
- proposals;
- the audit log;
- the support list;
- the film notes ("44 seconds, 6 chapters. Silent, with captions.").

**Run steps:**
- **Tool names became verbs** (`EventRow`, shared by the run page and the films):
  - "Edited styles.css";
  - "Searched for “cart”";
  - "Ran pnpm test";
  - "Reviewed the site";
  - "Finished: Ready for your review".
- **The tool's own name** stays in the tooltip.
- **Paths and commands** stay mono.

**Sizes:** chips, table headers, thumbnails and DNS labels went up to 12px, and count badges went up to 11px.

**Roadmap:** "Stage 6" and "Stage 7" became "Planned" under "Coming later", in the sidebar and on More.

**Docs:**
- ADR 0049;
- an ADR 0008 note;
- the `CLAUDE.md` design rules;
- the `farbaek-ui` skill.

### Verified

- **`type-tells.test.ts`:** 4 tests pass. It listed 48 files when first written.
- **The full suite:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,275 passed, 14 skipped. The contrast tests are unchanged.
- **In the browser,** on a demo production build:
  - **The task page:**
    - no `//` labels or middot chains anywhere on it (checked in the DOM);
    - the lifecycle reads "Done" and "In progress";
    - the contract shows "Version 1" and "(by a test)";
    - the sidebar shows "Coming later" with "Planned" chips.
  - **The homepage:**
    - the modules section shows the policy outcomes as words;
    - the lifecycle is a stepped list;
    - the film notes read "54 seconds, 6 chapters. Silent, with captions."
  - **At 375px,** `/security` (labels "Last run", "Result", "Tests", "Commit") and the 404 ("We can't find that page.") fit with no sideways scroll.
  - **The command palette** shows "Build" and "Go to" as plain group headers.
- **The films:** still frames of the build film show "Step 10, balanced effort", "You", the verb steps and the sample label in Geist before re-recording.

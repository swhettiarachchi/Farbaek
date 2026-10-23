# ADR 0049: Natural type for small text

- Status: accepted (2026-10-23). Amends ADR 0008 (White Signal), which listed `//` labels as part of Geist Mono's job.
- Asked for by the owner: small text across the platform read as "AI-looking", and the platform should look natural and modern.

## Context

White Signal's large type works: Geist, weight 500, tight tracking, one accent. The small text had collected the patterns that make generated interfaces recognisable:
- **Code-comment eyebrows** (`// verify`, `// office space`, `// your plan · v1 · 3f2a…`): 44 of them in 30 files, above titles, on card fields and on palette groups.
- **Mono for words:**
  - lifecycle statuses ("verified", "awaiting approval");
  - "grade A", "contract v1" and "rules 3f2a…";
  - "you" on run messages;
  - lowercase `dl` labels;
  - step numbers (`01`);
  - homepage pills in constant case (`REQUIRE_APPROVAL`);
  - a lifecycle line with arrows.
- **Middot chains:** for example, `Python · 2 KB · revision 3 · updated … · 3f2a…`, and `Agent · grant_approval · 23 Oct`.
- **Tiny type:** 10–11.5px labels, chips and table headers.
- **Team vocabulary in the interface:** "Stage 6" and "Stage 7" chips on planned features.

## Decision

| Element | Now |
| --- | --- |
| Overline above a page title | None: the title stands alone. One small element at most in a hero (the homepage's "Now open" pill). |
| Field or section label | Sentence-case Geist, 13px, medium, `ink-3` |
| Group header in a list or palette | Geist, 12px, medium, `ink-3` |
| Status words | Sentences ("Awaiting approval"), with their icon kept |
| Meta lines | Short phrases, or items in a flex row with a gap; at most one `·` per line |
| Mono | Data only: hashes, paths, commands, code, IDs, model IDs, keys, timecodes |
| Size floor | 12px. Tab-bar labels and count badges keep 11px, as on phones. |
| Planned features | "Planned", not "Stage N" |
| Dashboard numbers | Geist with tabular figures, not mono |

**The guard is `tests/design/type-tells.test.ts`.** It scans `src/app` and `src/components` and fails on:
- `//` labels in JSX;
- type under 11px, or 11px outside the tab bars;
- two or more middots on a line;
- tracked-capital eyebrows.

**Exemptions:**
- The film stage's sizes are canvas units recorded at two or more device pixels per CSS pixel, so it's exempt from the size rule only.
- The showcase mockups draw other sites' designs, so they're exempt entirely.

## Consequences

- **The same information reads as product copy** instead of developer annotations. Hashes, paths and commands stay mono, so they still look like what they are.
- **Mono-for-words can't be scanned for,** so it's left to review and the design guide (`.claude/skills/farbaek-ui/SKILL.md`, `CLAUDE.md`).
- **The product films are recordings of the interface.** They're re-recorded so they show the new labels.

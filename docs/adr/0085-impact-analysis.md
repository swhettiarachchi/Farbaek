# ADR 0085: Impact analysis

- Status: accepted (2026-10-25).
- Builds on ADR 0041 (the Intent Diff Lens) and the proposal review.

## Context

A reviewer sees a change's diff, how it maps to the contract and what the policy decided. What they can't see is what else depends on the files it touches: which components import a changed module, which pages that reaches, and whether any test covers it. The plan catalog sells "Impact analysis" on Max 2x and up, marked coming.

## Decision

**Read imports, never run anything.** `src/core/realityloop/impact.ts` reads two kinds of reference:
- literal imports in JavaScript and TypeScript files: `import`, `export … from`, `import()` and `require()`, with comments removed;
- script and stylesheet tags in HTML pages.

It resolves them inside the project:
- relative paths, extensions and `index` files;
- aliases from `tsconfig.json` or `jsconfig.json`; with none set, `@/` is read as `src/`, and the result says so;
- packages and other sites are outside the project and are ignored.

From the changed files it walks back up to three steps. A changed file is "tested" when a test imports it within the same number of steps. The result has:
- the files that import them directly;
- those further away, each with the file it came through;
- the pages reached: Next pages and layouts, `pages/` except `api/`, and HTML files;
- the tests that reach them;
- the changed scripts no test reaches.

**Asked for, on the review.**
- "Show what this change reaches" runs `analyzeImpactAction`, with the change's own edits laid over the project's files so new imports count.
- It reads, as the person, only what they can already see: script, HTML and config contents, within 3,000 files and 20 MB. Every other file counts as existing.
- When the limits cut it short, it says there may be more.
- It changes nothing and costs no AI usage.

**Said plainly.** The card names how it found what it shows ("reading import statements … up to three steps away"), how many files it read, the alias it used, and what it can't follow: imports built at run time, and other languages.

**Plans.** Max 2x and up, checked on the server. The demo runs it on its sample files, labelled "Sample: included in Max 2x and up".

## Consequences

- Reviewers see a change's reach before approving, and which changed code no test covers.
- It's a static reading, not a call graph: code that loads modules by computed names, or behaviour across languages, isn't covered, and the card says so.
- The same reading can later feed the policy (for example, holding changes no test reaches) and the Replay Theatre.

# Stage 100: The Why-Graph for a file

The last of the three developer-intelligence views from the spec audit (spec §10).

- **Decision record:** `docs/adr/0123-why-graph.md`.
- **Branch:** `feat/why-graph` (from `feat/insights`, PR #128).

## 2026-10-30

### Done

- **`src/core/insights/why-graph.ts`:**
  - facts from records with their sources;
  - doc mentions confirmed by path or inferred by file name;
  - edits with no recorded reason counted, never explained.
- **`listFileChanges`:** applied changes that wrote a file, with each change's reason for it, read as the person.
- **`src/server/insights/why-graph.ts`:** brings in task titles, contract outcomes, docs, and tests found by the impact analysis, within a 3 MB text budget.
- **The Files page:** a file's History opens with **Why this file is like this**.

### Verified

- `src/core/insights/why-graph.test.ts` (6):
  - confirmed and inferred doc mentions;
  - short and common names skipped;
  - a longer path isn't a match;
  - facts in order with their sources;
  - unexplained edits counted;
  - created versus imported.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`: 2,226 passed.
- **Demo build at 375px,** History of `src/lib/cart.ts`: its origin (revision 1, imported) and `src/lib/cart.test.ts` reaching it through imports, each with a linked source; no sideways scroll.

# Stage 106: The component editor

Visual editing for apps with a build step (Next.js, React): a component's JSX as an outline, with its words and Tailwind classes editable, reviewed as a diff and saved as revisions.

- **Decision record:** `docs/adr/0129-component-editor.md`.
- **Branch:** `feat/component-editor` (from `feat/agent-teams`, PR #134).
- **No migration.**

## 2026-10-30

### Done

- **`src/core/studio/jsx-edit.ts`:**
  - `scanJsx` (the TSX parser from `@codemirror/lang-javascript`; refuses syntax errors and files over 300 KB);
  - `setJsxText` (entities for JSX's special characters);
  - `setJsxClasses` (the string's contents, or a new attribute on a built-in tag);
  - the Tailwind groups (`classGroup`, `withClassGroup`);
  - `isTailwindProject`, `componentFiles`.
- **`src/components/studio/component-editor.tsx`:**
  - the component select and element outline;
  - the inspector (words, style selects for Tailwind projects, classes);
  - undo, Review and Save, the same flow as the static editor.
- **The design page** shows the component editor for apps with a build step. The project page has **Edit components** for them.

### Verified

- `src/core/studio/jsx-edit.test.ts` (9):
  - scanning a Next.js page (nesting, text-only elements, string versus code `className`, components, fragments, self-closing tags, comments and template strings left alone, exact ranges);
  - words with entities, and refusals;
  - classes replaced and added, and code, components and bad tokens refused;
  - Tailwind groups keep variants and order;
  - every edited file re-parses with no errors, and the bytes outside the edit are unchanged;
  - Tailwind detection and the component list.
- `pnpm typecheck`, lint on the changed files.
- Full `pnpm test` (2,314 passing).
- **A demo build at 375px:**
  - the Next.js sample project lists `src/app/page.tsx` and `src/components/product-card.tsx`;
  - its outline is right;
  - changing the `<h1>`'s words and classes builds a draft, and the review shows only that line changing;
  - Save is unavailable with the demo's reason;
  - the project page shows **Edit components**;
  - no sideways scroll.

### Not verified

- **The Tailwind style controls in a browser:** the demo's projects don't declare Tailwind, so only the class field showed. The controls' logic is covered by the core tests.
- **The static editor in a browser:** no demo project is a static site. Its code path is unchanged.

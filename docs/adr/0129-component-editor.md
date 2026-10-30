# ADR 0129: The component editor for apps with a build step

- Status: accepted (2026-10-30).
- From master spec §6 ("A visual edit becomes a maintainable code change"; "Every visual edit maps to a reviewable diff") and the owner's list ("visual editing for apps with a build step, such as Next.js or React"). Extends ADR 0118, which covered static sites only and refused to fake click-to-source for built apps.

## Decision

**Edit the components themselves.**
- On a project with a build step, the design page becomes the **component editor**. It lists the app's `.tsx` and `.jsx` files (pages and layouts first, never tests, stories or `node_modules`), and shows the chosen file's JSX as an outline of its elements, in source order and indented by depth.
- **The parser:** the file is read with the TSX parser Farbaek already ships for its code editor (`tsxLanguage` from `@codemirror/lang-javascript`), so nothing new is installed.
- **Refused files:** a file over 300 KB, or one with a syntax error, isn't offered, so an edit never lands in broken source.

**What an edit can change:**

| Edit | Where it goes |
| --- | --- |
| An element's words, when all its children are text | Just those characters. `& < > { }` are written as entities, so JSX reads them as text. One line, 1 to 500 characters |
| An element's classes, when its `className` is a plain string | Inside that string |
| Classes on a built-in element (`div`, `h1`) that has none | A new `className="…"` after its tag name |
| Text size, weight, alignment, padding, margin, corners (Tailwind projects) | That one class in the list, replaced in place. Variants like `sm:` and every other class stay as written |

**Left to the code editor, with the reason shown:**
- words mixed with `{values}` or other elements;
- a `className` written as code (`className={cn(…)}`);
- styles on a component, which are set in its own file.

**Checks on classes:** only plain tokens (letters, numbers and `- _ : / . [ ] # % ( ) !`), at most 60. Quotes, backslashes and braces are refused, so a class can't escape its string.

**Tailwind:** the style controls appear when the project uses Tailwind (`tailwindcss` in `package.json`, a Tailwind config, or Tailwind's import in CSS). Colours stay in the free class field, since every project names its own.

**Review and save are the static editor's** (ADR 0118):
- a draft with undo;
- **Review** in the same diff view, with accept or reject for each change;
- **Save** through `saveFileAction`, with its role, path, size, secret and revision checks;
- each file becomes a new revision.

The demo, viewers and archived projects can use the editor; saving says why it isn't possible.

**No click-to-pick:** a built app runs in a sandbox preview on another origin. Mapping a click to JSX would need source maps from a running build, which Farbaek doesn't fake. The editor says changes show after the app rebuilds, and links to the project page's live preview.

## Consequences

- People can change the words and look of a Next.js or React app without reading JSX, and still see exactly what changed in the source.
- The code editor, the component editor and the agent all work on the same files.

## Not done

- **Picking an element in the running app.**
- **Props, images and links on components.**
- **Creating or moving elements.**

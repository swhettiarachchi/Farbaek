# ADR 0184: One field, named type steps, four titles

- **Status:** accepted
- **Date:** 2026-11-08
- **Stage:** 173
- **Extends:** ADR 0183 (Obsidian and steel) and ADR 0008 (White Signal).

## Context

Stage 172 put status, colour and icons on one system. The colour audit behind it also found the rest of the interface drawn by hand in many slightly different ways:

- **Fields:** about 300 text fields, selects and text areas used a dozen local class strings. Most drew their edge in the quiet `line` colour at 1.2:1 against the page, which fails the 3:1 a control's edge needs (WCAG 1.4.11). Heights, paddings, backgrounds and focus treatments varied from form to form.
- **Type:** text came in 46 arbitrary sizes, including half steps (12.5px, 14.5px, 13.5px) that nobody would choose on purpose.
- **Titles:** page titles came in four sizes in the app and five on the public site.
- **Apps:** section titles on the desktop and iPhone apps had no icons, while the web's now do.

## Decision

1. **One field.** `inputClasses()` and `textareaClasses()` (`src/components/ui/field.ts`) give every text field, select and text area the same look:
   - an edge in `line-strong` (3.9:1 against white);
   - 16px text, so phones don't zoom;
   - 48px tall, a full touch target;
   - the accent edge and a soft ring on focus;
   - the failed colour when `aria-invalid` is set;
   - a raised, quieter look when disabled.

   Labels above a field use `LABEL_CLASSES`. Checkboxes, radios, sliders, file pickers, the colour pickers and fields inside dark media panels keep their own look.
2. **Named type steps.** The theme adds three sizes that sit between Tailwind's own: `text-label` (13px, labels and meta), `text-body` (15px, reading text) and `text-title-4` (17px, item titles). They carry no line height of their own, so they keep the one around them. Every exact arbitrary size became its name, and the half steps folded into the nearest step. The film studio, which is drawn at fixed pixel sizes, is exempt.
3. **Four titles.** Every h1 uses one of the four styles in `src/components/ui/titles.ts`:

   | Style | Used for |
   | --- | --- |
   | `PAGE_TITLE` | App pages, through `PageHeader` |
   | `DISPLAY_TITLE` | "What do you want to build?" |
   | `PUBLIC_TITLE` | Public pages that make a statement |
   | `FOCUSED_TITLE` | Public pages that do one job, such as sign-in |

   The home page hero and the pricing hero stay their own.
4. **Section titles on every platform.** The desktop app's section headings and the iPhone's `SectionTitle` carry an icon like the web's `CardTitle`, with the same icon for the same concept.

## Consequences

- A field can't fall below the contrast a control needs, and every form looks and behaves the same.
- `tests/design/system.test.ts` fails on a local field class string, and on an arbitrary text size that has a name. That keeps new code on the system.

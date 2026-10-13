# 0007. Brand accent taken from the logo

- Status: superseded by 0008 (White Signal) on 2026-10-13
- Date: 2026-10-13

## Context

The spec's default accent is "ink indigo" (#3F3BD1) with a cyan secondary, and it says the supplied logo wins if they conflict. The logo is a black-armoured knight with gold trim. Measured over its opaque gold pixels (`sharp`, 19,178 pixels), the trim averages **#D5A76E**.

## Decision

- Replace indigo with gold everywhere: the Proof Thread, the Seal, focus rings and highlights. No second accent and no gradient.
- Primary buttons use obsidian ink (light theme) or porcelain (dark theme), echoing the armour, so gold never has to carry text.
- Tokens per theme:

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--gold` | #a87b3d | #d5a76e | Graphics: thread, focus ring, seal (at least 3:1) |
| `--gold-ink` | #7a5622 | #ddb57e | Gold text (at least 4.5:1) |
| `--line-strong` | #84847d | #6a6d76 | Input borders (at least 3:1) |

- The light canvas is a neutral porcelain (#f6f6f3) instead of a warm cream, so the page doesn't read as the generic beige-and-brass template.
- `tests/design/contrast.test.ts` parses the token file and fails the build if any pair drops below WCAG 2.2 AA. It caught one real failure during this session: `--line-strong` was #8a8a83, which gave less than 3:1 on the sunken surface.

## Logo handling

The artwork is never recoloured, cropped or redrawn. On dark surfaces it sits on a lit "plate" (a radial gradient from `--plate-center` to `--plate-edge`) so the black armour stays visible.

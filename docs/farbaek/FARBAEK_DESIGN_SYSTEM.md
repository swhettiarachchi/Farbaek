# Farbaek design system

What the interface is made of, as it stands in the code on 2026-11-22 (stage 211). The rules for building with it are in `CLAUDE.md` and the `farbaek-ui` and `farbaek-human-made` skills; the reasons are in the ADRs named here. This page is the map.

**Rule for this file:** every value here is read from the code. When a token changes, change it here in the same commit.

## Two looks

| | Crystal White (light) | Dark |
| --- | --- | --- |
| **When** | The default, for everyone who hasn't chosen | The person's choice, or Auto on a dark device |
| **Where** | Every page | Every page: the public site (ADR 0232), every signed-in page, the staff console and admin |
| **Values** | `src/styles/tokens.css` | `src/styles/theme-dark.css` |
| **Tested by** | `tests/design/contrast.test.ts` | `tests/design/dark-theme.test.ts` |
| **Decision** | ADR 0008 | ADR 0227 |

The choice is one control, `ThemeChoice` (Light, Dark, Auto), in Settings and in Chat's settings. It is kept in a cookie, `fb_theme`, for a year. The server reads it and marks the page (`ThemeMark`), so the first paint is right and no script runs.

Dark is a design of its own: charcoal instead of black, surfaces that get lighter as they rise, hairlines instead of shadows, soft white text, a lighter accent.

## Colour

Colour comes from tokens only. Each token has a value in both looks; the media frames are dark in both.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` | `#fbfbfc` | `#0f1013` | The page |
| `canvas-2` | `#f5f6f8` | `#131418` | Sidebars, stages, tracks |
| `surface` | `#ffffff` | `#17191e` | Cards, inputs, sheets |
| `surface-raised` | `#f2f4f7` | `#1e2127` | Hover, chips, raised parts of a card |
| `surface-sunken` | `#eceff3` | `#0b0c0f` | Wells, code beside text |
| `line` | `#e4e7ec` | `#262a31` | Hairlines |
| `line-2` | `#d0d5dd` | `#343943` | Stronger dividers |
| `line-strong` | `#7d828c` | `#7b818c` | A control's edge (3:1) |
| `ink` | `#121317` | `#eceef2` | Text |
| `ink-2` | `#474c56` | `#b9bec8` | Secondary text |
| `ink-3` | `#636975` | `#9198a4` | Labels and meta |
| `accent` | `#2450f0` | `#8aa4ff` | Signal blue: links, focus, your turn |
| `accent-strong` | `#1e43d0` | `#a9bcff` | The accent, pressed or hovered |
| `accent-2` | `#0a6e85` | `#5fd3e8` | Signal cyan: aurora, orbit, syntax tint only |
| `on-accent` | `#ffffff` | `#0b0c10` | Text on the accent |
| `primary` | `#121317` | `#eceef2` | The main button |
| `primary-hover` | `#23252b` | `#ffffff` | The main button, hovered |
| `on-primary` | `#fbfbfc` | `#0f1013` | Text on the main button |
| `seal` | `#5a616e` | `#a3a9b4` | The Seal's lines |

**Status** (ADR 0183), always with its words and icon through `StatusBadge`:

| Token | Light | Dark | Means |
| --- | --- | --- | --- |
| `verified` | `#0b6e4f` | `#4fd18b` | Checked and true |
| `approval` | `#2450f0` | `#8aa4ff` | Your turn (the accent) |
| `caution` | `#b04508` | `#ff9466` | A real warning |
| `failed` | `#b3243b` | `#ff7a8c` | Failed |
| `info` | `#3d5572` | `#a8b9d1` | Information, work in progress |
| `unverified` | `#5f636b` | `#a0a5ae` | Not checked |
| `simulated` | `#4b5160` | `#a9aeb8` | A sample |

**The spectrum** (ADR 0217), for a space's identity and for light behind product windows, never for status:

| Token | Light | Dark | Space |
| --- | --- | --- | --- |
| `spark-rose` | `#c81e5b` | `#ff8fb3` | Images |
| `spark-aqua` | `#0b7285` | `#5fd0e0` | Video |
| `spark-leaf` | `#0b7a4b` | `#5fd39b` | Build |
| `spark-ember` | `#b93d0b` | `#ff9d7a` | Playful marks |

**Media frames** (the evidence terminal, sandbox output), the same in both looks: `media` `#0b0c10` with `media-ink` `#f2f3f5`, `media-ink-2` `#a3a9b4`, `media-ink-3` `#7f8590`, `media-accent` `#7f9cff`, `media-cyan` `#5fd3e8`, `media-green` `#4ade80`, `media-caution` `#ff9466`, `media-red` `#ff6b81`.

No gold, amber or purple in either look. Both tests check every value's hue.

## Contrast

Both looks are held to WCAG 2.2 AA by test: text 4.5:1 on every background (17 text colours on 5 backgrounds), control edges and graphics 3:1, and both buttons' labels 4.5:1.

## Depth

| Level | Use | Light | Dark |
| --- | --- | --- | --- |
| `shadow-e1` | Cards | Two soft ink-tinted shadows | A short shadow and a 4% white hairline |
| `shadow-e2` | Raised panels, menus | A 28 px soft shadow and a 5% ink hairline | A deeper shadow and a 6% white hairline |
| `shadow-e3` | Dialogs | A 64 px soft shadow and a 6% ink hairline | The deepest shadow and an 8% white hairline |

No CSS filters (ADR 0055). Soft light is drawn with gradients.

## Shape

| Element | Radius |
| --- | --- |
| Buttons, chips, segmented controls | Pill |
| Inputs | 12 px (`rounded-sm`) |
| Cards | 20 px (`rounded-md`) |
| Large panels and media frames | 28 px (`rounded-lg`) |

## Type

Geist for the interface and headings (weight 500, tight tracking). Geist Mono for code and data people copy: hashes, paths, commands, IDs, keys. No serif. Sizes are in rem, so a device's text size reaches them (ADR 0171). Named steps between Tailwind's own: `text-label` 13 px, `text-body` 15 px, `text-title-4` 17 px. Nothing under 12 px except tab labels and count badges (11 px).

## Sizes

Phone first (ADR 0211). Buttons are 40 px or 44 px, or a 40 px icon circle, each with a 48 px touch area. Fields are 44 px with 16 px text on touch, 40 px and 14 px with a mouse on a large screen. No page scrolls sideways at 375 px.

## Motion

Only for live state, hierarchy, storytelling or feedback (ADR 0172). Feedback 100 ms, a change of view 240 ms, exits 160 ms, a rare moment 420 ms. Only `transform` and `opacity` move. Everything is still under reduced motion.

## Icons

Phosphor on the web and desktop, SF Symbols on the iPhone (ADR 0183). Filled icons report a state, outlined icons name a thing or an action. An icon names what a control does: no sparkles, robots, wands or brains (ADR 0153).

## The logo

The black cat (ADR 0226), `public/brand/farbaek-logo-v2.webp`, through `BrandLogo`. Transparent round the cat; never recoloured or inverted. On a dark page it sits on its own white paper, through one value, `--logo-paper`. App icons and tab icons keep the white.

## Pieces that keep one look

- `data-theme="dark"` on an element shows that piece dark on any page (the picture of Chat at night on the public Chat page).
- `data-theme="light"` keeps a piece light on a dark page.
- Previews of people's own sites are theirs: they are frames with their own colours, and this setting never reaches into them.

## Checking a screen

1. `pnpm qa:responsive --theme=dark --widths=390,1280 --shots=<folder> --shot=viewport --routes=<the pages>`
2. `node scripts/qa/contact-sheet.mjs --shots=<folder>`, and look at the sheets.
3. The same without `--theme` for the light look.
4. `pnpm test`: the two contrast tests, and the tests for tokens, type, icons and filters.

## The frame

Every signed-in page sits in one frame (ADR 0230), used by the app's frame, Chat, the studios and Build's workspace. Since 2026-11-23 it is full screen, at the owner's request: no stage, gap or coloured light round it.

- **Wide screens (1024 px and up):** full screen. The sidebar on the left, 280 px wide; the page scrolls beside it.
- **Phones and small tablets:** the page fills the screen and scrolls itself, with a header at the top and five tabs at the bottom: Home, Chat, Build, Approvals, More.
- **The sidebar's first list:** Home, Chat, Images, Video, Build, Projects, Approvals. The four spaces carry their colours. Everything else is under More tools, then the account pages.
- **The main screen** (ADR 0228) is a greeting and one box that asks or builds, then what needs the person.

## Not yet

- Pages outside the public site's layout that no server marks (shared links, the device page, the desktop app's connect page, the page for an address that doesn't exist) in Dark.
- The iPhone app and the desktop app in Dark.
- One sidebar across Chat, the studios, Build's workspace and the app's pages. ("Build" starts in one place since stage 286, ADR 0294.)

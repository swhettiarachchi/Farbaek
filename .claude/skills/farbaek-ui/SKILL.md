---
name: farbaek-ui
description: Farbaek's design system and UI patterns (White Signal, ADR 0008), with its rules for 3D and motion. Use this whenever you build or change anything people see in the Farbaek repo, such as pages under src/app, components under src/components, styles, copy, motion or 3D, so the work matches the rest of the product and passes its checks.
---

# Farbaek UI

Farbaek's interface should feel premium because it is fast, calm and honest. It isn't decorated. The "futuristic" part is the agent made visible: the Agent Core, live steps and proof. Read `CLAUDE.md` first; this skill turns its design rules into working patterns.

## The system (White Signal)

**Colour.** Use tokens only: `bg-canvas`, `bg-canvas-2`, `bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `border-line-strong`.
- The single accent is `accent` (signal blue).
- `accent-2` (cyan) is for the aurora, orbits and syntax tint only.
- Status colours: `verified`, `approval`, `failed`, `unverified`.
- In inline styles, use `var(--color-…)` or `color-mix(in oklab, var(--color-x) 16%, var(--color-surface))`, never literal colours.
- `tests/design/contrast.test.ts` must stay green.

**Shape lock:**

| Element | Shape |
| --- | --- |
| Buttons, chips, segmented controls | Pills (`rounded-full`) |
| Inputs | `rounded-sm` (12px) |
| Cards | `rounded-md` (20px) |
| Large panels | `rounded-lg` (28px) |

**Type:**
- Geist for UI and headings: weight 500, tight tracking (`tracking-[-0.03em]`).
- Geist Mono for code and data only: hashes, paths, commands, IDs, model IDs, keys and timecodes. Never for words.
- No serif.

**Small text (ADR 0049).** It should read like a calm product, not generated UI:
- Labels are sentence-case Geist: field labels `text-[13px] font-medium text-ink-3`, group headers `text-xs font-medium text-ink-3`.
- No `// label` overlines and no eyebrow over a page title: the title stands alone.
- Meta lines are short phrases ("Python, 2 KB. Revision 3, updated 2 hours ago."), or items in a flex row with a gap. At most one `·` per line.
- Nothing under 12px, except tab-bar labels and count badges (11px).
- Status words are sentences ("Awaiting approval"), always with their icon.
- Words like "Stage 6" are for the team, not the interface: say "Planned".

`tests/design/type-tells.test.ts` fails on `//` labels, tiny type, middot chains and tracked capitals.

**Depth:** `shadow-e1` (cards), `shadow-e2` (raised panels), `shadow-e3` (dialogs and menus).

**Mobile first:**
- 16px text in inputs (`text-base`) and 44px targets (`min-h-11`, `size-11`).
- No sideways scroll at 375px.
- A button's own `inline-flex` beats `hidden`, so control visibility with a wrapper.
- Text sizes are in rem (`text-[0.9375rem]`, not `text-[15px]`), so Android's text size reaches them. Look at a new screen with `pnpm qa:responsive --text-scale=2 --widths=375 --routes=…`, and with your own eyes: long words and small fixed pieces break in ways the audit can't see. Below 18em (`max-[18em]:`) is where a phone at its largest text sizes lands, and normal text never gets there.
- Anything pinned above the phone tab bar uses `bottom-[var(--tab-bar)]`, which is 0 while someone types, so it stays above the keyboard.
- Web purchase controls go in `WebPurchaseOnly`, so the Android app never shows a price, even at first paint.
- Beside anything the AI made, offer `ReportResult`, so people can report it without leaving the app.

## Components to reuse

| Need | Use |
| --- | --- |
| Page title and intro | `PageHeader` (`src/components/app/primitives.tsx`), along with `Card`, `Notice`, `StatTile`, `EmptyState` |
| Buttons and links styled as buttons | `buttonClasses(variant, size, extra)` and `ButtonLink` (`src/components/ui/button.tsx`) |
| Times | `RelativeTime` and `LocalTime` (`src/components/ui/local-time.tsx`) |
| Run status | `RunStatusBadge`; tasks use `TaskStateBadge` |
| The agent, large | `AgentCore` (`src/components/build/agent-core.tsx`): static SVG first, a lazy 3D scene on capable devices |
| The agent, small (lists, chrome) | `CoreMark` (`src/components/build/core-mark.tsx`): CSS only, cheap to show many |
| Starting work | `PromptComposer` (app, public or follow-up mode) |
| Showing a static site | `StaticPreview` (sandboxed `srcdoc`, no network) |
| A verified Seal | `ProofPackSeal`, wrapped in `SealReveal` to form once. Only for verified evidence or clearly labelled samples |
| Refreshing live server data | `LiveRefresh active={…}` |
| A project, as a card | `ProjectCard` (`src/components/app/project-card.tsx`): a live picture of its site (`SiteThumb`, lazy, no scripts) above its name. `SiteThumb src=…` draws any site picture from a thumbnail route (projects and templates) |
| Handing a sentence to the build box | `offerPrompt(text)` from `prompt-composer.tsx`: it fills the page's box, scrolls to it and focuses it |
| A press that removes, cuts off or changes what visitors see | `ConfirmAction` (`src/components/ui/confirm-action.tsx`, ADR 0181): one press shows the question and the real button, the result is said beside it, and `disabledReason` keeps the trigger visible but off. Its server action returns `{ status, message }`, never `void` |
| A premium panel (plans, promises, showcase) | The double bezel: an outer shell `rounded-lg p-2 ring-1 ring-line bg-surface-raised/60` around an inner `rounded-md bg-surface` card. 28px minus 8px of padding gives the 20px card radius, so the curves stay concentric |
| A primary call to action with an arrow | Button-in-button: a pill with the arrow in its own `size-8 rounded-full` circle that shifts up and right on hover (see `SiteHeader`) |

## Motion and 3D: only when it means something

Animate for live state, hierarchy, storytelling or feedback, and nothing else.

**The budget (ADR 0172, `tests/design/motion-budget.test.ts`):**
- Feedback and hovers: 100–200ms. A change of view: about 240ms, with `cubic-bezier(0.16,1,0.3,1)`. Exits are quicker than entrances.
- Nothing in the signed-in app reaches 500ms, except the named moments below and loops that mean the agent is working.
- Only `transform` and `opacity` animate, and everything that moves is `motion-safe:`. Nothing on keyboard actions repeats.
- Nobody waits for an animation: everything is usable while it plays.

**The three moments (expressive, rare, once each):**
- A verified task's next-step card carries the Seal, from real evidence only (`verifiedSeal`).
- Pressing Publish ends in `PublishedMoment`.
- A run ending while someone watches has its result rise in (`endedWhileWatching`).
- Use `.moment-rise` and `.moment-pop` for a new one, and think hard before adding one. If everything is a moment, nothing is.
- Forms, lists, tables and editors get no WebGL. Use CSS 3D for depth there.
- Any SVG needs a size class. `ProofPackSeal`'s `size` prop only sets its viewBox, and without a class it draws nothing.

**Reduced motion.** Always gate animation:
- Use `motion-safe:animate-[…]` classes.
- Or put CSS under `@media (prefers-reduced-motion: no-preference)`.
- The still state must be complete on its own.

**Patterns already in use:**
- Lists rising in, staggered: `motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]` with `style={{ animationDelay: `${i * 40}ms` }}`.
- Page changes: the `PageTransition` view transition (`transitionTypes={PAGE_NAV}` on links).
- Live agents: `core-orbit` (turning while working) and `core-call` (a ring while waiting for a person).
- Proof: the Seal tilts up and draws in once (`seal-tilt`, `seal-draw`), only when on screen.

**3D (React Three Fiber):**
- Lazy load it (`next/dynamic`, `ssr: false`) after `whenIdle`, and only when `canRun3D()` is true.
- `canRun3D()` is false on touch-first screens: phones get the static version (ADR 0052, measured with `pnpm qa:vitals`).
- Pause it off-screen and when the tab is hidden.
- Cross-fade it over a static fallback.
- Never make it the only way to read a state.

## Honest states

Every state has words and an icon; colour is never the only signal. States are `StatusBadge`'s thirteen kinds (ADR 0183): verified, done, approval, pending, working, attention, paused, failed, blocked, unverified, off, info and simulated. A task's kind is `stateKind()`. Blue (`approval`) is your turn, burnt orange (`caution`) a real warning, steel (`info`) information or work in progress, graphite a sample. No gold, amber or purple anywhere.

**One icon set (ADR 0183).**
- Phosphor on the web and desktop, SF Symbols on the iPhone.
- Filled icons report a state, outlined icons name a thing or an action.
- Sizes are 14, 16, 20, 24 and 32: `bold` at 14 and 16, regular from 20. Never duotone, light or thin.
- Section headings in the app use `CardTitle` (20px outlined icon in `ink-3`, then the words). The same concept gets the same icon on every page, and a page's concept takes its navigation icon.
- Error lines carry a filled WarningCircle in `failed`, success lines a filled CheckCircle in `verified`. External links use ArrowUpRight.

Pick the icon for what the control does, not for "AI": hammer to build, pen nib to draft, tree to map, tray for an inbox, wrench to fix (ADR 0153). Sparkles, robots, wands and brains fail `tests/design/plain-icons.test.ts`.

Every control works, or it's visibly unavailable with the reason (a `disabledReason`). There are no dead ends: after cancelling, failing or finishing, offer the next step.

Sample data is labelled "sample". Never invent numbers, integrations, results or prices. Usage is shown as shares and dates, never units.

## Copy

**Say it the way anyone would (ADR 0170).** `tests/design/plain-words.test.ts` enforces this in the signed-in app.

| Not this | This |
|---|---|
| Intent contract, contract | Plan |
| Proposal, propose | Change, suggest |
| Lifecycle | Progress |
| Invariants / Acceptance / Resources / Forbidden | Must stay true / Done when / What it can change / Not allowed |
| Evidence | Proof (a ProofPack keeps its name; explain it where it appears) |
| Recovery | Undo |
| Policy | Rules (the legal "Privacy Policy" stays) |
| Hash, digest, fingerprint | Don't show them by default |
| Mission Control | Home |
| Sandbox / Agents / Mesh / Incidents / Activity / Integrations / Trust graph | Test space / Desktop app / Move projects / Problems and pause / History / Connections / Who can do what |

**Lead with the next step.** A page with a job says what's happening and the one thing to do first, then the card for it. Everything else goes in one `Disclosure` (`src/components/ui/disclosure.tsx`). Two levels of disclosure at most.

- Plain sentences from the person's side of the screen.
- No em dashes in UI text, no filler verbs, no "first", "guaranteed" or "complete protection".
- Buttons say what happens ("Approve and build", "Review and apply"), and the result uses the same verb.
- Errors say what happened and what to do next.

## React patterns that pass this repo's lint

- **Server Components by default.** Anything with state, effects, Motion or browser APIs is a small `"use client"` leaf.
- **Browser-only values** (localStorage, `navigator`, reduced-motion preference): read them with `useSyncExternalStore(noSubscribe, getSnapshot, () => serverValue)`, not `setState` in an effect.
- **No synchronous `setState` in an effect body.** Set state in event or observer callbacks.
- **Refs in render.** Don't read refs during render, including through closures built in `useMemo`. Describe actions as data, such as `{ kind: "go", href }`, and run them in one event handler.
- **React inputs in tests or automation** need the native value setter plus an `input` event.

## Before you call it done

1. Run checks one at a time (the dev PC has 3.8 GB): `pnpm typecheck`, `pnpm lint`, the relevant `pnpm exec vitest run <path>`. Stop the server, then `pnpm build`.
2. Look at it in a browser on a production build: desktop and 375px, reduced motion if you added motion.
3. Note what you checked and what you couldn't in `docs/stages/`.

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
- Geist Mono for code, data and `// labels`.
- No serif.

**Depth:** `shadow-e1` (cards), `shadow-e2` (raised panels), `shadow-e3` (dialogs and menus).

**Mobile first:**
- 16px text in inputs (`text-base`) and 44px targets (`min-h-11`, `size-11`).
- No sideways scroll at 375px.
- A button's own `inline-flex` beats `hidden`, so control visibility with a wrapper.

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

## Motion and 3D: only when it means something

Animate for live state, hierarchy, storytelling or feedback, and nothing else.

**Durations:**
- Feedback and hovers: 150–200ms.
- Entrances: about 260ms, with `cubic-bezier(0.16,1,0.3,1)`.
- Nothing on keyboard actions repeats.

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
- Pause it off-screen and when the tab is hidden.
- Cross-fade it over a static fallback.
- Never make it the only way to read a state.

## Honest states

Every state has words and an icon; colour is never the only signal.

Every control works, or it's visibly unavailable with the reason (a `disabledReason`). There are no dead ends: after cancelling, failing or finishing, offer the next step.

Sample data is labelled "sample". Never invent numbers, integrations, results or prices. Usage is shown as shares and dates, never units.

## Copy

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

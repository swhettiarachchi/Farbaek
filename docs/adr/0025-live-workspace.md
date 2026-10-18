# 0025. The live workspace: an Agent Core, page transitions and panes on phones

- Status: accepted
- Date: 2026-10-18
- Builds on: ADR 0008 (White Signal), ADR 0022 (cloud runs)

## Context

The owner wants the workspace to feel modern, futuristic, 3D and animated, and to work smoothly on phones. White Signal (ADR 0008) still holds:
- one light theme and one accent;
- motion only for live state, hierarchy, storytelling or feedback;
- reduced motion always respected;
- 3D loaded lazily, with a static fallback.

A cloud run is the most alive thing in the product, so the 3D goes there.

## Decision

**The Agent Core** sits at the top of the Build run page (`src/components/build/agent-core.tsx`, `src/components/three/agent-core-scene.tsx`). It's a glass orb with a nucleus, a wire shell and an orbit of packets.
- **What it shows:** its phase comes only from the run's status and its latest recorded event (`src/core/agent/run-phase.ts`): getting ready, thinking, reading the project, writing changes, running a command, waiting for you, finished, or stopped. It never shows activity the run didn't report.
- **How each phase reads:**
  - every phase has its own motion, label and icon, so colour is never the only signal;
  - colours are read from the design tokens at mount;
  - signal cyan is used in the orbit only.
- **Lazy, with a static fallback:**
  - the static core renders first;
  - the 3D scene loads once the browser is idle, and only with WebGL, at least 4 GB of memory and 4 cores where the browser reports them, and no Save-Data;
  - it never loads under reduced motion;
  - it drops back to static if it can't hold 24 frames a second.
- **Pausing:** it pauses off-screen and in hidden tabs. A finished or stopped run settles for 2.5 seconds, then draws no more frames.

**Page transitions** use React's `ViewTransition` (`src/components/app/page-transition.tsx`):
- they run only for moves between pages from the sidebar and the tab bar, which add the `page-nav` transition type;
- refreshes, form results and live polling change the page without animating;
- the old page fades and the new one rises 8px;
- browsers without view transitions swap instantly, and reduced motion turns them off.

**Phones:** the run page becomes three panes, Steps, Files and Run.
- **Switching panes:** a segmented control, or a horizontal swipe that leaves vertical scrolling and code blocks alone. The next pane slides in from the side it came from.
- **Approvals:** a request to run a command rises as a sheet above the tab bar.
- **Wide screens** show all three panes at once.
- **Files** lists the files the run changed in its copy, from its successful write and edit steps.

**Page loads** show a skeleton in the shape of a page instead of a spinner (`src/app/app/loading.tsx`).

**Mission Control** shows the latest agent runs and the AI usage meter.

## Consequences

- The run's state is visible at a glance, in 3D where the device can afford it and as a still image elsewhere, with the same words either way.
- No new dependencies: React Three Fiber, Three and Motion were already used by the hero, and the capability check and frame governor are now shared with it (`src/components/three/capability.ts`, `frame-governor.tsx`).
- **Not built yet:**
  - **a prompt bar to message a running agent**: runs don't take follow-up messages yet, and a bar that can't send would be a dead end;
  - **a live preview of the run's sandbox beside the steps**: previews show the project's applied files and apps started from the Sandbox page (ADR 0023).

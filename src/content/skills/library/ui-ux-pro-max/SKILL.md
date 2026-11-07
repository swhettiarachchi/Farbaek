---
name: ui-ux-pro-max
description: Puts the build's interface through ten UX rule categories in priority order (accessibility and touch first, charts last) and a pre-delivery check, with exact numbers for targets, type, motion, forms and navigation, for any page, app screen or dashboard.
---
Farbaek edition of "UI/UX Pro Max" by Next Level Builder (MIT), https://github.com/nextlevelbuilder/ui-ux-pro-max-skill. Shortened to fit a build, keeping the rules without its search script and data files. The full licence is in LICENSE.txt beside this file.

Read the product type, audience, context and style keywords, then apply the categories in priority order.

## 1. Accessibility (critical)
- Text 4.5:1 (large 3:1), meaningful icons and control edges 3:1. Keep focus rings; icon-only buttons get a label; icons beside text are aria-hidden.
- Skip link, no skipped heading levels, tab order matching visual order, an exit from every modal and multi-step flow.
- Sticky bars never cover the focused control. Every drag has a click and keyboard alternative. Moving content has a pause control and stops on focus. Sign-in allows paste and password managers.

## 2. Touch and interaction (critical)
- Targets 44 by 44 px, 8 px apart, bigger hit areas for small icons. Never hover-only; touch-action: manipulation.
- Buttons disable and show progress during async work; feedback within 100 ms of a tap. No gesture-only critical actions.

## 3. Performance (high)
- WebP or AVIF with srcset, font-display: swap, async third-party scripts, CLS under 0.1. Virtualise lists over 50 items, debounce scroll and input, skeletons for waits over 1 s.

## 4. Style (high)
- Style matches the product type and holds on every page. One SVG icon set and stroke, never emoji. One elevation scale; blur only behind dismissable layers. One primary action per screen. Hover, pressed and disabled states distinct.

## 5. Layout (high)
- Mobile first, breakpoints 375, 768, 1024, 1440. Never disable zoom. 100dvh, not 100vh. Body 16 px on phones; lines 35 to 60 characters on phones, 60 to 75 on desktop. A 4/8 px spacing scale, one max width, a z-index scale (0, 10, 20, 40, 100, 1000). Fixed bars reserve space beneath; no nested scroll areas.

## 6. Typography and colour (medium)
- Body line-height 1.5 to 1.75; a scale like 12, 14, 16, 18, 24, 32; headings 600 to 700, body 400, labels 500.
- Semantic tokens (primary, surface, error), never raw hex in components. Dark mode uses lighter, desaturated tones, not inversion.
- Tabular figures for data and prices. Wrap rather than truncate; overflow-wrap: anywhere for URLs and IDs.

## 7. Animation (medium)
- One or two key elements per view, each showing cause and effect. Decelerate in, accelerate out; exits at 60 to 70% of the entrance; stagger 30 to 50 ms per item; press scale 0.95 to 1.05.
- Shared timing tokens. Interruptible, never blocking input. Modals grow from their trigger; forward moves left or up, back right or down.

## 8. Forms and feedback (medium)
- Visible labels, never placeholder-only. Validate on blur; errors go below the field (aria-describedby) with cause and fix. After a failed submit, focus an error summary.
- Semantic input types and autocomplete. Toasts last 3 to 5 s, aria-live="polite", never taking focus. Confirm destructive actions and offer undo. Disabled: 0.38 to 0.5 opacity and the attribute.

## 9. Navigation (high)
- Bottom nav at most five items, icon and label each; a sidebar from 1024 px. Current place highlighted. Every key screen has a URL; back restores scroll and filters. Breadcrumbs from three levels deep. No modals for primary navigation; focus moves to main content on route change.

## 10. Charts and data (low)
- Line for trends, bar for comparisons, pie only up to five parts. Legend beside the chart, tooltips on hover, tap and keyboard, patterns besides colour, no red-green pairs. Data marks 3:1, labels 4.5:1. A table alternative, and real empty, loading and error states.

## Before delivering
Test at 375 px and in landscape, with reduced motion and the largest text, and check dark mode contrast separately. Confirm one icon family, pressed states that don't shift layout and content clear of fixed bars and safe areas; review categories 1 to 3 again.

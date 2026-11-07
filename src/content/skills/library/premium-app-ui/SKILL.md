---
name: premium-app-ui
description: Premium app screens that feel restrained, crafted and fast: one hero per screen, a small token system, physical motion, and depth that stays light on phones.
---
Farbaek's own skill, shortened to fit a build. It draws on the craft of UI/UX Pro Max by Next Level Builder (MIT) and on what Farbaek learned about motion and 3D on phones.

Premium isn't decoration. An interface feels expensive when it's restrained (one idea, one accent, lots of air), crafted (every value comes from a system), responsive (it answers a tap within 100 ms) and honest (real content, clear states).

## Before building
- In DESIGN.md, write the brief: product and audience, the feeling in three words, the main action on each screen, a named direction, and light or dark chosen by the moment of use.
- Set three dials: motion (calm, expressive or cinematic), depth (flat, layered, tilt and parallax, or a real 3D object with a still fallback) and density. "Premium" and "luxury" usually mean less motion and more restraint, not more effects.
- Write tokens before components: colour, type, spacing, radius, elevation, motion. Check every text pair's contrast.

## The premium moves
1. One hero per screen: what people came for is the largest, calmest element. Values beat labels: a big number, a small caption.
2. Big type contrast, few sizes: display 40 to 56 px against body 16 to 17 px, at most four sizes and two weights a screen, tight tracking on display, tabular figures for numbers.
3. Air with rhythm: a 4 and 8 px scale; space inside a group about half the space between groups.
4. A restrained palette: about 60% tinted neutral, 30% ink, 10% one accent. Strong colours only for meaning.
5. Layered, tinted depth: soft multi-layer shadows tinted with the background, a 1 px top highlight, concentric radii. On dark, lighter surfaces and hairlines instead of shadows.
6. Light, not effects: glows drawn with radial gradients. Never CSS filter on the web (blur, drop-shadow, brightness): Safari on iOS 26 can paint a black square from it. backdrop-filter is fine.
7. Glass only on chrome (tab bars, headers, sheets, floating controls), tinted enough for text. Content stays on solid surfaces.
8. Physical motion: springs and ease-out curves, 150 to 400 ms, exits faster than entrances, interruptible, shared elements between screens.
9. Tactility: a pressed state on touch-down (scale 0.97 and a tint), drags that follow the finger.
10. One signature moment: the peak of the flow (payment sent, workout done) gets the best motion and words.
11. Real content: real photos or marked placeholders, realistic copy, numbers labelled as samples, no lorem ipsum.
12. Finished details: skeletons shaped like the layout, empty states with an action, one icon family, and every state designed: loading, empty, error, offline, success.

## Phones first
- Main actions in the thumb zone (the bottom third), targets at least 44 px, 16 px text in inputs, no sideways scroll at 375 px, safe areas respected.
- Bottom tabs for three to five top-level places, sheets for short tasks, one primary button a screen.

## Hard rules
- Contrast 4.5:1 for text, 3:1 for large text, icons and control borders. Status never by colour alone.
- Reduced motion removes movement (parallax, loops, large travel) and keeps feedback; the still state is complete.
- Animate only transform and opacity; pause loops off screen; load 3D, charts and editors after first paint.
- 3D only behind a capability check, Save-Data and reduced motion, with a designed still version. Phones usually get the still.
- Text above the fold paints with the page, never behind a reveal that starts at opacity 0.
- One icon family, icons that name the action, no emoji as icons, no sparkles or robots for "smart".

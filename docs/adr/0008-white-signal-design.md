# 0008. White Signal design system

- Status: accepted. Supersedes 0007 (gold accent from the logo).
- Date: 2026-10-13

## Context

The owner asked to remove the gold colour, take the logo off its background, and move to a white, futuristic, developer-focused look. The owner named Google Antigravity (antigravity.google) and Shopify as references, and asked for 3D, animation and cinematic video.

What the Antigravity page actually does (checked in the browser on 2026-10-13): a near-white canvas; near-black ink (#121317) in a light-weight variable sans (Google Sans Flex, weight about 450); a drifting particle field in the hero; a large rounded black video panel set inside the white page; product panels framed by a soft colour glow; a dark terminal panel; pill buttons.

## Decision

- **One light theme**, dark-mode-free by brand decision. Tokens in `src/styles/tokens.css`, contrast enforced by `tests/design/contrast.test.ts` (81 checks).
- **Accent:** signal blue `#2450f0` (text-safe on every surface), with signal cyan `#0a6e85` used only in the aurora glow, the orbit packets and syntax tint. No gold in the UI. The logo keeps its own colours, unaltered.
- **Logo:** placed directly on the page with no plate, frame, filter or recolouring. In the hero it levitates in 3D.
- **Type:** Geist and Geist Mono via `next/font`. Google Sans Flex is not used: it reads as Google's brand, and the spec forbids copying another company's branding.
- **Media panels:** the evidence terminal and sandbox output are dark frames (`--media*` tokens) inside the white page, the way a video player is. They are content, not a second theme.
- **Shape lock:** pills for buttons, chips and segmented controls; inputs 12px; cards 20px; large panels and media frames 28px.
- **3D:** React Three Fiber 9 / three.js 0.186. The hero scene ("The Loom") shows the knight as a textured plane with the six RealityLoop stages orbiting it, passing in front of and behind it, plus rising particles. It loads after idle, only on capable devices, never under reduced motion or Save-Data, pauses when off-screen, and falls back to the static image if the first second runs below 24 fps.
- **Cinematic video:** superseded by ADR 0034. The homepage films are real recordings of Farbaek's interface, shot frame by frame on a light stage and encoded to H.264, with captions, chapters and a transcript. They never autoplay under reduced motion or Save-Data. The earlier in-browser concept film is gone.
- Not copied from the references: Google's multicolour gradient, logos, typeface or product imagery.

## Consequences

- The Proof Atelier rules in `CLAUDE.md` are replaced by the White Signal rules.
- Spec section 16's dark-mode tokens are not implemented. Re-adding a dark theme later means a second token block and running the contrast test per theme again.

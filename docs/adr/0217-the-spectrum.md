# ADR 0217: The spectrum, and the knight back in the hero

- **Status:** accepted (stage 201, 2026-11-17)
- **Builds on:** ADR 0008 (White Signal), ADR 0052 (phone performance), ADR 0055 (no filters), ADR 0056 (the Loom), ADR 0183 (status), ADR 0214 and 0216 (the spaces)
- **Changes:** ADR 0008's "one accent": the public site and the spaces' own chrome may also use four spectrum colours

## Context

The owner reviewed two passes of the new homepage. The first was oversized and generic. The second, rebuilt from measurements of ChatGPT, Antigravity and Claude, was well proportioned but flat white, and it took the cat knight out of the hero. The owner's answer: Farbaek must be premium and compact, and also colourful, playful and futuristic; the knight and his hero animation are the brand and must stay and get better.

A second look at the references for colour: ChatGPT colours one word of its headline and scatters a few playful coloured props round it; Antigravity keeps every interface neutral and lets a soft multi-colour light glow from behind each product window, on a pale rounded stage. Neither colours the interface itself.

## Decision

**Four spectrum colours** join signal blue, one for each of Farbaek AI's main spaces: Chat keeps signal blue, Images is rose (`spark-rose`), Video is aqua (`spark-aqua`), Build is leaf (`spark-leaf`), and ember (`spark-ember`) is for playful marks. They are tokens, tested like every other: each reads as text on every background at 4.5:1, and none is gold, amber or purple.

**Where they may be used:** the public site and the spaces' own chrome, for identity and light: a space's icon, its link and progress line, a tint behind its card, and the glow behind its product window. **Where they may not:** status. Status stays `StatusBadge`'s thirteen kinds in their own colours (ADR 0183), and the signed-in app's working screens stay White Signal.

**Light, not paint.** Interfaces stay neutral. Colour comes from behind them: `Halo` draws the spectrum from behind a product window's edges with gradients that fade to nothing (no filters, ADR 0055), on a pale stage, as Antigravity does.

**The knight leads the hero again.** `HeroVisual` (the knight inside the Loom, in 3D on capable desktops and drawn in 2D everywhere else) sits centred above the headline, as large as each screen allows while the message box stays on the first screen. His size follows the screen's height as well as its width: about 230 to 320 px tall on phones, 350 px on a tablet, 270 px on a short laptop and up to 400 px on a large desktop (he was 200 px everywhere before the owner asked, for the fourth time, for him to be much larger). His light is the spectrum in two layers, blue breathing behind him and rose and aqua drifting slowly round; it blooms in as he arrives. With a mouse the whole figure leans a few degrees toward the pointer; a tap makes him hop and sends a ring of light along the ground; and as the hero scrolls away he eases smaller and rises, where the browser ties animation to scrolling. Four small cards, one per space in its colour, float beside the hero on wide screens, tilted like things on a desk; each is a link to its space, drifts slightly against the pointer and straightens when hovered. Below 1280 px they're hidden, and the chips under the message box do the same job.

**The headline** names the three verbs in the spaces' colours: Ask (blue), create (rose), build (leaf).

**Sizes stay compact:** the headline is 32, 52 and 64 px; buttons 40 px. The knight is the one large thing in the hero, and the headline, the sentence and the message box still fit the first screen under him, measured from 360 by 560 to 1920 by 1000.

## Consequences

- CLAUDE.md's design rules say where the spectrum may be used.
- The pointer lean and the cards' drift only run with a mouse and when motion is welcome. The slow drift of his light is the one new loop; like his float, it stops off screen, in a hidden tab, with the Pause control and under reduced motion.
- If the app's working screens ever want the spectrum (for example a space's colour in the sidebar), that is a new decision, not a default.

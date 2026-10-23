# ADR 0055: Films that keep moving, and no CSS filters

- Status: accepted (2026-10-24). The Safari-only MP4 loop was replaced by animated WebP loops in ADR 0056.
- Changes ADR 0051 (one video at a time) and the aurora from ADR 0008. Builds on ADR 0034 (the films).

## Context

The owner checked the live homepage on an iPhone and reported two problems.

**A black square sat behind the left end of the header.**
- It's about 75 by 75 CSS pixels, at the top-left corner of the screen.
- Nothing in the page is black there; the DOM at that point holds only the header.
- The cause is WebKit bug 314999 (iOS 26): a filter on an element below the fold paints a black square at the top left of the viewport, sized by the filter's blur.
- The homepage's aurora (`.aurora::before { filter: blur(28px) }`) sits behind six panels below the fold. The Halo One mockup also had a `drop-shadow` filter.
- WebKit fixed it on main in June 2026; phones in use still show it.

**The films waited for a tap.**
- The phone was in Low Power Mode, where iOS Safari refuses to start any `<video>`, muted or not.
- The players showed a play button, which was honest, but the owner wants the homepage films always moving, like animation.
- Elsewhere, only one film played at a time (`pickLead`, ADR 0051), so a second film on screen sat still.

## Decision

**No CSS filters in the interface.**
- **The aurora** is drawn with `closest-side` radial gradients, which fade to nothing inside their own box, so no blur is needed. The colours come from the accent tokens.
- **The headphones** get a contact shadow drawn as a gradient.
- **Button hovers** use a colour instead of `brightness()`. So does the blog starter template, so sites people build don't hit the bug either.
- **A test** (`tests/design/no-filters.test.ts`) fails on a CSS `filter`, a Tailwind filter utility or `[filter:` in `src/app` and `src/components`.
  - `backdrop-filter` is a different path in WebKit and stays.
  - The film stage, rendered only in headless Chrome to record the films, is exempt.

**Films keep moving.**
- **Every film in sight plays and loops.** `pickLead` is gone. A film plays once 20% of it is on screen (it was 45% for the theater and 30% for clips). Off screen or in a background tab it rests.
- **Where the browser refuses to start a film,** the same recording runs as a silent animated image (`SilentLoop`):
  - It's a `<picture>` with the MP4 as a `video/mp4` source, the pattern Apple documents in "Delivering Video Content for Safari". Safari plays an MP4 in an image like a GIF, on a loop and silent.
  - Other browsers skip that source without downloading it and draw a transparent pixel, so the poster and play button stay as before.
  - The loop is only mounted while the film should be moving and the video was refused, so no other visitor downloads anything extra.
- **The theater in loop mode:**
  - The caption line says "Playing as a silent loop. Press play for captions and chapters."
  - A small "Play with captions" button starts the real player inside the tap, with captions, chapters and the scrubber.
  - The big play cover stays away while the loop is moving.
- **The clip in loop mode:** its button shows pause, and pausing removes the loop, as WCAG 2.2.2 requires.
- **A refusal is never "slow".** The ten-second stall timer stops when `play()` is refused, so a clip in Low Power Mode doesn't turn its button into "Try again".

**Unchanged:**
- Reduced motion and Save-Data still mean no autoplay and no loop. The poster shows with a play button.
- A person's pause stays paused.

## Consequences

- **The homepage** has no element that can trigger WebKit bug 314999, and phones skip a 28px blur layer behind each panel.
- **In Low Power Mode, Safari** downloads a film's MP4 for the loop instead of for the video: the same bytes as playing it. A tap on "Play with captions" loads the video too. The URLs are versioned and cached for a year, so a repeat comes from cache when the browser allows it.
- **More than one film can decode at once** when two are on screen. On phones that's two at most in the emulated audit.
- **Not verified here:**
  - Safari on a real iPhone in Low Power Mode. The loop path can only be checked there.
  - The black square's absence on the owner's phone.

  Chrome confirms the fallback is skipped without a download, and that every film in sight plays.

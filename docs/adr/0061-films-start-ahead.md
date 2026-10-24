# ADR 0061: Films start before they're seen

- Status: accepted (2026-10-24).
- Changes ADR 0051 and ADR 0055 (when a film plays), and how ADR 0056 and ADR 0057's silent loops hand over.

## Context

**The owner asked for the homepage films to be playing as soon as people arrive,** not starting late.

**They did start late.** Each film downloaded nothing (`preload="none"`) until 20% of it was on screen, then fetched and started. On a simulated good 4G phone, the build film took 0.75 to 1.3 seconds to move after scrolling into view; slower networks were worse.

**In Low Power Mode** the silent loop stood in until a person pressed play on each film.

## Decision

**Films start ahead of the view, in the direction people scroll** (`PLAY_AHEAD`, `PRELOAD_AHEAD` in `player-logic.ts`; two observers in `useOnScreen`):
- **Play ahead:** a film plays once it's within one screen below the view, and rests once it's a quarter of a screen above it. The film under the hero is that close when the page opens on most phones (0.64 and 0.77 screens on 430 and 393 px wide phones) and on desktops, so it's already playing when people scroll to it.
- **Preload ahead:** a film starts downloading (`preload="auto"`) within two screens below. The desktop feature stage's clips are ready before they're switched to.
- **Reduced motion and Save-Data** still mean no autoplay, and now also no preloading.

**The first touch unlocks every film.** When a browser refuses to start a film on its own (Low Power Mode, some in-app browsers):
- the film signs up, and its silent loop stands in;
- the next tap, click or key anywhere on the page plays every refused film inside that gesture, which unlocks it for good, and pauses again at once any that shouldn't be moving yet;
- the real recording then takes over from the loop;
- a refusal keeps a film waiting for the next touch.

## Consequences

- **The first film moves as people arrive.** On simulated 4G, the time from scrolling in to moving fell from 0.75 to 1.3 seconds to 0 to 3 ms. On the smallest phones (667 px tall) it's downloaded ahead and starts on the first bit of scrolling.
- **More data on arrival:** the first film streams while people read the hero, as it would once they scrolled. Save-Data and reduced motion turn this off.
- **Up to two or three films decode at once** on a phone, as measured: two in sight in the emulated scroll.
- **Not verified here:** an iPhone in Low Power Mode. A Chrome simulation that refuses `play()` without a touch shows the loop until the first tap, then the real film.

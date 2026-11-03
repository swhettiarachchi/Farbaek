/**
 * Template: a launch page for one product, the premium direction for
 * launches, pre-orders and single products (ADR 0160): built on the Farbaek
 * Studio kit, light by default, with the craft of the "Product storytelling"
 * skill. A giant claim with a price chip and a tilting product, one dark
 * chapter where the sound settles as you scroll (a Farbaek Scenes particle
 * field behind a live wave), a closer-look viewer, specs that count up with
 * footnoted claims, a buy bar that follows on phones, and a pre-order form
 * that says plainly it doesn't send yet. Real product photos in replaceable
 * slots. Sample content throughout; complete without JavaScript.
 */
import { KIT_URL } from "@/core/media/library";
import { photoUrl } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "../types";

const photo = (id: string, w: number, h: number, slot: string, alt: string, lazy = true) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} data-farbaek-media="${slot}" data-farbaek-placeholder />`;

// The wave: bars with fixed, varied heights (no randomness, so the page is the same every time).
const BARS = Array.from({ length: 36 }, (_, i) => {
  const h = 0.28 + 0.72 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.43));
  return `<span style="--h: ${h.toFixed(2)}; --i: ${i}"></span>`;
}).join("");

const VIEWS = [
  { id: "1505740420928-5e560c06d30e", label: "On the desk", alt: "Black over-ear headphones on a bright yellow background" },
  { id: "1505740106531-4243f3831c78", label: "Folded flat", alt: "Black headphones lying at an angle on a yellow surface" },
  { id: "1583394838336-acd977736f90", label: "The cushions", alt: "Black headphones on a pale grey background, ear cushions facing forward" },
  { id: "1599669454699-248893623440", label: "After dark", alt: "Black headphones on a black background, lit from the side" },
];

const viewTabs = VIEWS.map(
  (v, i) => `              <button type="button" role="tab" id="view-tab-${i}" aria-controls="view-panel" aria-selected="${i === 0}"${i === 0 ? "" : ' tabindex="-1"'} data-view="${i}">
                <img src="${photoUrl(v.id, 160, 160)}" alt="" width="80" height="80" loading="lazy" />
                <span>${v.label}</span>
              </button>`,
).join("\n");

const viewImages = VIEWS.map(
  (v, i) => `                <figure class="view${i === 0 ? " is-on" : ""}" data-view="${i}"${i === 0 ? "" : ' aria-hidden="true"'}>${photo(v.id, 1400, 1400, `view-${i + 1}`, v.alt)}</figure>`,
).join("\n");

const INDEX = `<!doctype html>
<html lang="en" data-fs-look="signal">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tessel Hush, over-ear headphones</title>
    <meta name="description" content="Hush: adaptive noise cancelling, 40 hours on a charge and cushions you forget you're wearing. Pre-order now, shipping in March." />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600&amp;family=Albert+Sans:wght@400;500;600&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="fs-skip" href="#main">Skip to content</a>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="#top"><span class="mark" aria-hidden="true"></span>Tessel</a>
      <ul class="fs-nav__links">
        <li><a href="#sound">Sound</a></li>
        <li><a href="#look">Closer look</a></li>
        <li><a href="#specs">Specs</a></li>
        <li><a href="#questions">Questions</a></li>
      </ul>
      <span class="nav-price" aria-hidden="true">Hush, from Rs. 74,900</span>
      <a class="fs-btn" href="#preorder">Pre-order <span class="fs-btn__icon" aria-hidden="true"></span></a>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="#sound">Sound</a>
      <a href="#look">Closer look</a>
      <a href="#specs">Specs</a>
      <a href="#questions">Questions</a>
      <a href="#preorder">Pre-order</a>
    </nav>

    <main id="main">
      <section class="hero" id="top">
        <div class="fs-glow" aria-hidden="true"></div>
        <div class="fs-container hero__copy">
          <p class="hero__name">Tessel Hush</p>
          <h1 class="fs-display hero__claim" data-fs-reveal="words">Hear only what you choose to.<sup><a href="#fn-1" aria-label="Note 1">1</a></sup></h1>
          <p class="fs-lead" data-fs-reveal>Over-ear headphones with adaptive noise cancelling, 40 hours on a charge and cushions you forget you're wearing.</p>
          <div class="fs-actions" data-fs-reveal>
            <a class="fs-btn" href="#preorder">Pre-order <span class="fs-btn__icon" aria-hidden="true"></span></a>
            <a class="fs-btn fs-btn--ghost" href="#sound">Hear how it works</a>
          </div>
        </div>
        <div class="fs-container hero__stage">
          <div data-fs-reveal="scale">
            <div class="fs-float">
              <div class="hero__product fs-frame" data-fs-tilt="5">
                ${photo(VIEWS[0]!.id, 1800, 1200, "hero-product", VIEWS[0]!.alt, false)}
              </div>
            </div>
          </div>
          <p class="chip" data-fs-reveal><span>From Rs. 74,900</span><span class="chip__note">Ships in March</span></p>
        </div>
      </section>

      <section class="fs-section fs-section--ink sound" id="sound" aria-labelledby="sound-title">
        <div class="sound__scene" data-farbaek-scene="particles" data-farbaek-media="sound-scene" data-tone="dark" data-intensity="0.45" aria-hidden="true"></div>
        <div class="fs-container fs-head">
          <h2 class="fs-h2" id="sound-title" data-fs-reveal>The world, turned down.</h2>
        </div>
        <div class="fs-container sound__grid">
          <div class="sound__stage" id="stage" data-mode="off">
            <div class="wave" aria-hidden="true">${BARS}</div>
            <div class="modes" role="group" aria-label="Listening mode">
              <button type="button" data-mode="off" aria-pressed="true">Off</button>
              <button type="button" data-mode="aware" aria-pressed="false">Aware</button>
              <button type="button" data-mode="hush" aria-pressed="false">Hush</button>
            </div>
            <p class="sound__level" id="level" role="status">Off: everything around you, at full volume.</p>
          </div>
          <div class="sound__steps">
            <article class="step" data-mode="off" data-fs-reveal>
              <h3 class="fs-h3">Off</h3>
              <p>The 7.40 train, the open-plan office, the tuk-tuk outside the window. All of it, all the time.</p>
            </article>
            <article class="step" data-mode="aware" data-fs-reveal>
              <h3 class="fs-h3">Aware</h3>
              <p>Voices and announcements come through clearly. The hum underneath them doesn't. For the platform and the street.</p>
            </article>
            <article class="step" data-mode="hush" data-fs-reveal>
              <h3 class="fs-h3">Hush</h3>
              <p>Six microphones listen to the room 50,000 times a second and cancel it.<sup><a href="#fn-2" aria-label="Note 2">2</a></sup> What's left is the music.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="fs-section" id="look" aria-labelledby="look-title">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" id="look-title" data-fs-reveal>Take a closer look.</h2>
            <p class="fs-lead" data-fs-reveal>Brushed aluminium arms, a band that folds flat, and protein-leather cushions over slow foam.</p>
          </div>
          <div class="viewer">
            <div class="viewer__stage" id="view-panel" role="tabpanel" aria-labelledby="view-tab-0" data-fs-reveal="scale">
              <div class="viewer__frame" data-fs-tilt="6">
${viewImages}
              </div>
            </div>
            <div class="viewer__tabs" role="tablist" aria-label="Views of Hush">
${viewTabs}
            </div>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="specs" aria-labelledby="specs-title">
        <div class="fs-container">
          <div class="fs-head">
            <h2 class="fs-h2" id="specs-title" data-fs-reveal>The numbers.</h2>
          </div>
          <div class="fs-stats specs" data-fs-stagger>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num"><span data-fs-count>40</span> h<sup><a href="#fn-3" aria-label="Note 3">3</a></sup></span><span class="fs-stat__label">of listening with noise cancelling on</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num"><span data-fs-count>10</span> min</span><span class="fs-stat__label">of charging for five hours of music</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num"><span data-fs-count>268</span> g</span><span class="fs-stat__label">including the cushions and the band</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num"><span data-fs-count>2</span> yr</span><span class="fs-stat__label">warranty, with cushions you can replace yourself</span></div>
          </div>
          <dl class="spec-list" data-fs-reveal>
            <div><dt>Drivers</dt><dd>40 mm, beryllium-coated</dd></div>
            <div><dt>Connection</dt><dd>Bluetooth 5.4, two devices at once, USB-C audio</dd></div>
            <div><dt>Codecs</dt><dd>AAC, SBC, LC3</dd></div>
            <div><dt>In the box</dt><dd>Hush, a folding case, a USB-C cable and a 3.5 mm cable</dd></div>
          </dl>
        </div>
      </section>

      <section class="fs-section">
        <div class="fs-container">
          <figure class="fs-quote" data-fs-reveal>
            <blockquote>I wore them for a whole flight to Doha and forgot they were on until the descent.</blockquote>
            <figcaption>
              ${photo("1630487656049-6db93a53a7e9", 96, 96, "quote-photo", "A man working at a table with colleagues")}
              <span>Ruwan, an early tester</span>
              <span class="fs-sample">Sample quote</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section class="fs-section" id="preorder" aria-labelledby="preorder-title">
        <div class="fs-container">
          <div class="fs-cta order" data-fs-reveal="scale">
            <h2 class="fs-h2" id="preorder-title">Be first in March.</h2>
            <p class="fs-lead">Reserve a pair now. We'll email you before anything is charged, and you can cancel any time before it ships.</p>
            <form class="order__form" id="order" novalidate>
              <div class="field">
                <label for="order-email">Email</label>
                <input id="order-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
              </div>
              <div class="field">
                <label for="order-finish">Finish</label>
                <select id="order-finish" name="finish">
                  <option>Graphite</option>
                  <option>Sand</option>
                  <option>Sun</option>
                </select>
              </div>
              <button class="fs-btn" type="submit">Reserve a pair <span class="fs-btn__icon" aria-hidden="true"></span></button>
            </form>
            <p class="fs-small" id="order-msg" role="status">A sample page. It doesn't send or charge anything yet.</p>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="questions" aria-labelledby="questions-title">
        <div class="fs-container fs-split fs-split--wide">
          <div class="fs-faq" data-fs-reveal>
            <details><summary>When will my pair ship?</summary><p>Pre-orders ship in March, in the order they were placed. We'll email you a week before.</p></details>
            <details><summary>Do they work with my phone and laptop at once?</summary><p>Yes. Hush stays connected to two devices and switches to whichever starts playing.</p></details>
            <details><summary>Can I replace the cushions and battery?</summary><p>The cushions click off by hand. The battery is replaced at our service desk in Colombo for a fixed price.</p></details>
            <details><summary>What if I don't like them?</summary><p>Send them back within 30 days of delivery for a full refund.</p></details>
          </div>
          <div class="fs-head">
            <h2 class="fs-h2" id="questions-title" data-fs-reveal>Questions</h2>
            <p class="fs-lead" data-fs-reveal>Anything else, write to us and a person answers.</p>
          </div>
        </div>
      </section>
    </main>

    <footer class="fs-footer">
      <div class="fs-container">
        <ol class="notes">
          <li id="fn-1">Noise cancelling reduces steady sound most; sudden sounds still come through. Sample claim.</li>
          <li id="fn-2">Measured by Tessel on pre-production units. Sample figure.</li>
          <li id="fn-3">Tested at 50% volume with noise cancelling on; battery life varies with use and settings. Sample figure.</li>
        </ol>
        <div class="fs-footer__grid">
          <div><h2>Hush</h2><ul><li><a href="#sound">Sound</a></li><li><a href="#look">Closer look</a></li><li><a href="#specs">Specs</a></li></ul></div>
          <div><h2>Help</h2><ul><li><a href="#questions">Questions</a></li><li><a href="mailto:hello@tessel.example">Write to us</a></li></ul></div>
          <div><h2>Tessel</h2><p>Audio designed in Colombo.</p></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span id="year">2026</span> Tessel. A sample site.</span><span>Prices in Sri Lankan rupees</span></div>
        <div class="fs-wordmark" aria-hidden="true">Hush</div>
      </div>
    </footer>

    <div class="buybar" id="buybar" aria-hidden="true">
      <p><strong>Hush</strong> Rs. 74,900</p>
      <a class="fs-btn" href="#preorder" tabindex="-1">Pre-order</a>
    </div>

    <script type="module" src="${KIT_URL}"></script>
    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const STYLES = `/* Tessel Hush: the brand on top of the Farbaek Studio kit. The decisions are in DESIGN.md. */
:root {
  --accent: #ffcd2e;
  --accent-2: #ff8a3d;
  --on-accent: #0b0b0f;
  --ink: #0b0b0f;
  --ink-2: #5a5a66;
  --paper: #f4f4f6;
  --paper-2: #ffffff;
  --line: rgb(11 11 15 / 0.1);
  --font-display: "Unbounded", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Albert Sans", ui-sans-serif, system-ui, sans-serif;
  --radius: 24px;
  --radius-lg: 40px;
  --fs-display-weight: 500;
  --fs-display-track: -0.04em;
}

[hidden] { display: none !important; }
/* Yellow is for surfaces; focus and small accents use ink so they read on light paper. */
:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
.fs-list li::before { background: var(--ink); }
.mark { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 50% 50%, var(--ink) 0 28%, transparent 29%), var(--accent); box-shadow: inset 0 0 0 1.5px var(--ink); }
sup { font-size: 0.32em; vertical-align: super; letter-spacing: 0; }
sup a { display: inline-grid; place-items: center; min-width: 24px; min-height: 24px; color: inherit; text-decoration: none; font-family: var(--font-body); font-weight: 600; }
.fs-stat__num sup { font-size: 0.3em; }

.nav-price { display: none; margin-left: auto; font-size: 15px; color: var(--ink-2); white-space: nowrap; }
@media (min-width: 1100px) { [data-past-hero] .nav-price { display: inline; } }

/* The hero: the name, a giant claim, then the product, large, with its price. */
.hero { position: relative; isolation: isolate; padding: 150px 0 clamp(56px, 8vw, 104px); text-align: center; overflow: clip; }
.hero .fs-glow { inset: 30% -10% auto; height: 70%; }
.hero__copy { display: grid; gap: 22px; justify-items: center; }
.hero__copy .fs-lead { margin-inline: auto; }
.hero__copy .fs-actions { justify-content: center; }
.hero__name { font-weight: 600; font-size: 18px; }
.hero__claim { font-size: clamp(40px, 7vw, 108px); max-width: 14ch; line-height: 1; }
.hero__stage { position: relative; margin-top: clamp(40px, 6vw, 72px); }
.hero__product { --fs-ratio: 3 / 2; border-radius: var(--radius-lg); box-shadow: 0 50px 90px -40px rgb(11 11 15 / 0.45); }
.chip { position: absolute; right: clamp(8px, 4vw, 48px); bottom: clamp(-20px, -2vw, -12px); display: grid; gap: 2px; padding: 14px 20px; border-radius: 20px; background: var(--paper-2); box-shadow: 0 20px 40px -18px rgb(11 11 15 / 0.35); text-align: left; font-weight: 600; }
.chip__note { font-size: 14px; font-weight: 400; color: var(--ink-2); }

/* The dark chapter: a particle field behind a wave that settles with each mode. */
.sound { overflow: clip; isolation: isolate; }
.sound__scene { position: absolute; inset: 0; z-index: -1; }
.sound__grid { display: grid; gap: 40px; align-items: start; }
@media (min-width: 900px) { .sound__grid { grid-template-columns: 1.1fr 1fr; } }
/* The stage stays in view while the steps pass it, beside them on wide screens and above them on phones. */
.sound__stage { position: sticky; top: 84px; z-index: 1; display: grid; gap: 20px; padding: clamp(20px, 4vw, 44px); border: 1px solid var(--line); border-radius: var(--radius-lg); background: color-mix(in oklab, var(--paper) 82%, transparent); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
.wave { display: flex; align-items: center; gap: 4px; height: clamp(96px, 20vw, 260px); --amp: 1; }
.sound__stage[data-mode="aware"] .wave { --amp: 0.5; }
.sound__stage[data-mode="hush"] .wave { --amp: 0.1; }
.wave span { flex: 1; min-width: 2px; height: calc(var(--h) * var(--amp) * 100%); min-height: 4px; border-radius: 999px; background: linear-gradient(180deg, var(--accent), var(--accent-2)); transition: height 700ms var(--fs-ease); }
.modes { display: inline-flex; gap: 4px; padding: 4px; width: fit-content; border: 1px solid var(--line); border-radius: 999px; }
.modes button { min-height: 44px; padding: 0 20px; border: 0; border-radius: 999px; background: none; color: var(--ink-2); font: 500 15px/1 var(--font-body); cursor: pointer; transition: background-color 200ms, color 200ms; }
.modes button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); }
.sound__level { color: var(--ink-2); font-size: 15px; min-height: 3em; }
.sound__steps { display: grid; gap: clamp(48px, 14vh, 140px); padding-bottom: 12vh; }
.step { display: grid; gap: 10px; padding: 18px 22px; border-left: 2px solid var(--line); border-radius: 0 18px 18px 0; background: color-mix(in oklab, var(--paper) 62%, transparent); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); transition: border-color 300ms; }
.step p { color: var(--ink-2); max-width: 44ch; }
.step.is-on { border-left-color: var(--accent); }

/* The closer look: a large frame that turns toward the pointer, and views to pick. */
.viewer { display: grid; gap: 20px; }
@media (min-width: 900px) { .viewer { grid-template-columns: 1fr 220px; align-items: center; } }
.viewer__stage { perspective: 1600px; }
.viewer__frame { position: relative; aspect-ratio: 1; max-height: 78vh; margin-inline: auto; border-radius: var(--radius-lg); overflow: hidden; background: var(--paper-2); }
.view { position: absolute; inset: 0; margin: 0; visibility: hidden; clip-path: circle(0% at 50% 50%); }
.view.is-on { visibility: visible; clip-path: circle(75% at 50% 50%); transition: clip-path 900ms var(--fs-ease); z-index: 1; }
.view.was-on { visibility: visible; clip-path: circle(75% at 50% 50%); }
.view img { width: 100%; height: 100%; object-fit: cover; }
.viewer__tabs { display: flex; gap: 10px; overflow-x: auto; scrollbar-width: none; }
@media (min-width: 900px) { .viewer__tabs { flex-direction: column; } }
.viewer__tabs button { flex: none; display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 6px 16px 6px 6px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink-2); font: 500 15px/1.2 var(--font-body); text-align: left; cursor: pointer; transition: border-color 200ms, color 200ms; }
.viewer__tabs img { width: 40px; height: 40px; border-radius: 999px; object-fit: cover; }
.viewer__tabs button[aria-selected="true"] { border-color: var(--ink); color: var(--ink); }

/* Specs. */
.specs .fs-stat__num { font-size: clamp(40px, 5vw, 76px); }
.spec-list { display: grid; gap: 0 48px; margin: 56px 0 0; }
@media (min-width: 900px) { .spec-list { grid-template-columns: 1fr 1fr; } }
.spec-list div { display: grid; grid-template-columns: 140px 1fr; gap: 16px; padding: 18px 0; border-top: 1px solid var(--line); }
.spec-list dt { color: var(--ink-2); }
.spec-list dd { margin: 0; }

/* Pre-order. */
.order { justify-items: stretch; }
.order .fs-h2, .order .fs-lead { max-width: 20ch; }
.order .fs-lead { max-width: 52ch; }
.order__form { display: grid; gap: 14px; align-items: end; max-width: 760px; }
@media (min-width: 760px) { .order__form { grid-template-columns: 1.4fr 1fr auto; } }
.field { display: grid; gap: 8px; font-size: 14px; color: var(--ink-2); }
.field input, .field select { min-height: 52px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in oklab, var(--paper) 92%, transparent); color: var(--ink); font: 400 16px/1 var(--font-body); }
.field input[aria-invalid="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
.order :focus-visible { outline-color: var(--accent); }
.order__form .fs-btn { justify-content: space-between; }

.notes { margin: 0 0 56px; padding-left: 20px; display: grid; gap: 8px; font-size: 13px; color: var(--ink-2); max-width: 90ch; }

/* The buy bar on phones, once the hero has scrolled away. */
.buybar { position: fixed; z-index: 45; left: 12px; right: 12px; bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 8px 8px 20px; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in oklab, var(--paper-2) 84%, transparent); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); box-shadow: 0 18px 40px -20px rgb(11 11 15 / 0.4); visibility: hidden; transform: translateY(140%); transition: transform 400ms var(--fs-ease), visibility 0s 400ms; }
.buybar p { font-size: 15px; }
[data-past-hero] .buybar { visibility: visible; transform: none; transition: transform 400ms var(--fs-ease); }
@media (min-width: 900px) { .buybar { display: none; } }

@media (prefers-reduced-motion: no-preference) {
  .wave span { animation: pulse 1.1s ease-in-out infinite alternate; animation-delay: calc(var(--i) * -70ms); transform-origin: center; }
  @keyframes pulse { to { transform: scaleY(0.55); } }
}
@media (prefers-reduced-motion: reduce) {
  .wave span, .view.is-on, .buybar, .step { transition: none; }
}
`;

const SCRIPT = `// Tessel Hush: the listening modes, the closer-look views, the pre-order form and the buy bar.
// The page is complete without this file; the Studio kit does the reveals, the tilt and the counters.
(function () {
  // Listening modes: the buttons, and the steps as they reach the middle of the screen.
  var stage = document.getElementById("stage");
  var level = document.getElementById("level");
  var LEVEL = {
    off: "Off: everything around you, at full volume.",
    aware: "Aware: voices through, the hum turned down.",
    hush: "Hush: the room cancelled, the music left."
  };
  var steps = Array.prototype.slice.call(document.querySelectorAll(".step"));
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".modes button"));
  function setMode(mode) {
    if (!stage || stage.dataset.mode === mode) return;
    stage.dataset.mode = mode;
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
    steps.forEach(function (s) { s.classList.toggle("is-on", s.dataset.mode === mode); });
    if (level) level.textContent = LEVEL[mode];
  }
  buttons.forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });
  if (steps[0]) steps[0].classList.add("is-on");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setMode(e.target.dataset.mode); });
    }, { rootMargin: "-55% 0px -30% 0px" });
    steps.forEach(function (s) { io.observe(s); });
  }

  // The closer look: tabs with arrow keys, each view opening from the centre over the last.
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"][data-view]'));
  var views = Array.prototype.slice.call(document.querySelectorAll(".view"));
  var panel = document.getElementById("view-panel");
  function choose(i, focus) {
    var current = views.filter(function (v) { return v.classList.contains("is-on"); })[0];
    if (current === views[i]) return;
    views.forEach(function (v) { v.classList.remove("was-on"); });
    if (current) {
      current.classList.add("was-on");
      setTimeout(function () { current.classList.remove("was-on"); }, 950);
    }
    views.forEach(function (v, n) {
      v.classList.toggle("is-on", n === i);
      if (n === i) v.removeAttribute("aria-hidden"); else v.setAttribute("aria-hidden", "true");
    });
    tabs.forEach(function (t, n) {
      t.setAttribute("aria-selected", String(n === i));
      t.tabIndex = n === i ? 0 : -1;
    });
    if (panel) panel.setAttribute("aria-labelledby", tabs[i].id);
    if (focus) tabs[i].focus();
  }
  // Load every view once the viewer is near, so a view never opens onto an empty frame.
  if (panel && "IntersectionObserver" in window) {
    var near = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      views.forEach(function (v) { var img = v.querySelector("img"); if (img) img.loading = "eager"; });
      near.disconnect();
    }, { rootMargin: "600px 0px" });
    near.observe(panel);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { choose(i, false); });
    t.addEventListener("keydown", function (e) {
      var next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      choose((next + tabs.length) % tabs.length, true);
    });
  });

  // The buy bar (and the price in the header) once the hero has scrolled away.
  var hero = document.getElementById("top");
  var bar = document.getElementById("buybar");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      var past = !entries[0].isIntersecting;
      if (past) document.documentElement.dataset.pastHero = ""; else delete document.documentElement.dataset.pastHero;
      if (bar) {
        bar.setAttribute("aria-hidden", String(!past));
        var link = bar.querySelector("a");
        if (link) link.tabIndex = past ? 0 : -1;
      }
    }, { threshold: 0.05 }).observe(hero);
  }

  // Pre-order: check the address, then say honestly that nothing was sent.
  var form = document.getElementById("order");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("order-email");
      var finish = document.getElementById("order-finish");
      var msg = document.getElementById("order-msg");
      var ok = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.value.trim());
      email.setAttribute("aria-invalid", String(!ok));
      msg.textContent = ok ? "Thanks. A pair in " + finish.value + " would be held for " + email.value.trim() + ", but this is a sample page, so nothing was sent or charged." : "Enter an email address like name@example.com.";
      if (!ok) email.focus();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Tessel Hush: design

Design read: a launch page for one product, over-ear headphones from a small audio brand in Colombo, for people who commute and work in noise; told like a flagship launch, one idea per screen, light with one dark chapter. Built on the Farbaek Studio kit.

## Look

The kit's signal look, tuned: a soft grey paper, white raised sections, big 24px and 40px corners, a wide display face at medium weight.

## Palette

- \`--paper\` #f4f4f6 and \`--paper-2\` #ffffff.
- \`--ink\` #0b0b0f and \`--ink-2\` #5a5a66.
- \`--accent\` #ffcd2e, sun yellow from the product photos, only as a surface: buttons, the active mode, the wave. Ink text on it.
- \`--accent-2\` #ff8a3d, warm orange, for the wave's gradient and the glow.

## Type

Unbounded at 500 for headlines and numbers, set tight; Albert Sans for everything else. Footnote markers are small, linked and numbered.

## Layout

A centred hero: the product name, a giant claim, the lead and two pills, then the product huge in a tilting frame with a price chip. One dark chapter with a sticky stage and three steps. A closer-look viewer with four views. Specs as big numbers, then a list. A quote, the pre-order band, questions, footnotes and a footer with the wordmark. On phones a buy bar follows once the hero is gone.

## Signature

The sound chapter: a Farbaek Scenes particle field behind a live wave that settles from Off to Aware to Hush as you scroll, or as you press the modes.

## Motion

The claim rises word by word, the product floats and tilts toward the pointer, the wave pulses and settles by mode, views open from the centre, the specs count up, the buy bar slides in. All of it stops under reduced motion.

## Media

Four real product photos marked as placeholders: the hero and the views. Replace them with the product's own in Studio. The particle field takes its colours from the brand.

## Avoid

Superlatives without a source, claims without a footnote, a fake countdown, a buy button that pretends to charge.
`;

const README = `# Tessel Hush launch page (template)

A static site on the Farbaek Studio kit: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Make it yours

1. Change the product, the claim, the three modes, the specs and the footnotes in \`index.html\`. Every claim with a number keeps its footnote.
2. Tune the colours and fonts at the top of \`styles.css\`, and update \`DESIGN.md\`.
3. Replace each photo marked as a placeholder with your own (Studio's Replace does it in a click).

The quote, figures and prices are samples. The pre-order form doesn't send anything until it's connected.
`;

export const LANDING_PAGE_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];

/**
 * Template: a boutique hotel and spa, the premium direction for luxury
 * businesses (ADR 0158): hotels, resorts, spas, villas, real estate and
 * jewellery. Built on the Farbaek Studio kit in its noir look, with real
 * hotel, spa and dining photos in replaceable slots, the suites floating on
 * a Farbaek Scenes gallery arc as its 3D signature, and an enquiry form that
 * checks itself and says plainly that it doesn't send yet. Sample content.
 */
import { KIT_URL } from "@/core/media/library";
import { photoUrl } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "../types";

const photo = (id: string, w: number, h: number, slot: string, alt: string, lazy = true) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} data-farbaek-media="${slot}" data-farbaek-placeholder />`;

const SUITES = [
  { id: "1618773928121-c32242e63f39", name: "Garden Suite", note: "42 m², a terrace onto the frangipani", price: "68,000", alt: "A white bed with soft linen and cushions" },
  { id: "1611892440504-42a792e24d32", name: "Lagoon Room", note: "36 m², teak floors, lagoon light", price: "54,000", alt: "A hotel bedroom with a wooden bed and teal cushions" },
  { id: "1578683010236-d716f9a3f461", name: "Ocean Pavilion", note: "64 m², a lounge and an outdoor bath", price: "96,000", alt: "A suite with a wide bed beside a sectional sofa" },
  { id: "1564078516393-cf04bd966897", name: "Reading Loft", note: "38 m², a chaise by the window", price: "58,000", alt: "A grey chaise beside a tall window" },
  { id: "1582719478250-c89cae4dc85b", name: "Courtyard Room", note: "30 m², a quiet inner garden", price: "46,000", alt: "A bed with white linen and a wooden frame" },
];

const suiteCards = SUITES.map(
  (s, i) => `          <article class="fs-card" data-fs-reveal>
            <div class="fs-frame" data-fs-tilt="5">${photo(s.id, 1200, 900, `suite-${i + 1}`, s.alt)}</div>
            <h3 class="fs-h3">${s.name}</h3>
            <div class="fs-card__meta"><span>${s.note}</span><span>from LKR ${s.price}</span></div>
          </article>`,
).join("\n");

const galleryImages = SUITES.map((s) => `            <img src="${photoUrl(s.id, 900, 1100)}" alt="" loading="lazy" />`).join("\n");

const INDEX = `<!doctype html>
<html lang="en" data-fs-look="noir">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Halcyon House, a hotel and spa by the sea near Galle</title>
    <meta name="description" content="Twelve suites, a spa in the old cinnamon store and a table that follows the morning catch, eighteen minutes from Galle Fort." />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&amp;family=Manrope:wght@400;500;600&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="fs-skip" href="#main">Skip to content</a>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="#top">Halcyon House</a>
      <ul class="fs-nav__links">
        <li><a href="#suites">Suites</a></li>
        <li><a href="#spa">Spa</a></li>
        <li><a href="#dining">Dining</a></li>
      </ul>
      <a class="fs-btn" href="#stay">Check availability <span class="fs-btn__icon" aria-hidden="true"></span></a>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="#suites">Suites</a>
      <a href="#spa">Spa</a>
      <a href="#dining">Dining</a>
      <a href="#stay">Check availability</a>
    </nav>

    <main id="main">
      <section class="fs-hero hero" id="top">
        <div class="fs-hero__media">
          ${photo("1693934304978-22274e6a3276", 2200, 1400, "hero-photo", "A long pool beside a lush green hillside", false)}
        </div>
        <div class="fs-container">
          <div class="fs-hero__content">
            <h1 class="fs-display" data-fs-reveal="words">Stay where the sea <em>slows</em> down.</h1>
            <p class="fs-lead" data-fs-reveal>Twelve suites, a spa in the old cinnamon store and a table that follows the morning catch.</p>
            <div class="fs-actions" data-fs-reveal>
              <a class="fs-btn" href="#stay">Check availability <span class="fs-btn__icon" aria-hidden="true"></span></a>
              <a class="fs-link" href="#suites">See the suites</a>
            </div>
            <div class="fs-hero__meta" data-fs-reveal>
              <p><strong>12 suites</strong>no two alike</p>
              <p><strong>18 minutes</strong>from Galle Fort</p>
              <p><strong>A private cove</strong>at the end of the garden</p>
            </div>
          </div>
        </div>
      </section>

      <section class="fs-section intro">
        <div class="fs-container fs-head fs-head--split">
          <h2 class="fs-h2" data-fs-reveal>A house first, a hotel second.</h2>
          <p class="fs-lead" data-fs-reveal>Built in 1912 for a cinnamon trader and opened to guests a century later. The staff know your name by the second morning, and the kitchen knows how you take your tea.</p>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="suites" aria-labelledby="suites-title">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" id="suites-title" data-fs-reveal>The suites</h2>
            <p class="fs-lead" data-fs-reveal>Each one faces the garden or the water. Breakfast on your terrace is part of every stay.</p>
          </div>
          <div class="arc" data-farbaek-scene="gallery" data-farbaek-media="suites-scene" data-tone="dark" aria-hidden="true">
${galleryImages}
          </div>
          <div class="fs-mosaic" data-fs-stagger>
${suiteCards}
          </div>
          <p class="fs-small rates">Sample rates per night for two, breakfast included.</p>
        </div>
      </section>

      <section class="fs-section" id="spa">
        <div class="fs-container fs-split">
          <div class="fs-frame" data-fs-reveal="mask">
            ${photo("1600334089648-b0d9d3028eb2", 1100, 1375, "spa-photo", "A guest resting on a massage table with smooth black stones")}
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" data-fs-reveal>The spa in the cinnamon store.</h2>
            <p class="fs-lead" data-fs-reveal>Three treatment rooms under the old timber roof, with oils pressed on the estate and a plunge pool in the courtyard.</p>
            <ul class="fs-list" data-fs-stagger>
              <li data-fs-reveal>Ninety-minute warm stone ritual</li>
              <li data-fs-reveal>Ayurvedic consultations each morning</li>
              <li data-fs-reveal>Open to guests from 8 am to 9 pm</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="fs-section" id="dining">
        <div class="fs-container fs-split fs-split--reverse">
          <div class="fs-frame" data-fs-reveal="mask">
            ${photo("1414235077428-338989a2e8c0", 1100, 1375, "dining-photo", "A plated dish on a white ceramic plate")}
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" data-fs-reveal>A table that follows the boats.</h2>
            <p class="fs-lead" data-fs-reveal>The menu is written after the fishermen come in. Dinner is served on the lawn, under the rain trees, by lantern.</p>
            <div class="fs-actions" data-fs-reveal><a class="fs-link" href="#stay">Ask about private dinners</a></div>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised">
        <div class="fs-container">
          <figure class="fs-quote" data-fs-reveal>
            <blockquote>We came for three nights and changed our flights home twice.</blockquote>
            <figcaption><span>Anna and Joel, Copenhagen</span><span class="fs-sample">Sample quote</span></figcaption>
          </figure>
        </div>
      </section>

      <section class="fs-section" id="stay" aria-labelledby="stay-title">
        <div class="fs-container fs-split">
          <div class="fs-split__text">
            <h2 class="fs-h2" id="stay-title" data-fs-reveal>Check availability</h2>
            <p class="fs-lead" data-fs-reveal>Tell us your dates and we'll reply within the day with the suites that are free.</p>
            <div class="fs-faq" data-fs-reveal>
              <details><summary>When can we check in?</summary><p>From 2 pm, and we'll hold your bags from the morning. Check-out is at noon.</p></details>
              <details><summary>Do you welcome children?</summary><p>Children over twelve are welcome in every suite. The Garden Suite takes an extra bed.</p></details>
              <details><summary>How do we get here?</summary><p>We can collect you from Colombo or the airport. The drive takes about two hours on the expressway.</p></details>
            </div>
          </div>
          <form class="enquiry" id="enquiry" novalidate data-fs-reveal>
            <div class="row">
              <label>Arrival<input type="date" name="arrive" required /></label>
              <label>Departure<input type="date" name="leave" required /></label>
            </div>
            <label>Guests
              <select name="guests"><option>1</option><option selected>2</option><option>3</option><option>4</option></select>
            </label>
            <label>Your name<input type="text" name="name" autocomplete="name" required /></label>
            <label>Email<input type="email" name="email" autocomplete="email" required /></label>
            <label>Anything we should know<textarea name="note" rows="3"></textarea></label>
            <button class="fs-btn" type="submit">Send the enquiry <span class="fs-btn__icon" aria-hidden="true"></span></button>
            <p class="fs-small" id="enquiry-msg" role="status">A sample form. It checks your details but doesn't send anything yet.</p>
          </form>
        </div>
      </section>

      <section class="fs-section">
        <div class="fs-container">
          <div class="fs-cta" data-fs-reveal="scale">
            <h2 class="fs-h2">The cove is quiet in May.</h2>
            <p class="fs-lead">Stay four nights between May and July and the fourth is on us. A sample offer.</p>
            <div class="fs-actions"><a class="fs-btn" href="#stay">Plan a stay <span class="fs-btn__icon" aria-hidden="true"></span></a></div>
          </div>
        </div>
      </section>
    </main>

    <footer class="fs-footer">
      <div class="fs-container">
        <div class="fs-footer__grid">
          <div><h2>Find us</h2><p>Halcyon House<br />Unawatuna Road, near Galle</p></div>
          <div><h2>Stay</h2><ul><li><a href="#suites">Suites</a></li><li><a href="#spa">Spa</a></li><li><a href="#dining">Dining</a></li></ul></div>
          <div><h2>Talk to us</h2><ul><li><a href="#stay">Check availability</a></li><li><a href="tel:+94910000000">+94 91 000 0000</a></li></ul></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span id="year">2026</span> Halcyon House. A sample site.</span><span>Rates and offers are samples</span></div>
        <div class="fs-wordmark" aria-hidden="true">Halcyon</div>
      </div>
    </footer>

    <script type="module" src="${KIT_URL}"></script>
    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const STYLES = `/* Halcyon House: the brand on top of the Farbaek Studio kit. The decisions are in DESIGN.md. */
:root {
  --accent: #d9bf8c;
  --accent-2: #4f8a83;
  --on-accent: #17130c;
  --ink: #f2eee6;
  --ink-2: #a9a499;
  --paper: #0d0e0d;
  --paper-2: #161816;
  --line: rgb(242 238 230 / 0.12);
  --font-display: "Cormorant Garamond", Georgia, serif;
  --font-body: "Manrope", ui-sans-serif, system-ui, sans-serif;
  --radius: 4px;
  --radius-lg: 6px;
  --fs-display-weight: 500;
  --fs-display-track: -0.015em;
}

.fs-display { font-size: clamp(48px, 8vw, 132px); }
.fs-display em, .fs-h2 em { font-style: italic; color: var(--accent); }
.fs-nav__brand { font-family: var(--font-display); font-size: 22px; letter-spacing: 0.02em; }

/* The hero photo darkens toward the text, and drifts slowly. */
.hero .fs-hero__media::after { background: linear-gradient(90deg, rgb(13 14 13 / 0.7) 0%, rgb(13 14 13 / 0.25) 50%, transparent 75%), linear-gradient(180deg, rgb(13 14 13 / 0.45) 0%, rgb(13 14 13 / 0.1) 40%, rgb(13 14 13 / 0.92) 100%); }

/* The suites on a 3D arc. Until the scene runs (and under reduced motion) the photos sit fanned out. */
.arc { position: relative; height: clamp(320px, 46vw, 560px); margin: 8px 0 56px; border-radius: var(--radius-lg); overflow: hidden; background: radial-gradient(60% 70% at 50% 60%, rgb(217 191 140 / 0.12), transparent 70%); }
.arc > img { position: absolute; top: 50%; left: 50%; width: 26%; aspect-ratio: 4 / 5; height: auto; object-fit: cover; border-radius: 4px; box-shadow: 0 30px 60px -24px rgb(0 0 0 / 0.7); transform: translate(-50%, -50%) rotate(var(--r)) translateX(var(--x)); }
.arc > img:nth-child(1) { --x: -150%; --r: -8deg; }
.arc > img:nth-child(2) { --x: -75%; --r: -4deg; }
.arc > img:nth-child(3) { --x: 0%; --r: 0deg; z-index: 1; }
.arc > img:nth-child(4) { --x: 75%; --r: 4deg; }
.arc > img:nth-child(5) { --x: 150%; --r: 8deg; }
.arc[data-farbaek-scene-state="running"] > img, .arc[data-farbaek-scene-state="paused"] > img { visibility: hidden; }
.rates { margin-top: 20px; }

.enquiry { display: grid; gap: 16px; padding: clamp(24px, 4vw, 40px); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--paper-2); }
.enquiry .row { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
.enquiry label { display: grid; gap: 8px; font-size: 14px; color: var(--ink-2); }
.enquiry input, .enquiry select, .enquiry textarea { width: 100%; min-height: 48px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); color: var(--ink); font: 400 16px/1.4 var(--font-body); color-scheme: dark; }
.enquiry input:focus-visible, .enquiry select:focus-visible, .enquiry textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.enquiry [aria-invalid="true"] { border-color: #e48a7a; }
.enquiry .fs-btn { justify-self: start; }
#enquiry-msg.done { color: var(--accent); }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

@media (prefers-reduced-motion: no-preference) {
  .hero .fs-hero__media > img { animation: drift 24s ease-in-out infinite alternate; }
  @keyframes drift { to { transform: scale(1.08) translateY(-1.5%); } }
}
@media (prefers-reduced-motion: reduce) {
  .hero .fs-hero__media > img { transform: none; }
}
`;

const SCRIPT = `// Halcyon House: the enquiry form checks itself and says plainly that it doesn't send yet.
// The page is complete without this file; the Studio kit does the motion.
(function () {
  var form = document.getElementById("enquiry");
  var msg = document.getElementById("enquiry-msg");
  if (form && msg) {
    var today = new Date().toISOString().slice(0, 10);
    form.arrive.min = today;
    form.leave.min = today;
    form.arrive.addEventListener("change", function () { form.leave.min = form.arrive.value || today; });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var problems = [];
      ["arrive", "leave", "name", "email"].forEach(function (n) {
        var field = form[n];
        var bad = !field.value.trim() || (n === "email" && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(field.value));
        field.setAttribute("aria-invalid", String(bad));
        if (bad) problems.push(field.closest("label").firstChild.textContent.trim().toLowerCase());
      });
      if (!problems.length && form.leave.value <= form.arrive.value) {
        form.leave.setAttribute("aria-invalid", "true");
        problems.push("a departure after your arrival");
      }
      msg.classList.toggle("done", problems.length === 0);
      msg.textContent = problems.length
        ? "Please add " + problems.join(", ") + "."
        : "Thank you. Your details look right, but this sample form doesn't send anything yet.";
      if (problems.length) form.querySelector('[aria-invalid="true"]').focus();
    });
  }
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Halcyon House: design

Design read: a boutique hotel and spa on the south coast for couples who plan a trip around where they stay; quiet, dark and editorial, built on the Farbaek Studio kit.

## Look

The kit's noir look: near-black rooms, champagne light, almost square corners.

## Palette

- \`--paper\` #0d0e0d and \`--paper-2\` #161816, two depths of night.
- \`--ink\` #f2eee6, warm white, and \`--ink-2\` #a9a499 for quieter text.
- \`--accent\` #d9bf8c, champagne, for actions, the italic word and focus.
- \`--accent-2\` #4f8a83, lagoon green, for the glow behind the closing call.

## Type

Cormorant Garamond at a large size for headlines, the only place a serif belongs here; Manrope for everything else. Headlines stay short.

## Layout

A full-screen photo hero with three facts; a two-column introduction; the suites on a 3D arc above a mosaic of suite cards with rates; split sections for the spa and the dining; a quote; an enquiry form beside the questions guests ask; a seasonal offer; a footer with a large wordmark.

## Signature

The suites floating on a curved arc, a Farbaek Scenes gallery built from the suite photos, turning slowly with the pointer. Without WebGL the same photos sit fanned out.

## Motion

The headline rises word by word and the hero photo drifts slowly; sections and cards rise in once; photos unmask; suite photos tilt toward the pointer. All of it stops under reduced motion.

## Media

Real hotel, spa and dining photos, each marked as a placeholder: the pool, five suites, the treatment room and a plated dish. Replace each with the property's own in Studio.

## Avoid

Gold gradients, script fonts, stock couples on beds, star ratings that aren't real, and offers presented as real.
`;

const README = `# Halcyon House hotel and spa site (template)

A static site on the Farbaek Studio kit: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Make it yours

1. Change the name, suites, rates, spa and dining in \`index.html\`. The same five suite photos feed the 3D arc and the cards.
2. Tune the colours and fonts at the top of \`styles.css\`, and update \`DESIGN.md\`.
3. Replace each photo marked as a placeholder with your own (Studio's Replace does it in a click).
4. Connect the enquiry form to your email or booking system before you rely on it: today it checks the details and says it doesn't send.

The rates, offer, quote and contact details are samples.
`;

export const LUXURY_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];

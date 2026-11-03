/**
 * Template: a bakery and café, the premium direction for food businesses
 * (ADR 0158): built on the Farbaek Studio kit with real bakery photos in
 * replaceable slots, a tilted "today's bake" card as its 3D moment, a live
 * "open now" status worked out from the opening hours, a menu you can
 * filter, and choreographed kit motion. Sample content throughout; complete
 * without JavaScript.
 */
import { photoUrl } from "@/core/media/photos";
import { KIT_URL } from "@/core/media/library";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "../types";

const photo = (id: string, w: number, h: number, slot: string, alt: string, lazy = true) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} data-farbaek-media="${slot}" data-farbaek-placeholder />`;

type Kind = "bread" | "pastry" | "coffee";
const MENU: { kind: Kind; name: string; desc: string; price: string }[] = [
  { kind: "bread", name: "Country sourdough", desc: "Forty-eight hour ferment, dark crust, open crumb.", price: "950" },
  { kind: "bread", name: "Milk bread loaf", desc: "Soft, sliceable, the one children ask for.", price: "650" },
  { kind: "bread", name: "Seeded rye", desc: "Sunflower, flax and a little treacle.", price: "1,050" },
  { kind: "pastry", name: "Butter croissant", desc: "Laminated over three days, shatters properly.", price: "480" },
  { kind: "pastry", name: "Cardamom bun", desc: "Knotted, sugared, best before ten.", price: "520" },
  { kind: "pastry", name: "Kithul custard tart", desc: "Burnt top, kithul treacle custard.", price: "560" },
  { kind: "coffee", name: "Flat white", desc: "Hill-country beans, double ristretto.", price: "720" },
  { kind: "coffee", name: "Iced kithul latte", desc: "Cold milk, espresso, a ribbon of treacle.", price: "820" },
];
const KIND_LABEL: Record<Kind, string> = { bread: "Bread", pastry: "Pastry", coffee: "Coffee" };

const menuItems = MENU.map(
  (m) => `            <li class="dish" data-kind="${m.kind}">
              <div><h3>${m.name}</h3><p>${m.desc}</p></div>
              <span class="dish__price"><span class="fs-sr">${KIND_LABEL[m.kind]}, </span>Rs. ${m.price}</span>
            </li>`,
).join("\n");

// Opening hours: [day, opens, closes], Monday first. data-day uses JavaScript's numbering (Sunday is 0).
const HOURS = [
  ["Monday", "06:30", "19:00"],
  ["Tuesday", "06:30", "19:00"],
  ["Wednesday", "06:30", "19:00"],
  ["Thursday", "06:30", "19:00"],
  ["Friday", "06:30", "20:00"],
  ["Saturday", "07:00", "20:00"],
  ["Sunday", "07:00", "14:00"],
] as const;
const pretty = (t: string) => {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `.${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
};
const hoursRows = HOURS.map(
  ([day, open, close], i) => `                <tr data-day="${(i + 1) % 7}" data-open="${open}" data-close="${close}"><th scope="row">${day}</th><td>${pretty(open)} to ${pretty(close)}</td></tr>`,
).join("\n");

const bake = (id: string, slot: string, title: string, note: string, alt: string) => `          <a class="fs-card" href="#menu" data-fs-reveal>
            <div class="fs-frame" data-fs-tilt="4">${photo(id, 1200, 900, slot, alt)}</div>
            <h3 class="fs-h3">${title}</h3>
            <div class="fs-card__meta"><span>${note}</span><span aria-hidden="true">See the menu</span></div>
          </a>`;

const INDEX = `<!doctype html>
<html lang="en" data-fs-look="atelier">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kiln &amp; Crumb, bakery and coffee in Kandy</title>
    <meta name="description" content="Sourdough, laminated pastry and hill-country coffee, baked from four every morning on Peradeniya Road, Kandy." />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Young+Serif&amp;family=Instrument+Sans:wght@400;500;600&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="fs-skip" href="#main">Skip to content</a>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="#top"><span class="mark" aria-hidden="true"></span>Kiln &amp; Crumb</a>
      <ul class="fs-nav__links">
        <li><a href="#bakes">Today's bakes</a></li>
        <li><a href="#menu">Menu</a></li>
        <li><a href="#visit">Visit</a></li>
      </ul>
      <a class="fs-btn" href="#order">Order a cake <span class="fs-btn__icon" aria-hidden="true"></span></a>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="#bakes">Today's bakes</a>
      <a href="#menu">Menu</a>
      <a href="#visit">Visit</a>
      <a href="#order">Order a cake</a>
    </nav>

    <main id="main">
      <section class="fs-hero hero" id="top">
        <div class="fs-hero__media">
          ${photo("1509440159596-0249088772ff", 2000, 1300, "hero-photo", "Three rustic loaves with sunflower seeds and wheat on a wooden board", false)}
        </div>
        <div class="fs-container hero__grid">
          <div class="fs-hero__content">
            <p class="status" id="status"><span class="beacon" aria-hidden="true"></span><span id="status-text">Open every day from 6.30 am</span></p>
            <h1 class="fs-display" data-fs-reveal="words">Bread worth getting up for.</h1>
            <p class="fs-lead" data-fs-reveal>Sourdough, laminated pastry and hill-country coffee, baked from four every morning on Peradeniya Road.</p>
            <div class="fs-actions" data-fs-reveal>
              <a class="fs-btn" href="#bakes">See today's bakes <span class="fs-btn__icon" aria-hidden="true"></span></a>
              <a class="fs-link" href="#visit">Find us in Kandy</a>
            </div>
          </div>
          <div class="fs-float">
          <aside class="ticket" data-fs-tilt="8" aria-label="Today's bake">
            <p class="ticket__label">Out of the oven at</p>
            <p class="ticket__time">7.00 am</p>
            <p class="ticket__what">Country sourdough, still warm</p>
            <p class="ticket__note">Sample times</p>
          </aside>
          </div>
        </div>
      </section>

      <section class="fs-section strip" aria-label="How we bake">
        <div class="fs-container">
          <div class="fs-stats" data-fs-stagger>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>48</span><span class="fs-stat__label">hours each sourdough ferments before it meets the oven</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num">4.00</span><span class="fs-stat__label">am, when the first ovens are lit</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>14</span><span class="fs-stat__label">breads and pastries on the counter each day</span></div>
          </div>
          <p class="fs-small strip__note">Sample figures. Replace them with yours.</p>
        </div>
      </section>

      <section class="fs-section" id="story">
        <div class="fs-container fs-split">
          <div class="fs-frame" data-fs-reveal="mask">
            ${photo("1517686469429-8bdb88b9f907", 1100, 1375, "story-photo", "A baker rolling dough with a wooden rolling pin")}
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" data-fs-reveal>Slow dough, <em>early</em> ovens.</h2>
            <p class="fs-lead" data-fs-reveal>We mix in the afternoon, shape at night and bake before the city wakes. Nothing on the counter is older than this morning.</p>
            <ul class="fs-list" data-fs-stagger>
              <li data-fs-reveal>Flour milled in small batches, no improvers</li>
              <li data-fs-reveal>Butter croissants laminated over three days</li>
              <li data-fs-reveal>Coffee roasted twice a week in the hills</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="bakes">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" data-fs-reveal>Today on the counter</h2>
            <p class="fs-lead" data-fs-reveal>Come early for croissants. The sourdough usually lasts until noon.</p>
          </div>
          <div class="fs-mosaic" data-fs-stagger>
${bake("1568254183919-78a4f43a2877", "bakes-1", "The bread wall", "Eight loaves daily", "Loaves of bread on wooden display shelves")}
${bake("1555507036-ab1f4038808a", "bakes-2", "Butter croissants", "From 7 am", "Two golden croissants")}
${bake("1534432182912-63863115e106", "bakes-3", "Pastry case", "Changes daily", "Pastries and a crumb cake in a bakery display")}
${bake("1598373182133-52452f7691ef", "bakes-4", "Milk bread", "Sliced to order", "A sliced loaf of soft white bread on a board")}
${bake("1549413468-cd78edb7e75c", "bakes-5", "Seeded rye", "Fridays", "A crusty baked loaf on jute")}
          </div>
        </div>
      </section>

      <section class="fs-section" id="menu" aria-labelledby="menu-title">
        <div class="fs-container menu">
          <div class="fs-head">
            <h2 class="fs-h2" id="menu-title" data-fs-reveal>The menu</h2>
            <div class="chips" role="group" aria-label="Filter the menu">
              <button type="button" aria-pressed="true" data-filter="all">Everything</button>
              <button type="button" aria-pressed="false" data-filter="bread">Bread</button>
              <button type="button" aria-pressed="false" data-filter="pastry">Pastry</button>
              <button type="button" aria-pressed="false" data-filter="coffee">Coffee</button>
            </div>
          </div>
          <ul class="dishes" id="dishes" data-fs-reveal>
${menuItems}
          </ul>
          <p class="fs-small">Sample prices in Sri Lankan rupees.</p>
        </div>
      </section>

      <section class="fs-section fs-section--raised">
        <div class="fs-container">
          <figure class="fs-quote" data-fs-reveal>
            <blockquote>The croissants are the reason I leave for work twenty minutes early.</blockquote>
            <figcaption>
              ${photo("1495474472287-4d71bcdd2085", 96, 96, "quote-photo", "Friends holding coffee cups")}
              <span>Dilini, a regular since the first winter</span>
              <span class="fs-sample">Sample quote</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section class="fs-section" id="visit" aria-labelledby="visit-title">
        <div class="fs-container fs-split fs-split--reverse">
          <div class="fs-frame" data-fs-reveal="mask">
            ${photo("1567880905822-56f8e06fe630", 1100, 1375, "visit-photo", "The café interior with a curved counter")}
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" id="visit-title" data-fs-reveal>Come by the bakery.</h2>
            <p class="fs-lead" data-fs-reveal>142 Peradeniya Road, Kandy. Ten seats inside, three on the step, parking behind the pharmacy.</p>
            <div class="fs-actions" data-fs-reveal>
              <a class="fs-btn fs-btn--ghost" href="tel:+94810000000">Call +94 81 000 0000 <span class="fs-btn__icon" aria-hidden="true"></span></a>
              <button class="fs-link copy" type="button" id="copy-address" data-address="Kiln &amp; Crumb, 142 Peradeniya Road, Kandy">Copy the address</button>
            </div>
            <p class="fs-small" id="copy-msg" role="status">A sample address and phone number.</p>
            <table class="hours" id="hours">
              <caption class="fs-sr">Opening hours</caption>
              <tbody>
${hoursRows}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="fs-section" aria-labelledby="faq-title">
        <div class="fs-container fs-split fs-split--wide">
          <div class="fs-faq" data-fs-reveal>
            <details><summary>Can I order a loaf for tomorrow?</summary><p>Yes. Call before 3 pm and we'll keep one under your name until noon.</p></details>
            <details><summary>Do you bake anything without gluten?</summary><p>Our flourless chocolate cake and almond cookies are made without wheat, in a kitchen that uses flour, so they aren't safe for coeliacs.</p></details>
            <details><summary>Do you supply cafés and hotels?</summary><p>We bake for six places in Kandy. Ask for the wholesale list and we'll bring a tasting box.</p></details>
          </div>
          <div class="fs-head">
            <h2 class="fs-h2" id="faq-title" data-fs-reveal>Good to know</h2>
            <p class="fs-lead" data-fs-reveal>Anything else, ask at the counter.</p>
          </div>
        </div>
      </section>

      <section class="fs-section" id="order">
        <div class="fs-container">
          <div class="fs-cta" data-fs-reveal="scale">
            <h2 class="fs-h2">A cake for the day that matters.</h2>
            <p class="fs-lead">Birthdays, weddings and the office on a Friday. Tell us the day and how many, three days ahead.</p>
            <div class="fs-actions">
              <a class="fs-btn" href="mailto:hello@kilnandcrumb.example">Order a cake <span class="fs-btn__icon" aria-hidden="true"></span></a>
              <span class="fs-small">A sample address. It doesn't send anything yet.</span>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="fs-footer">
      <div class="fs-container">
        <div class="fs-footer__grid">
          <div><h2>Visit</h2><p>142 Peradeniya Road<br />Kandy</p></div>
          <div><h2>Explore</h2><ul><li><a href="#bakes">Today's bakes</a></li><li><a href="#menu">Menu</a></li><li><a href="#visit">Opening hours</a></li></ul></div>
          <div><h2>Order</h2><ul><li><a href="#order">Celebration cakes</a></li><li><a href="tel:+94810000000">Call the bakery</a></li></ul></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span id="year">2026</span> Kiln &amp; Crumb. A sample site.</span><span>Baked in Kandy</span></div>
        <div class="fs-wordmark" aria-hidden="true">Kiln &amp; Crumb</div>
      </div>
    </footer>

    <script type="module" src="${KIT_URL}"></script>
    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const STYLES = `/* Kiln & Crumb: the brand on top of the Farbaek Studio kit. The decisions are in DESIGN.md. */
:root {
  --accent: #c76a1c;
  --accent-2: #2f5d50;
  --on-accent: #ffffff;
  --ink: #17231c;
  --ink-2: #4f5b53;
  --paper: #f6f6f1;
  --paper-2: #ffffff;
  --line: rgb(23 35 28 / 0.12);
  --font-display: "Young Serif", Georgia, serif;
  --font-body: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  --radius: 18px;
  --radius-lg: 30px;
  --fs-display-weight: 400;
  --fs-display-track: -0.02em;
}

.mark { width: 22px; height: 22px; border-radius: 50% 50% 46% 46%; background: radial-gradient(circle at 35% 30%, #f3b26a, var(--accent) 60%, #8a4510); box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.18); }
.fs-display em, .fs-h2 em { font-style: italic; color: var(--accent); }

/* The hero: the photo is warmed and darkened so white type reads on it. */
.hero { color: #fff; --ink: #fff; --ink-2: rgb(255 255 255 / 0.82); --line: rgb(255 255 255 / 0.22); }
.hero .fs-hero__media::after { background: linear-gradient(90deg, rgb(23 18 12 / 0.62) 0%, rgb(23 18 12 / 0.2) 55%, transparent 80%), linear-gradient(180deg, rgb(23 18 12 / 0.5) 0%, rgb(23 18 12 / 0.1) 35%, rgb(23 18 12 / 0.72) 100%); }
.hero .fs-link { color: #fff; }
.hero__grid { display: grid; gap: 40px; align-items: end; }
@media (min-width: 960px) { .hero__grid { grid-template-columns: 1fr auto; } }

.status { display: inline-flex; align-items: center; gap: 10px; width: fit-content; padding: 8px 14px; border-radius: 999px; background: rgb(255 255 255 / 0.14); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); font-size: 15px; }
.beacon { width: 9px; height: 9px; border-radius: 999px; background: #c9c9c9; }
.status.open .beacon { background: #5ad48a; box-shadow: 0 0 0 4px rgb(90 212 138 / 0.25); }
.status.closed .beacon { background: #f0a35b; }

.ticket { position: relative; width: min(100%, 280px); padding: 22px 24px; border-radius: var(--radius); background: var(--paper); color: var(--ink); box-shadow: 0 30px 60px -20px rgb(0 0 0 / 0.5); --ink: #17231c; --ink-2: #4f5b53; }
.ticket::before { content: ""; position: absolute; left: 0; right: 0; top: 64px; border-top: 1.5px dashed rgb(23 35 28 / 0.2); }
.ticket__label { font-size: 13px; color: var(--ink-2); }
.ticket__time { margin-top: 2px; font: 400 44px/1 var(--font-display); color: var(--accent); padding-top: 16px; }
.ticket__what { margin-top: 10px; font-weight: 600; }
.ticket__note { margin-top: 4px; font-size: 12px; color: var(--ink-2); }

.strip { padding-block: clamp(48px, 7vw, 88px); }
.strip__note { margin-top: 16px; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chips button { min-height: 44px; padding: 0 18px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink-2); font: 500 15px/1 var(--font-body); cursor: pointer; transition: background-color 160ms, color 160ms, border-color 160ms; }
.chips button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.dishes { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 0 48px; }
@media (min-width: 860px) { .dishes { grid-template-columns: 1fr 1fr; } }
.dish { display: flex; justify-content: space-between; gap: 24px; padding: 20px 0; border-top: 1px solid var(--line); }
.dish h3 { font: 400 22px/1.2 var(--font-display); }
.dish p { margin-top: 4px; color: var(--ink-2); font-size: 15px; }
.dish__price { white-space: nowrap; font-weight: 600; font-variant-numeric: tabular-nums; }

.copy { border: 0; background: none; padding: 0; cursor: pointer; font: inherit; }
.hours { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 15px; }
.hours th, .hours td { padding: 10px 0; border-top: 1px solid var(--line); text-align: left; font-weight: 400; }
.hours td { text-align: right; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.hours tr.today th, .hours tr.today td { color: var(--ink); font-weight: 600; }
.hours tr.today th::after { content: "Today"; margin-left: 10px; padding: 2px 8px; border-radius: 999px; background: color-mix(in oklab, var(--accent) 16%, transparent); color: var(--accent); font-size: 12px; font-weight: 600; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .ticket { transform: none; }
}
`;

const SCRIPT = `// Kiln & Crumb: the live opening status, the menu filter and copying the address.
// The page is complete without this file; the Studio kit does the motion.
(function () {
  var minutes = function (hhmm) { var p = hhmm.split(":"); return Number(p[0]) * 60 + Number(p[1]); };
  var pretty = function (hhmm) {
    var p = hhmm.split(":"), h = Number(p[0]), m = Number(p[1]);
    return (h % 12 === 0 ? 12 : h % 12) + (m ? "." + (m < 10 ? "0" : "") + m : "") + (h < 12 ? " am" : " pm");
  };

  // Open now? Worked out from the hours table, in the visitor's own time.
  function updateStatus() {
    var now = new Date();
    var rows = Array.prototype.slice.call(document.querySelectorAll("#hours tr"));
    var today = rows.filter(function (r) { return Number(r.dataset.day) === now.getDay(); })[0];
    var status = document.getElementById("status");
    var text = document.getElementById("status-text");
    if (!today || !status || !text) return;
    rows.forEach(function (r) { r.classList.toggle("today", r === today); });
    var t = now.getHours() * 60 + now.getMinutes();
    var open = minutes(today.dataset.open), close = minutes(today.dataset.close);
    status.classList.remove("open", "closed");
    if (t >= open && t < close) {
      status.classList.add("open");
      text.textContent = "Open now, until " + pretty(today.dataset.close);
    } else if (t < open) {
      status.classList.add("closed");
      text.textContent = "Closed now, opens at " + pretty(today.dataset.open);
    } else {
      var next = rows[(rows.indexOf(today) + 1) % rows.length];
      status.classList.add("closed");
      text.textContent = "Closed now, opens tomorrow at " + pretty(next.dataset.open);
    }
  }
  updateStatus();
  setInterval(updateStatus, 60000);

  // The menu filter.
  var chips = document.querySelectorAll("[data-filter]");
  var dishes = document.querySelectorAll(".dish");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var kind = chip.dataset.filter;
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      dishes.forEach(function (d) { d.hidden = !(kind === "all" || d.dataset.kind === kind); });
    });
  });

  // Copy the address, and say what happened.
  var copy = document.getElementById("copy-address");
  var msg = document.getElementById("copy-msg");
  if (copy && msg) {
    copy.addEventListener("click", function () {
      var address = copy.dataset.address;
      var done = function () { msg.textContent = "Copied. It's a sample address, so replace it with yours."; };
      var fail = function () { msg.textContent = "Couldn't copy here. The address is " + address + "."; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(address).then(done, fail);
      else fail();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Kiln & Crumb: design

Design read: a neighbourhood bakery and café in Kandy for early risers and office regulars, warm and crafted without the usual cream-and-brass, built on the Farbaek Studio kit.

## Look

The kit's atelier look, tuned warm: small radii softened to 18px, a serif display at regular weight.

## Palette

- \`--paper\` #f6f6f1, a cool flour white, and \`--paper-2\` #ffffff for raised sections.
- \`--ink\` #17231c, a bottle green near-black (the awning colour), \`--ink-2\` #4f5b53 for quieter text.
- \`--accent\` #c76a1c, crust amber, for actions, prices and the italic word in a headline.
- \`--accent-2\` #2f5d50, deep green, for the kit's glow and the CTA light.

## Type

Young Serif for headlines, at one weight, with restraint; Instrument Sans for everything else. Numbers are tabular in the menu and hours.

## Layout

A full-bleed photo hero with a live status and a ticket card; a strip of three facts; a split story; a mosaic of today's bakes; a filterable two-column menu; a quote; a visit section with the hours; questions; a cake-order call; a dense footer with the wordmark.

## Signature

The "out of the oven at" ticket floating over the hero, tilting toward the pointer in 3D. It carries the bakery's real rhythm: the time the first loaf comes out.

## Motion

The headline rises word by word, sections rise in once, framed photos unmask, the ticket floats and tilts, the counters count up. All of it stops under reduced motion.

## Media

Every photo is a real bakery or café photo marked as a placeholder: the hero loaves, the baker, five counter shots, the café interior. Replace each with the bakery's own in Studio.

## Avoid

Cream-and-brass, coffee-bean clip art, stock smiles, three equal feature cards, and any price or review presented as real.
`;

const README = `# Kiln & Crumb bakery site (template)

A static site on the Farbaek Studio kit: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Make it yours

1. Change the name, address, phone, hours and menu in \`index.html\`. The hours table drives the "open now" status.
2. Tune the colours and fonts at the top of \`styles.css\`, and update \`DESIGN.md\`.
3. Replace each photo marked as a placeholder with your own (Studio's Replace does it in a click).

The prices, figures, quote and contact details are samples.
`;

export const LOCAL_BUSINESS_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];

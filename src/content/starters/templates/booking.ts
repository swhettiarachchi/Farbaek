/**
 * Template: a hair studio and barbers, the premium direction for bookings
 * (ADR 0163): salons, barbers, clinics, studios and anyone who sells time.
 * Built on the Farbaek Studio kit, light by default, with real salon photos
 * in replaceable slots. Choose a service and a stylist, a day on a ribbon of
 * the next two weeks and an open time worked out from the hours; a summary
 * follows along, the booking is kept in this browser and can be added to a
 * calendar. The 3D moment is the "next chair free" card, worked out live.
 * Sample content; nothing is sent, and the page says so.
 */
import { photoUrl } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "../types";

const photo = (id: string, w: number, h: number, slot: string, alt: string, lazy = true) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} data-farbaek-media="${slot}" data-farbaek-placeholder />`;

type Kind = "cut" | "colour" | "barber" | "care";
const KIND_LABEL: Record<Kind, string> = { cut: "Cutting", colour: "Colour", barber: "Barbering", care: "Care" };
const SERVICES: { id: string; kind: Kind; name: string; minutes: number; price: number; note: string }[] = [
  { id: "cut", kind: "cut", name: "Cut and finish", minutes: 45, price: 4500, note: "A consultation, a wash, the cut and a finish you can do yourself." },
  { id: "restyle", kind: "cut", name: "Restyle", minutes: 75, price: 6500, note: "Something new: we talk it through before the scissors come out." },
  { id: "gloss", kind: "colour", name: "Gloss", minutes: 45, price: 5500, note: "Shine and a softer tone, with no line as it grows." },
  { id: "colour", kind: "colour", name: "Full colour", minutes: 120, price: 12000, note: "Root to tip, with a strand test a day before." },
  { id: "fade", kind: "barber", name: "Skin fade", minutes: 40, price: 3000, note: "Clippers and a straight-razor line, finished with balm." },
  { id: "shave", kind: "barber", name: "Hot towel shave", minutes: 30, price: 2500, note: "Two hot towels, a straight razor and a cold one to close." },
  { id: "blowdry", kind: "care", name: "Wash and blow-dry", minutes: 40, price: 3500, note: "For the night out, the wedding or the photo." },
];
const rs = (n: number) => `Rs. ${n.toLocaleString("en-US")}`;

const serviceCards = SERVICES.map(
  (s, i) => `              <label class="service" data-kind="${s.kind}">
                <input type="radio" name="service" value="${s.id}" data-name="${s.name}" data-minutes="${s.minutes}" data-price="${s.price}"${i === 0 ? " checked" : ""} />
                <span class="service__body">
                  <span class="service__top"><strong>${s.name}</strong><span class="service__price">${rs(s.price)}</span></span>
                  <span class="service__meta">${KIND_LABEL[s.kind]}, ${s.minutes} min</span>
                  <span class="service__note">${s.note}</span>
                </span>
              </label>`,
).join("\n");

const STYLISTS = [
  { id: "any", name: "Anyone free", role: "The first chair that's free", initials: "" },
  { id: "ishara", name: "Ishara", role: "Colour", initials: "I" },
  { id: "dinesh", name: "Dinesh", role: "Barbering", initials: "D" },
  { id: "mei", name: "Mei", role: "Cutting", initials: "M" },
];
const stylistCards = STYLISTS.map(
  (p, i) => `              <label class="stylist">
                <input type="radio" name="stylist" value="${p.id}" data-name="${p.name}"${i === 0 ? " checked" : ""} />
                <span class="stylist__face${p.initials ? "" : " stylist__face--any"}" aria-hidden="true">${p.initials}</span>
                <span><strong>${p.name}</strong><span class="stylist__role">${p.role}</span></span>
              </label>`,
).join("\n");

const work = (id: string, slot: string, title: string, note: string, alt: string) => `            <figure class="fs-card" data-fs-reveal>
              <div class="fs-frame" data-fs-tilt="4">${photo(id, 1200, 900, slot, alt)}</div>
              <figcaption class="fs-card__meta"><span>${title}</span><span>${note}</span></figcaption>
            </figure>`;

const INDEX = `<!doctype html>
<html lang="en" data-fs-look="signal">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mirror &amp; Comb, hair and barbering in Colombo</title>
    <meta name="description" content="Cuts, colour and straight-razor shaves on Galle Road, Colombo 3. See the times that are free and book a chair in a minute." />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@600;800&amp;family=Figtree:wght@400;500;600&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="fs-skip" href="#main">Skip to content</a>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="#top"><span class="mark" aria-hidden="true"></span>Mirror &amp; Comb</a>
      <ul class="fs-nav__links">
        <li><a href="#services">Services</a></li>
        <li><a href="#work">Our work</a></li>
        <li><a href="#visit">Visit</a></li>
      </ul>
      <a class="fs-btn" href="#book">Book a chair <span class="fs-btn__icon" aria-hidden="true"></span></a>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="#services">Services</a>
      <a href="#work">Our work</a>
      <a href="#visit">Visit</a>
      <a href="#book">Book a chair</a>
    </nav>

    <main id="main">
      <section class="fs-hero fs-hero--split hero" id="top">
        <div class="fs-glow" aria-hidden="true"></div>
        <div class="fs-container">
          <div class="fs-hero__content">
            <p class="hero__where">Galle Road, Colombo 3. Open Tuesday to Sunday</p>
            <h1 class="fs-display" data-fs-reveal="words">Good hair, on your time.</h1>
            <p class="fs-lead" data-fs-reveal>Cuts, colour and straight-razor shaves by four people who'd rather do one thing well than ten things fast. See what's free and book in a minute.</p>
            <div class="fs-actions" data-fs-reveal>
              <a class="fs-btn" href="#book">Book a chair <span class="fs-btn__icon" aria-hidden="true"></span></a>
              <a class="fs-link" href="#services">See services and prices</a>
            </div>
          </div>
          <div class="hero__media-wrap">
            <div class="fs-hero__media" data-fs-reveal="mask">
              ${photo("1580618672591-eb180b1a973f", 1100, 1375, "hero-photo", "A stylist finishing a client's hair with a round brush and a dryer", false)}
            </div>
            <div class="fs-float next-wrap">
              <aside class="next" data-fs-tilt="10" aria-labelledby="next-label">
                <p class="next__label" id="next-label">Next chair free</p>
                <p class="next__time" id="next-time">Today</p>
                <p class="next__what" id="next-what">Cut and finish, 45 min</p>
                <a class="next__book" href="#book">Take it</a>
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section class="fs-section strip" aria-label="Mirror and Comb in numbers">
        <div class="fs-container">
          <div class="fs-stats" data-fs-stagger>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>4</span><span class="fs-stat__label">chairs, and never more than four people waiting</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>9</span><span class="fs-stat__label">years on Galle Road</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>15</span><span class="fs-stat__label">minutes for a consultation, free, before any colour</span></div>
          </div>
          <p class="fs-small strip__note">Sample figures. Replace them with yours.</p>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="book" aria-labelledby="book-title">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" id="book-title" data-fs-reveal>Book a chair</h2>
            <p class="fs-lead" data-fs-reveal>Four steps, about a minute. Change your mind any time before you confirm.</p>
          </div>
          <form class="booking" id="booking" novalidate>
            <div class="booking__steps">
              <fieldset class="step" id="services">
                <legend><span class="step__n">1</span> Choose a service</legend>
                <div class="kinds" role="group" aria-label="Show services for">
                  <button type="button" aria-pressed="true" data-kind="all">Everything</button>
                  <button type="button" aria-pressed="false" data-kind="cut">Cutting</button>
                  <button type="button" aria-pressed="false" data-kind="colour">Colour</button>
                  <button type="button" aria-pressed="false" data-kind="barber">Barbering</button>
                  <button type="button" aria-pressed="false" data-kind="care">Care</button>
                </div>
                <div class="services">
${serviceCards}
                </div>
              </fieldset>

              <fieldset class="step">
                <legend><span class="step__n">2</span> Choose who</legend>
                <div class="stylists">
${stylistCards}
                </div>
              </fieldset>

              <fieldset class="step">
                <legend><span class="step__n">3</span> Choose a day and a time</legend>
                <div class="days" id="days" role="radiogroup" aria-label="Day">
                  <p class="fs-small">The next two weeks appear here once the page has loaded. Or call <a href="tel:+94110000000">+94 11 000 0000</a>.</p>
                </div>
                <div class="slots" id="slots" role="radiogroup" aria-label="Time" aria-live="polite"></div>
                <p class="fs-small" id="slots-note">Sample availability: the same times show as taken each time you look.</p>
              </fieldset>

              <fieldset class="step">
                <legend><span class="step__n">4</span> Your details</legend>
                <div class="fields">
                  <div class="field">
                    <label for="b-name">Name</label>
                    <input id="b-name" name="name" autocomplete="name" required maxlength="60" />
                  </div>
                  <div class="field">
                    <label for="b-phone">Mobile number</label>
                    <input id="b-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="20" />
                  </div>
                </div>
              </fieldset>
            </div>

            <aside class="summary" aria-labelledby="summary-title">
              <h3 class="summary__title" id="summary-title">Your booking</h3>
              <dl class="summary__list">
                <div><dt>Service</dt><dd id="s-service">Cut and finish</dd></div>
                <div><dt>With</dt><dd id="s-stylist">Anyone free</dd></div>
                <div><dt>When</dt><dd id="s-when">Choose a day and time</dd></div>
                <div><dt>Price</dt><dd id="s-price">Rs. 4,500</dd></div>
              </dl>
              <button class="fs-btn summary__confirm" type="submit">Confirm the booking <span class="fs-btn__icon" aria-hidden="true"></span></button>
              <button class="fs-link summary__calendar" type="button" id="b-calendar" hidden>Add it to my calendar</button>
              <p class="fs-small" id="b-msg" role="status">A sample booking page. It doesn't send anything yet.</p>
            </aside>
          </form>
        </div>
      </section>

      <section class="fs-section" id="work" aria-labelledby="work-title">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" id="work-title" data-fs-reveal>In the chair this week</h2>
            <p class="fs-lead" data-fs-reveal>Stand-in photos for now. Your own work goes here, and it sells the chair better than any words.</p>
          </div>
          <div class="fs-mosaic" data-fs-stagger>
${work("1773904215697-e6c21fc27ac2", "work-1", "The barbering room", "Warm light, old chairs", "A barbershop with leather chairs under warm hanging lights")}
${work("1634449571010-02389ed0f9b0", "work-2", "Every cut starts here", "Wash and head massage", "A stylist washing a client's hair at a basin")}
${work("1605497788044-5a32c7078486", "work-3", "Fade, then finish", "Skin fade", "A barber blow-drying a man's freshly cut hair")}
${work("1503951914875-452162b0f3f1", "work-4", "Hot towel shave", "Straight razor", "A barber shaving a man's beard with a straight razor")}
${work("1600948836101-f9ffda59d250", "work-5", "The cutting floor", "Four chairs", "An empty salon with round mirrors and black chairs")}
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="visit" aria-labelledby="visit-title">
        <div class="fs-container fs-split">
          <div class="fs-split__text">
            <h2 class="fs-h2" id="visit-title" data-fs-reveal>Find the chair.</h2>
            <p class="fs-lead" data-fs-reveal>412 Galle Road, Colombo 3, above the bookshop. The stairs are on the left; there's a lift at the back.</p>
            <table class="hours" id="hours">
              <caption class="fs-sr">Opening hours</caption>
              <tbody>
                <tr data-day="1"><th scope="row">Monday</th><td>Closed</td></tr>
                <tr data-day="2"><th scope="row">Tuesday</th><td>9 am to 7 pm</td></tr>
                <tr data-day="3"><th scope="row">Wednesday</th><td>9 am to 7 pm</td></tr>
                <tr data-day="4"><th scope="row">Thursday</th><td>9 am to 8 pm</td></tr>
                <tr data-day="5"><th scope="row">Friday</th><td>9 am to 8 pm</td></tr>
                <tr data-day="6"><th scope="row">Saturday</th><td>9 am to 5 pm</td></tr>
                <tr data-day="0"><th scope="row">Sunday</th><td>10 am to 4 pm</td></tr>
              </tbody>
            </table>
            <p class="fs-small">A sample address and hours.</p>
          </div>
          <div class="fs-faq" data-fs-reveal>
            <details><summary>What if I'm late?</summary><p>Up to ten minutes and we'll still do the full service. After that we'll do what fits, or move you to the next free time.</p></details>
            <details><summary>Can I change or cancel?</summary><p>Yes, free, up to four hours before. Call us or reply to the confirmation message.</p></details>
            <details><summary>Do you do children's cuts?</summary><p>For under-twelves, Rs. 2,000, weekday afternoons. Bring them in their favourite T-shirt.</p></details>
            <details><summary>Do I need a patch test for colour?</summary><p>For a first colour with us, yes: it takes five minutes, at least a day before.</p></details>
          </div>
        </div>
      </section>
    </main>

    <footer class="fs-footer">
      <div class="fs-container">
        <div class="fs-footer__grid">
          <div><h2>Visit</h2><p>412 Galle Road<br />Colombo 3</p></div>
          <div><h2>Book</h2><ul><li><a href="#book">Book a chair</a></li><li><a href="tel:+94110000000">Call the studio</a></li></ul></div>
          <div><h2>Studio</h2><ul><li><a href="#services">Services and prices</a></li><li><a href="#work">Our work</a></li><li><a href="#visit">Hours</a></li></ul></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span id="year">2026</span> Mirror &amp; Comb. A sample site.</span><span>Cut in Colombo</span></div>
        <div class="fs-wordmark" aria-hidden="true">Mirror &amp; Comb</div>
      </div>
    </footer>

    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const STYLES = `/* Mirror & Comb: the brand on top of the Farbaek Studio kit. The decisions are in DESIGN.md. */
:root {
  --accent: #00776d;
  --accent-2: #f2c14e;
  --on-accent: #ffffff;
  --ink: #141414;
  --ink-2: #565656;
  --paper: #f1f1ee;
  --paper-2: #ffffff;
  --line: rgb(20 20 20 / 0.1);
  --font-display: "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Figtree", ui-sans-serif, system-ui, sans-serif;
  --radius: 16px;
  --radius-lg: 28px;
  --fs-display-weight: 800;
  --fs-display-track: -0.04em;
}

[hidden] { display: none !important; }
.mark { width: 22px; height: 22px; border-radius: 50%; background: conic-gradient(var(--ink) 0 50%, var(--accent) 0); }
.hero__where { width: fit-content; padding: 7px 14px; border: 1px solid var(--line); border-radius: 999px; font-size: 14px; color: var(--ink-2); }
.hero .fs-display { font-size: clamp(46px, 7.4vw, 112px); }

/* The hero's photo with the next free chair floating over it. */
.hero__media-wrap { position: relative; }
.next-wrap { position: absolute; left: -24px; bottom: 32px; }
@media (max-width: 959px) { .next-wrap { left: 12px; bottom: 12px; } }
.next { display: grid; gap: 4px; min-width: 230px; max-width: 280px; padding: 18px 20px; border-radius: var(--radius); background: var(--paper-2); box-shadow: 0 30px 60px -24px rgb(20 20 20 / 0.45); }
.next__label { font-size: 13px; color: var(--ink-2); display: flex; align-items: center; gap: 8px; }
.next__label::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 22%, transparent); }
.next__time { font: 800 26px/1.1 var(--font-display); letter-spacing: -0.03em; white-space: nowrap; }
.next__what { font-size: 14px; color: var(--ink-2); }
.next__book { display: inline-flex; align-items: center; min-height: 44px; width: fit-content; margin-top: 4px; font-weight: 600; color: var(--accent); }

.strip { padding-block: clamp(48px, 7vw, 88px); }
.strip__note { margin-top: 16px; }

/* Booking: the steps on the left, a summary that follows on the right. */
.booking { display: grid; gap: 32px; align-items: start; }
@media (min-width: 1000px) { .booking { grid-template-columns: 1fr 340px; } }
.booking__steps { display: grid; gap: 28px; }
.step { margin: 0; padding: clamp(20px, 3vw, 32px); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--paper); min-width: 0; }
.step legend { float: left; width: 100%; display: flex; align-items: center; gap: 12px; margin-bottom: 18px; font: 800 22px/1.2 var(--font-display); letter-spacing: -0.02em; }
.step legend + * { clear: both; }
.step__n { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--ink); color: var(--paper-2); font: 600 15px/1 var(--font-body); }
.kinds { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin-bottom: 16px; }
.kinds button { flex: none; min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink-2); font: 500 15px/1 var(--font-body); cursor: pointer; }
.kinds button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper-2); }
.services { display: grid; gap: 10px; }
@media (min-width: 700px) { .services { grid-template-columns: 1fr 1fr; } }
.service, .stylist { position: relative; display: block; cursor: pointer; }
.service input, .stylist input { position: absolute; inset: 0; margin: 0; appearance: none; -webkit-appearance: none; border-radius: var(--radius); cursor: pointer; }
.service input:focus-visible, .stylist input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.service__body { display: grid; gap: 4px; padding: 16px 18px; border: 1.5px solid var(--line); border-radius: var(--radius); background: var(--paper-2); transition: border-color 160ms, box-shadow 200ms var(--fs-ease); }
.service input:checked + .service__body { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 16%, transparent); }
.service__top { display: flex; justify-content: space-between; gap: 12px; }
.service__price { font-weight: 600; font-variant-numeric: tabular-nums; }
.service__meta { font-size: 14px; color: var(--accent); font-weight: 500; }
.service__note { font-size: 14px; color: var(--ink-2); }
.stylists { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); }
.stylist { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1.5px solid var(--line); border-radius: var(--radius); background: var(--paper-2); transition: border-color 160ms; }
.stylist:has(input:checked) { border-color: var(--accent); }
.stylist__face { display: grid; place-items: center; flex: none; width: 44px; height: 44px; border-radius: 50%; background: var(--ink); color: var(--paper-2); font: 800 18px/1 var(--font-display); }
.stylist__face--any { background: conic-gradient(var(--accent), var(--accent-2), var(--accent)); }
.stylist__role { display: block; font-size: 14px; color: var(--ink-2); }
.days { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x mandatory; }
.day { flex: none; scroll-snap-align: start; display: grid; justify-items: center; gap: 2px; width: 64px; min-height: 84px; padding: 10px 0; border: 1.5px solid var(--line); border-radius: var(--radius); background: var(--paper-2); color: var(--ink); font: 500 13px/1.2 var(--font-body); cursor: pointer; transition: border-color 160ms, background-color 160ms, transform 160ms var(--fs-ease); }
.day strong { font: 800 24px/1 var(--font-display); }
.day[aria-checked="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper-2); }
.day:disabled { color: var(--ink-2); background: transparent; border-style: dashed; cursor: not-allowed; }
.day:not(:disabled):active { transform: scale(0.97); }
.slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin: 16px 0 10px; }
.slot { min-height: 44px; border: 1.5px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink); font: 500 15px/1 var(--font-body); font-variant-numeric: tabular-nums; cursor: pointer; transition: border-color 160ms, background-color 160ms; }
.slot[aria-checked="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.slot:disabled { color: var(--ink-2); text-decoration: line-through; background: transparent; cursor: not-allowed; }
.fields { display: grid; gap: 14px; }
@media (min-width: 700px) { .fields { grid-template-columns: 1fr 1fr; } }
.field { display: grid; gap: 8px; font-size: 15px; color: var(--ink-2); }
.field input { min-height: 52px; padding: 0 16px; border: 1.5px solid var(--line); border-radius: 12px; background: var(--paper-2); color: var(--ink); font: 400 16px/1 var(--font-body); }
.field input[aria-invalid="true"] { border-color: #c4322b; }
.summary { position: sticky; top: 96px; display: grid; gap: 16px; padding: 24px; border-radius: var(--radius-lg); background: var(--ink); color: var(--paper-2); --ink-2: rgb(255 255 255 / 0.72); --line: rgb(255 255 255 / 0.14); }
.summary__title { font: 800 22px/1.2 var(--font-display); }
.summary__list { margin: 0; display: grid; }
.summary__list div { display: flex; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid var(--line); }
.summary__list dt { color: var(--ink-2); }
.summary__list dd { margin: 0; text-align: right; font-weight: 600; }
.summary__confirm { justify-content: space-between; }
.summary .fs-link, .summary .fs-small { color: var(--ink-2); }
.summary__calendar { border: 0; background: none; padding: 0; font: inherit; font-weight: 500; color: var(--paper-2); cursor: pointer; }
.summary :focus-visible { outline-color: var(--accent-2); }
.summary.done { animation: done 600ms var(--fs-ease); }
@keyframes done { 40% { transform: scale(1.02); } }

.hours { width: 100%; border-collapse: collapse; font-size: 15px; }
.hours th, .hours td { padding: 10px 0; border-top: 1px solid var(--line); text-align: left; font-weight: 400; }
.hours td { text-align: right; color: var(--ink-2); }
.hours tr.today th, .hours tr.today td { color: var(--ink); font-weight: 600; }
.hours tr.today th::after { content: "Today"; margin-left: 10px; padding: 2px 8px; border-radius: 999px; background: color-mix(in oklab, var(--accent) 14%, transparent); color: var(--accent); font-size: 12px; font-weight: 600; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .summary.done { animation: none; }
  .day, .slot, .service__body, .stylist { transition: none; }
}
`;

const SCRIPT = `// Mirror & Comb: services, people, days and times, the summary, the next free chair and the calendar file.
// The page is complete without this file; the Studio kit does the reveals, the tilt and the counters.
(function () {
  var KEY = "mirror-and-comb-sample-booking";
  // Opening hours by weekday (0 is Sunday): [open, close] in minutes after midnight, or null when closed.
  var HOURS = [[600, 960], null, [540, 1140], [540, 1140], [540, 1200], [540, 1200], [540, 1020]];
  var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var form = document.getElementById("booking");
  var daysEl = document.getElementById("days");
  var slotsEl = document.getElementById("slots");
  var msg = document.getElementById("b-msg");
  var calBtn = document.getElementById("b-calendar");
  var picked = { day: null, time: null };
  var rs = function (n) { return "Rs. " + n.toLocaleString("en-US"); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var clock = function (min) { var h = Math.floor(min / 60), m = min % 60; return (h % 12 || 12) + (m ? "." + pad(m) : "") + (h < 12 ? " am" : " pm"); };

  function service() {
    var r = form.querySelector('input[name="service"]:checked');
    return { name: r.dataset.name, minutes: Number(r.dataset.minutes), price: Number(r.dataset.price) };
  }
  function stylist() { var r = form.querySelector('input[name="stylist"]:checked'); return { id: r.value, name: r.dataset.name }; }
  // Sample bookings: the same times are taken each time you look, worked out from the date and the person.
  function taken(date, start, who) {
    var n = date.getFullYear() * 400 + date.getMonth() * 31 + date.getDate() + start / 15 + who.length * 7;
    var x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x) > (who === "any" ? 0.55 : 0.4);
  }
  function times(date, minutes, who) {
    var h = HOURS[date.getDay()], out = [];
    if (!h) return out;
    var now = new Date(), from = h[0];
    if (date.toDateString() === now.toDateString()) from = Math.max(from, Math.ceil((now.getHours() * 60 + now.getMinutes() + 30) / 30) * 30);
    for (var t = from; t + minutes <= h[1]; t += 30) out.push({ start: t, free: !taken(date, t, who) });
    return out;
  }

  // The next two weeks, closed days shown but not choosable.
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  daysEl.textContent = "";
  for (var i = 0; i < 14; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() + i);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "day";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", "false");
    b.dataset.date = d.toISOString();
    ["small", "strong", "small"].forEach(function (tag, k) {
      var el = document.createElement(tag);
      el.textContent = k === 0 ? (i === 0 ? "Today" : DAY[d.getDay()]) : k === 1 ? String(d.getDate()) : MONTH[d.getMonth()];
      b.appendChild(el);
    });
    var open = HOURS[d.getDay()] && times(d, 30, "any").length > 0;
    b.setAttribute("aria-label", LONG[d.getDay()] + " " + d.getDate() + " " + MONTH[d.getMonth()] + (open ? "" : ", closed"));
    if (!open) b.disabled = true;
    daysEl.appendChild(b);
  }
  var dayButtons = Array.prototype.slice.call(daysEl.querySelectorAll(".day"));
  dayButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      picked.day = new Date(b.dataset.date);
      picked.time = null;
      dayButtons.forEach(function (o) { o.setAttribute("aria-checked", String(o === b)); });
      drawSlots();
      update();
    });
  });

  function drawSlots() {
    slotsEl.textContent = "";
    if (!picked.day) return;
    var list = times(picked.day, service().minutes, stylist().id);
    if (!list.some(function (s) { return s.free; })) {
      var p = document.createElement("p");
      p.className = "fs-small";
      p.textContent = "Nothing free that day for this service. Try another day, or anyone free.";
      slotsEl.appendChild(p);
      return;
    }
    list.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(picked.time === s.start));
      b.textContent = clock(s.start);
      if (!s.free) { b.disabled = true; b.setAttribute("aria-label", clock(s.start) + ", taken"); }
      b.addEventListener("click", function () {
        picked.time = s.start;
        slotsEl.querySelectorAll(".slot").forEach(function (o) { o.setAttribute("aria-checked", String(o === b)); });
        update();
      });
      slotsEl.appendChild(b);
    });
  }

  function when() {
    if (!picked.day || picked.time === null) return null;
    return LONG[picked.day.getDay()] + " " + picked.day.getDate() + " " + MONTH[picked.day.getMonth()] + ", " + clock(picked.time);
  }
  function update() {
    var s = service();
    document.getElementById("s-service").textContent = s.name + ", " + s.minutes + " min";
    document.getElementById("s-stylist").textContent = stylist().name;
    document.getElementById("s-when").textContent = when() || "Choose a day and time";
    document.getElementById("s-price").textContent = rs(s.price);
  }

  // Changing the service or the person redraws the times, keeping the day.
  form.querySelectorAll('input[name="service"], input[name="stylist"]').forEach(function (r) {
    r.addEventListener("change", function () { picked.time = null; drawSlots(); update(); nextFree(); });
  });

  // Service filters.
  var kinds = Array.prototype.slice.call(document.querySelectorAll(".kinds [data-kind]"));
  kinds.forEach(function (k) {
    k.addEventListener("click", function () {
      kinds.forEach(function (o) { o.setAttribute("aria-pressed", String(o === k)); });
      document.querySelectorAll(".service").forEach(function (s) { s.hidden = !(k.dataset.kind === "all" || s.dataset.kind === k.dataset.kind); });
    });
  });

  // The next free chair, for the chosen service, from now.
  function nextFree() {
    var s = service();
    for (var i = 0; i < 14; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      var free = times(d, s.minutes, "any").filter(function (t) { return t.free; })[0];
      if (free) {
        document.getElementById("next-time").textContent = (i === 0 ? "Today" : i === 1 ? "Tomorrow" : LONG[d.getDay()]) + ", " + clock(free.start);
        document.getElementById("next-what").textContent = s.name + ", " + s.minutes + " min";
        return;
      }
    }
  }
  nextFree();
  update();

  // Confirm: check the details, keep the booking in this browser, and say plainly that nothing was sent.
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("b-name"), phone = document.getElementById("b-phone");
    var nameOk = name.value.trim().length > 1, phoneOk = /^[+0-9 ()-]{7,20}$/.test(phone.value.trim());
    name.setAttribute("aria-invalid", String(!nameOk));
    phone.setAttribute("aria-invalid", String(!phoneOk));
    if (!when()) { msg.textContent = "Choose a day and a time first."; daysEl.scrollIntoView({ block: "center" }); return; }
    if (!nameOk) { msg.textContent = "Add your name."; name.focus(); return; }
    if (!phoneOk) { msg.textContent = "Add a mobile number we can text, like 077 123 4567."; phone.focus(); return; }
    var s = service();
    try { localStorage.setItem(KEY, JSON.stringify({ service: s.name, stylist: stylist().name, at: picked.day.toISOString(), time: picked.time })); } catch (x) { /* private mode */ }
    msg.textContent = "Held for you in this browser: " + s.name + ", " + when() + ". This is a sample page, so nothing was sent to the studio.";
    calBtn.hidden = false;
    var box = document.querySelector(".summary");
    box.classList.remove("done");
    void box.offsetWidth;
    box.classList.add("done");
  });

  // A calendar file for the booking, made here in the browser.
  calBtn.addEventListener("click", function () {
    if (!when()) return;
    var s = service();
    var start = new Date(picked.day);
    start.setMinutes(picked.time);
    var end = new Date(start.getTime() + s.minutes * 60000);
    var stamp = function (d) { return d.toISOString().replace(/[-:]/g, "").replace(/\\.\\d{3}/, ""); };
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mirror and Comb//Booking//EN", "BEGIN:VEVENT", "UID:" + start.getTime() + "@mirrorandcomb.example", "DTSTAMP:" + stamp(new Date()), "DTSTART:" + stamp(start), "DTEND:" + stamp(end), "SUMMARY:" + s.name + " at Mirror and Comb", "LOCATION:412 Galle Road\\\\, Colombo 3", "END:VEVENT", "END:VCALENDAR"].join("\\r\\n");
    var url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = "mirror-and-comb.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  // Today in the hours table.
  var row = document.querySelector('#hours tr[data-day="' + new Date().getDay() + '"]');
  if (row) row.classList.add("today");

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Mirror & Comb: design

Design read: a hair studio and barbers in Colombo for people who book between meetings and want to see the times before they call; confident, clean and quick, the booking the centre of the page. Built on the Farbaek Studio kit, light.

## Look

The kit's signal look, tuned: a soft stone paper, white raised sections, 16px and 28px corners, a heavy grotesk display, and one night-black panel (the summary).

## Palette

- \`--paper\` #f1f1ee and \`--paper-2\` #ffffff.
- \`--ink\` #141414 and \`--ink-2\` #565656.
- \`--accent\` #00776d, a barber's teal, for actions, the chosen service and time, and "today".
- \`--accent-2\` #f2c14e, warm gold, only in the glow and the "anyone free" face.

## Type

Schibsted Grotesk at 800 for headlines, day numbers and times; Figtree for everything else. Prices and times are tabular.

## Layout

A split hero with the name, a claim, two actions and the salon photo, the next free chair floating over it; three numbers; booking in four numbered steps beside a sticky summary; a mosaic of the work; the address, hours and questions; a dense footer with the wordmark.

## Signature

The "next chair free" card: worked out live from the hours and the times taken, for the chosen service, and tilting toward the pointer in 3D. It answers the first question anyone has.

## Motion

The claim rises word by word, the card floats and tilts, the photo unmasks, numbers count up, the summary pulses once when you confirm. All of it stops under reduced motion.

## Media

Six real salon and barbershop photos marked as placeholders: the hero and five of the work. Replace them with the studio's own in Studio.

## Avoid

Fake scarcity ("only 2 left!"), invented reviews, stock smiles, a confirm button that pretends the booking reached the studio.
`;

const README = `# Mirror & Comb booking site (template)

A static site on the Farbaek Studio kit: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Make it yours

1. Change the services (name, minutes, price) and the people in \`index.html\`; set the opening hours in \`HOURS\` at the top of \`script.js\` and in the hours table.
2. Tune the colours and fonts at the top of \`styles.css\`, and update \`DESIGN.md\`.
3. Replace each photo marked as a placeholder with your own (Studio's Replace does it in a click).

Availability is a sample: the same times show as taken each time. Bookings stay in the visitor's browser until a booking system is connected.
`;

export const BOOKING_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];

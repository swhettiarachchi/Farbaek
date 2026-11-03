/**
 * Template: a conference page, the premium direction for events,
 * conferences, meetups, festivals and weddings (ADR 0160): built on the
 * Farbaek Studio kit, light by default. A full-bleed hero with a live
 * countdown worked out from the start time, a schedule by day and track,
 * last year in real event photos, the venue, ticket tiers, and a 3D ticket
 * that fills in as you register, with an honest note that nothing is issued
 * yet and a calendar file you can download. Sample content throughout;
 * complete without JavaScript.
 */
import { photoUrl } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "../types";

const photo = (id: string, w: number, h: number, slot: string, alt: string, lazy = true) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} data-farbaek-media="${slot}" data-farbaek-placeholder />`;

type Track = "everyone" | "design" | "engineering" | "product";
const TRACK_LABEL: Record<Track, string> = { everyone: "Everyone", design: "Design", engineering: "Engineering", product: "Product" };

const DAYS: { label: string; date: string; sessions: [string, string, string, Track, string][] }[] = [
  {
    label: "Day 1",
    date: "Thursday 11 March",
    sessions: [
      ["09:00", "Doors, coffee and badges", "", "everyone", "Foyer"],
      ["09:45", "Building for the island first", "Nadeesha F., design director", "everyone", "Main hall"],
      ["11:00", "Type for three scripts on one screen", "Tharindu P., type designer", "design", "Hall B"],
      ["11:00", "Offline-first apps that survive the 7.40 train", "Aisha M., mobile engineer", "engineering", "Hall C"],
      ["13:30", "Pricing in rupees without losing your mind", "Kevin D., product lead", "product", "Hall B"],
      ["13:30", "A design system for a team of two", "Shalini R., researcher", "design", "Hall C"],
      ["15:00", "Postgres at three in the morning", "Ravi S., database engineer", "engineering", "Hall B"],
      ["16:30", "What we got wrong: a panel", "Four of this year's speakers", "everyone", "Main hall"],
    ],
  },
  {
    label: "Day 2",
    date: "Friday 12 March",
    sessions: [
      ["09:30", "Research in the field, not the office", "Shalini R., researcher", "design", "Hall B"],
      ["09:30", "Shipping to the app stores from Colombo", "Aisha M., mobile engineer", "engineering", "Hall C"],
      ["11:00", "Roadmaps people believe", "Kevin D., product lead", "product", "Hall B"],
      ["13:30", "Accessibility you can see", "Tharindu P., type designer", "design", "Hall B"],
      ["15:00", "The boring architecture that scales", "Ravi S., database engineer", "engineering", "Hall C"],
      ["16:30", "Ten years from now", "Nadeesha F., design director", "everyone", "Main hall"],
    ],
  },
];

const schedule = DAYS.map(
  (d, i) => `          <div class="day" id="day-${i + 1}" role="tabpanel" aria-labelledby="day-tab-${i + 1}"${i === 0 ? "" : " hidden"}>
            <h3 class="fs-sr">${d.label}, ${d.date}</h3>
            <ul class="sessions">
${d.sessions
  .map(
    ([time, title, who, track, room]) => `              <li class="session" data-track="${track}">
                <span class="session__time">${time}</span>
                <div class="session__body">
                  <p class="session__title">${title}</p>
                  ${who ? `<p class="session__who">${who}</p>` : ""}
                </div>
                <span class="session__meta"><span class="tag tag--${track}">${TRACK_LABEL[track]}</span><span>${room}</span></span>
              </li>`,
  )
  .join("\n")}
            </ul>
          </div>`,
).join("\n");

const TIERS = [
  { id: "student", name: "Student pass", price: "6,000", note: "Both days, with a student card at the door." },
  { id: "standard", name: "Standard pass", price: "18,000", note: "Both days, lunch, and the party on Thursday night.", featured: true },
  { id: "team", name: "Team of five", price: "80,000", note: "Five standard passes, and a table kept for you at lunch." },
];

const tierCards = TIERS.map(
  (t) => `            <article class="tier${t.featured ? " tier--featured" : ""}" data-fs-reveal>
              <h3 class="fs-h3">${t.name}</h3>
              <p class="tier__price">Rs. ${t.price}</p>
              <p class="tier__note">${t.note}</p>
              <a class="fs-btn${t.featured ? "" : " fs-btn--ghost"}" href="#register" data-tier="${t.id}">Choose this pass <span class="fs-btn__icon" aria-hidden="true"></span></a>
            </article>`,
).join("\n");

const INDEX = `<!doctype html>
<html lang="en" data-fs-look="signal">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Northline 27, design and engineering in Colombo, 11 to 12 March</title>
    <meta name="description" content="Two days of talks on design, engineering and product, built for the island. 11 and 12 March 2027 at the Lotus Hall, Colombo." />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@600;800&amp;family=Red+Hat+Text:wght@400;500;600&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="fs-skip" href="#main">Skip to content</a>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="#top"><span class="mark" aria-hidden="true"></span>Northline 27</a>
      <ul class="fs-nav__links">
        <li><a href="#schedule">Schedule</a></li>
        <li><a href="#venue">Venue</a></li>
        <li><a href="#tickets">Tickets</a></li>
      </ul>
      <a class="fs-btn" href="#register">Get a ticket <span class="fs-btn__icon" aria-hidden="true"></span></a>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="#schedule">Schedule</a>
      <a href="#venue">Venue</a>
      <a href="#tickets">Tickets</a>
      <a href="#register">Get a ticket</a>
    </nav>

    <main id="main">
      <section class="fs-hero hero" id="top" data-start="2027-03-11T09:00:00+05:30" data-end="2027-03-12T18:00:00+05:30">
        <div class="fs-hero__media">
          ${photo("1602137925482-00fb0ed07877", 2000, 1300, "hero-photo", "A full conference hall lit in blue, facing a large screen", false)}
        </div>
        <div class="fs-container fs-hero__content">
          <p class="hero__when">11 to 12 March 2027, Lotus Hall, Colombo</p>
          <h1 class="fs-display" data-fs-reveal="words">Design and engineering, built for the island.</h1>
          <p class="fs-lead" data-fs-reveal>Two days, three tracks and twenty-four talks from people shipping software in Sri Lanka. No sponsored keynotes.</p>
          <div class="countdown" id="countdown" data-fs-reveal>
            <p class="countdown__label" id="countdown-label">Starts in</p>
            <div class="countdown__units" aria-hidden="true">
              <span><b id="cd-days">--</b>days</span>
              <span><b id="cd-hours">--</b>hours</span>
              <span><b id="cd-mins">--</b>minutes</span>
              <span><b id="cd-secs">--</b>seconds</span>
            </div>
            <p class="fs-sr" id="countdown-text">Starts on 11 March 2027 at 9 am, Colombo time.</p>
          </div>
          <div class="fs-actions" data-fs-reveal>
            <a class="fs-btn" href="#register">Get a ticket <span class="fs-btn__icon" aria-hidden="true"></span></a>
            <a class="fs-link" href="#schedule">See the schedule</a>
          </div>
        </div>
      </section>

      <section class="fs-section strip" aria-label="Northline 27 in numbers">
        <div class="fs-container">
          <div class="fs-stats" data-fs-stagger>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>24</span><span class="fs-stat__label">talks across three tracks</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>600</span><span class="fs-stat__label">seats in the Lotus Hall</span></div>
            <div class="fs-stat" data-fs-reveal><span class="fs-stat__num" data-fs-count>2</span><span class="fs-stat__label">days, with lunch and one party</span></div>
          </div>
          <p class="fs-small strip__note">Sample figures. Replace them with yours.</p>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="schedule" aria-labelledby="schedule-title">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" id="schedule-title" data-fs-reveal>The schedule</h2>
            <p class="fs-lead" data-fs-reveal>Times are Colombo time. Talks are thirty minutes with ten for questions.</p>
          </div>
          <div class="schedule__bar">
            <div class="days" role="tablist" aria-label="Days">
${DAYS.map((d, i) => `              <button type="button" role="tab" id="day-tab-${i + 1}" aria-controls="day-${i + 1}" aria-selected="${i === 0}"${i === 0 ? "" : ' tabindex="-1"'}>${d.label}<span>${d.date}</span></button>`).join("\n")}
            </div>
            <div class="chips" role="group" aria-label="Filter by track">
              <button type="button" aria-pressed="true" data-track="all">All tracks</button>
              <button type="button" aria-pressed="false" data-track="design">Design</button>
              <button type="button" aria-pressed="false" data-track="engineering">Engineering</button>
              <button type="button" aria-pressed="false" data-track="product">Product</button>
            </div>
          </div>
${schedule}
          <p class="fs-small schedule__note">A sample programme. Sessions for everyone stay in every filter.</p>
        </div>
      </section>

      <section class="fs-section" aria-labelledby="last-title">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" id="last-title" data-fs-reveal>Last year, in the hall</h2>
            <p class="fs-lead" data-fs-reveal>Northline 26 sold out three weeks early. These are stand-in photos until yours go in.</p>
          </div>
          <div class="fs-mosaic" data-fs-stagger>
            <figure class="fs-card" data-fs-reveal><div class="fs-frame" data-fs-tilt="4">${photo("1540575467063-178a50c2df87", 1600, 1000, "last-1", "An audience seated in rows in a dark conference hall")}</div><figcaption class="fs-card__meta"><span>The main hall, morning one</span></figcaption></figure>
            <figure class="fs-card" data-fs-reveal><div class="fs-frame" data-fs-tilt="4">${photo("1559223694-98ed5e272fef", 1000, 1250, "last-2", "A speaker on stage in front of a blue backdrop and a screen")}</div><figcaption class="fs-card__meta"><span>A talk in Hall B</span></figcaption></figure>
            <figure class="fs-card" data-fs-reveal><div class="fs-frame" data-fs-tilt="4">${photo("1773829020694-413e879d2957", 1000, 1250, "last-3", "A crowded hall facing a stage lit in blue")}</div><figcaption class="fs-card__meta"><span>The closing panel</span></figcaption></figure>
            <figure class="fs-card" data-fs-reveal><div class="fs-frame" data-fs-tilt="4">${photo("1505373877841-8d25f7d46678", 1000, 1250, "last-4", "A presentation on a large screen in a darkened room")}</div><figcaption class="fs-card__meta"><span>Slides worth photographing</span></figcaption></figure>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="venue" aria-labelledby="venue-title">
        <div class="fs-container fs-split">
          <div class="fs-frame" data-fs-reveal="mask">
            ${photo("1582192730841-2a682d7375f9", 1100, 1375, "venue-photo", "A large dark auditorium with tiered seats facing a lit stage")}
          </div>
          <div class="fs-split__text">
            <h2 class="fs-h2" id="venue-title" data-fs-reveal>The Lotus Hall.</h2>
            <p class="fs-lead" data-fs-reveal>Six hundred seats, two smaller halls and a garden for lunch, ten minutes from Fort station.</p>
            <ul class="fs-list" data-fs-stagger>
              <li data-fs-reveal>Step-free from the gate to every hall</li>
              <li data-fs-reveal>A quiet room, and live captions in the main hall</li>
              <li data-fs-reveal>Parking for 80 cars; the train is quicker</li>
            </ul>
            <div class="fs-actions" data-fs-reveal>
              <button class="fs-btn fs-btn--ghost" type="button" id="copy-address" data-address="Lotus Hall, 40 Lotus Road, Colombo 1">Copy the address <span class="fs-btn__icon" aria-hidden="true"></span></button>
            </div>
            <p class="fs-small" id="copy-msg" role="status">A sample venue and address.</p>
          </div>
        </div>
      </section>

      <section class="fs-section" id="tickets" aria-labelledby="tickets-title">
        <div class="fs-container">
          <div class="fs-head">
            <h2 class="fs-h2" id="tickets-title" data-fs-reveal>Tickets</h2>
            <p class="fs-lead" data-fs-reveal>Every pass covers both days. Prices include tax.</p>
          </div>
          <div class="tiers" data-fs-stagger>
${tierCards}
          </div>
          <p class="fs-small">Sample prices in Sri Lankan rupees.</p>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="register" aria-labelledby="register-title">
        <div class="fs-container fs-split">
          <div class="fs-split__text">
            <h2 class="fs-h2" id="register-title" data-fs-reveal>Your ticket, made as you type.</h2>
            <form class="register" id="register-form" novalidate>
              <div class="field">
                <label for="reg-name">Name on the badge</label>
                <input id="reg-name" name="name" autocomplete="name" maxlength="40" required />
              </div>
              <div class="field">
                <label for="reg-email">Email</label>
                <input id="reg-email" name="email" type="email" autocomplete="email" required />
              </div>
              <div class="field">
                <label for="reg-tier">Pass</label>
                <select id="reg-tier" name="tier">
${TIERS.map((t) => `                  <option value="${t.id}"${t.featured ? " selected" : ""}>${t.name}, Rs. ${t.price}</option>`).join("\n")}
                </select>
              </div>
              <div class="fs-actions">
                <button class="fs-btn" type="submit">Register <span class="fs-btn__icon" aria-hidden="true"></span></button>
                <button class="fs-link calendar" type="button" id="add-calendar">Add to my calendar</button>
              </div>
              <p class="fs-small" id="register-msg" role="status">A sample form. It doesn't issue tickets or take payment yet.</p>
            </form>
          </div>
          <div class="ticket-wrap">
            <div class="fs-float">
              <div class="ticket" id="ticket" data-fs-tilt="10" aria-hidden="true">
                <div class="ticket__top"><span class="ticket__brand"><span class="mark"></span>Northline 27</span><span>11 to 12 March 2027</span></div>
                <p class="ticket__name" id="ticket-name">Your name</p>
                <p class="ticket__tier" id="ticket-tier">Standard pass</p>
                <div class="ticket__foot"><span>Lotus Hall, Colombo</span><span class="ticket__code" id="ticket-code">NL27 0000</span></div>
                <div class="ticket__shine"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="fs-section" aria-labelledby="faq-title">
        <div class="fs-container fs-split fs-split--wide">
          <div class="fs-faq" data-fs-reveal>
            <details><summary>Can I transfer my ticket?</summary><p>Yes, up to a week before. Write to us with the new name and we'll reissue it.</p></details>
            <details><summary>Will the talks be recorded?</summary><p>The main hall is recorded and published a month later. The smaller halls aren't, so come.</p></details>
            <details><summary>Is there food for every diet?</summary><p>Lunch is a rice-and-curry buffet with vegetarian, vegan and gluten-free dishes marked. Tell us about allergies when you register.</p></details>
            <details><summary>Can I speak next year?</summary><p>The call for talks opens in September. We pay every speaker's travel.</p></details>
          </div>
          <div class="fs-head">
            <h2 class="fs-h2" id="faq-title" data-fs-reveal>Questions</h2>
            <p class="fs-lead" data-fs-reveal>Anything else, write to hello@northline.example.</p>
          </div>
        </div>
      </section>
    </main>

    <footer class="fs-footer">
      <div class="fs-container">
        <div class="fs-footer__grid">
          <div><h2>Where</h2><p>Lotus Hall, 40 Lotus Road<br />Colombo 1</p></div>
          <div><h2>When</h2><p>11 to 12 March 2027<br />9 am to 6 pm</p></div>
          <div><h2>More</h2><ul><li><a href="#schedule">Schedule</a></li><li><a href="#tickets">Tickets</a></li><li><a href="mailto:hello@northline.example">Write to us</a></li></ul></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span id="year">2026</span> Northline. A sample event.</span><span>Made in Colombo</span></div>
        <div class="fs-wordmark" aria-hidden="true">Northline</div>
      </div>
    </footer>

    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const STYLES = `/* Northline 27: the brand on top of the Farbaek Studio kit. The decisions are in DESIGN.md. */
:root {
  --accent: #d1245f;
  --accent-2: #3a5bff;
  --on-accent: #ffffff;
  --ink: #0e1020;
  --ink-2: #555a70;
  --paper: #f5f6fa;
  --paper-2: #ffffff;
  --line: rgb(14 16 32 / 0.1);
  --font-display: "Red Hat Display", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Red Hat Text", ui-sans-serif, system-ui, sans-serif;
  --radius: 18px;
  --radius-lg: 30px;
  --fs-display-weight: 800;
  --fs-display-track: -0.035em;
}

[hidden] { display: none !important; }
.mark { display: inline-block; width: 20px; height: 20px; border-radius: 50%; background: conic-gradient(from 200deg, var(--accent), var(--accent-2), var(--accent)); }

/* The hero: the hall, darkened so white type reads, with the countdown in glass. */
.hero { color: #fff; --ink: #fff; --ink-2: rgb(255 255 255 / 0.84); --line: rgb(255 255 255 / 0.24); }
.hero .fs-hero__media::after { background: linear-gradient(90deg, rgb(10 12 30 / 0.78) 0%, rgb(10 12 30 / 0.35) 60%, rgb(10 12 30 / 0.15) 100%), linear-gradient(180deg, rgb(10 12 30 / 0.4) 0%, transparent 30%, rgb(10 12 30 / 0.7) 100%); }
.hero .fs-display { font-size: clamp(42px, 6.8vw, 104px); max-width: 15ch; }
.hero .fs-link { color: #fff; }
.hero__when { width: fit-content; padding: 8px 14px; border-radius: 999px; background: rgb(255 255 255 / 0.14); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); font-size: 15px; font-weight: 500; }
.countdown { display: grid; gap: 10px; }
.countdown__label { font-size: 14px; color: var(--ink-2); }
.countdown__units { display: flex; flex-wrap: wrap; gap: 8px; }
.countdown__units span { display: grid; justify-items: center; min-width: 76px; padding: 12px 10px 10px; border: 1px solid var(--line); border-radius: 16px; background: rgb(255 255 255 / 0.1); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); font-size: 12px; color: var(--ink-2); }
.countdown__units b { font: 800 clamp(28px, 3.4vw, 44px)/1 var(--font-display); letter-spacing: -0.03em; color: #fff; font-variant-numeric: tabular-nums; }

.strip { padding-block: clamp(48px, 7vw, 88px); }
.strip__note { margin-top: 16px; }

/* The schedule: days as tabs, tracks as filters. */
.schedule__bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; }
.days { display: inline-flex; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); }
.days button { display: grid; justify-items: start; min-height: 52px; padding: 6px 20px; border: 0; border-radius: 999px; background: none; color: var(--ink-2); font: 600 16px/1.2 var(--font-body); cursor: pointer; transition: background-color 200ms, color 200ms; }
.days button span { font-size: 12px; font-weight: 400; }
.days button[aria-selected="true"] { background: var(--ink); color: var(--paper-2); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chips button { min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink-2); font: 500 15px/1 var(--font-body); cursor: pointer; transition: background-color 160ms, color 160ms, border-color 160ms; }
.chips button[aria-pressed="true"] { border-color: var(--ink); color: var(--ink); background: color-mix(in oklab, var(--ink) 6%, var(--paper-2)); }
.sessions { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.session { display: grid; grid-template-columns: 64px 1fr; gap: 6px 20px; padding: 20px 0; border-bottom: 1px solid var(--line); }
@media (min-width: 900px) { .session { grid-template-columns: 96px 1fr 240px; align-items: center; } }
.session__time { font: 800 20px/1.2 var(--font-display); font-variant-numeric: tabular-nums; }
.session__title { font: 600 clamp(18px, 1.6vw, 22px)/1.3 var(--font-display); letter-spacing: -0.015em; }
.session__who { margin-top: 2px; font-size: 15px; color: var(--ink-2); }
.session__meta { grid-column: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; color: var(--ink-2); }
@media (min-width: 900px) { .session__meta { grid-column: auto; justify-content: flex-end; } }
.tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink); font-weight: 500; }
.tag::before { content: ""; width: 8px; height: 8px; }
.tag--everyone::before { border-radius: 2px; background: var(--ink); }
.tag--design::before { border-radius: 50%; background: var(--accent); }
.tag--engineering::before { background: var(--accent-2); }
.tag--product::before { width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 9px solid #138a5a; }
.schedule__note { margin-top: 20px; }

/* Ticket tiers. */
.tiers { display: grid; gap: 20px; margin-bottom: 20px; }
@media (min-width: 900px) { .tiers { grid-template-columns: repeat(3, 1fr); align-items: stretch; } }
.tier { display: grid; gap: 12px; align-content: start; padding: clamp(24px, 3vw, 36px); border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper-2); }
.tier--featured { border-color: var(--accent); box-shadow: 0 24px 50px -28px color-mix(in oklab, var(--accent) 60%, transparent); }
.tier__price { font: 800 clamp(32px, 3.4vw, 48px)/1 var(--font-display); letter-spacing: -0.03em; }
.tier__note { color: var(--ink-2); min-height: 3.2em; }
.tier .fs-btn { justify-self: start; }

/* Register, beside a ticket that fills in as you type. */
.register { display: grid; gap: 16px; max-width: 520px; }
.field { display: grid; gap: 8px; font-size: 15px; color: var(--ink-2); }
.field input, .field select { min-height: 52px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); color: var(--ink); font: 400 16px/1 var(--font-body); }
.field input[aria-invalid="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.calendar { min-height: 44px; border: 0; background: none; padding: 0; color: inherit; cursor: pointer; font: inherit; font-weight: 500; }
.ticket-wrap { display: grid; place-items: center; padding: 24px 0; perspective: 1200px; }
.ticket { position: relative; width: min(100%, 380px); aspect-ratio: 5 / 7; display: grid; grid-template-rows: auto 1fr auto auto; gap: 8px; padding: 28px; border-radius: 26px; color: #fff; background: radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--accent-2) 80%, #000) 0%, transparent 60%), radial-gradient(120% 90% at 100% 100%, var(--accent) 0%, transparent 60%), #10122a; box-shadow: 0 40px 80px -30px rgb(14 16 32 / 0.6), inset 0 0 0 1px rgb(255 255 255 / 0.16); }
.ticket__top { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: rgb(255 255 255 / 0.8); }
.ticket__brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: #fff; }
.ticket__brand .mark { width: 16px; height: 16px; }
.ticket__name { align-self: end; font: 800 clamp(30px, 3.4vw, 42px)/1.05 var(--font-display); letter-spacing: -0.03em; overflow-wrap: anywhere; transform: translateZ(40px); }
.ticket__tier { font-weight: 500; color: rgb(255 255 255 / 0.85); }
.ticket__foot { display: flex; justify-content: space-between; gap: 12px; padding-top: 16px; border-top: 1.5px dashed rgb(255 255 255 / 0.35); font-size: 13px; color: rgb(255 255 255 / 0.8); }
.ticket__code { font-family: ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.08em; color: #fff; }
.ticket__shine { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(115deg, transparent 30%, rgb(255 255 255 / 0.18) 45%, transparent 60%) calc(var(--fs-mx, 30%) * 1.6 - 60%) 0 / 200% 100% no-repeat; mix-blend-mode: screen; }
.ticket.pop { animation: pop 500ms var(--fs-ease); }
/* On phones the ticket comes first, landscape, so it fills in where you can see it while you type. */
@media (max-width: 899px) {
  .ticket-wrap { order: -1; padding: 0; }
  .ticket { width: min(100%, 360px); aspect-ratio: 8 / 5; padding: 22px; }
  .ticket__name { font-size: 28px; }
}
@keyframes pop { 40% { scale: 1.04; } }

.copy-ok { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .ticket.pop { animation: none; }
  .days button, .chips button { transition: none; }
}
`;

const SCRIPT = `// Northline 27: the countdown, the schedule's days and tracks, the ticket that fills in, the calendar file and the address.
// The page is complete without this file; the Studio kit does the reveals, the tilt and the counters.
(function () {
  var hero = document.getElementById("top");
  var start = new Date(hero ? hero.dataset.start : "");
  var end = new Date(hero ? hero.dataset.end : "");

  // The countdown, worked out from the start time in the visitor's own clock.
  var label = document.getElementById("countdown-label");
  var text = document.getElementById("countdown-text");
  var units = document.querySelector(".countdown__units");
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var timer = null;
  function tick() {
    var now = Date.now();
    if (isNaN(start)) return;
    if (now >= end) {
      label.textContent = "Northline 27 has happened. Thank you for coming.";
      units.hidden = true;
      text.textContent = label.textContent;
      clearInterval(timer);
      return;
    }
    if (now >= start) {
      label.textContent = "Happening now, at the Lotus Hall.";
      units.hidden = true;
      text.textContent = label.textContent;
      return;
    }
    var s = Math.floor((start - now) / 1000);
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    document.getElementById("cd-days").textContent = String(d);
    document.getElementById("cd-hours").textContent = pad(h);
    document.getElementById("cd-mins").textContent = pad(m);
    document.getElementById("cd-secs").textContent = pad(s % 60);
    text.textContent = "Starts in " + d + " days and " + h + " hours.";
  }
  tick();
  timer = setInterval(tick, 1000);

  // Days as tabs, with arrow keys.
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.days [role="tab"]'));
  function pick(i, focus) {
    tabs.forEach(function (t, n) {
      var on = n === i;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tabs[i].focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { pick(i, false); });
    t.addEventListener("keydown", function (e) {
      var next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      pick((next + tabs.length) % tabs.length, true);
    });
  });

  // Tracks: sessions for everyone stay in every filter.
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chips [data-track]"));
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var track = chip.dataset.track;
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      document.querySelectorAll(".session").forEach(function (s) {
        s.hidden = !(track === "all" || s.dataset.track === track || s.dataset.track === "everyone");
      });
    });
  });

  // The ticket fills in as you type, with a code made from the name.
  var nameIn = document.getElementById("reg-name");
  var tierIn = document.getElementById("reg-tier");
  var tName = document.getElementById("ticket-name");
  var tTier = document.getElementById("ticket-tier");
  var tCode = document.getElementById("ticket-code");
  function code(s) {
    var h = 7;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return "NL27 " + String(h).padStart(4, "0");
  }
  function fill() {
    var n = nameIn.value.trim();
    tName.textContent = n || "Your name";
    tTier.textContent = tierIn.options[tierIn.selectedIndex].text.split(",")[0];
    tCode.textContent = n ? code(n.toLowerCase()) : "NL27 0000";
  }
  if (nameIn && tierIn) {
    nameIn.addEventListener("input", fill);
    tierIn.addEventListener("change", fill);
    fill();
  }
  // Choosing a pass in the tiers sets it on the form.
  document.querySelectorAll("[data-tier]").forEach(function (a) {
    a.addEventListener("click", function () { tierIn.value = a.dataset.tier; fill(); });
  });

  var form = document.getElementById("register-form");
  var msg = document.getElementById("register-msg");
  var ticket = document.getElementById("ticket");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("reg-email");
      var nameOk = nameIn.value.trim().length > 1;
      var emailOk = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.value.trim());
      nameIn.setAttribute("aria-invalid", String(!nameOk));
      email.setAttribute("aria-invalid", String(!emailOk));
      if (!nameOk) { msg.textContent = "Add the name you'd like on your badge."; nameIn.focus(); return; }
      if (!emailOk) { msg.textContent = "Enter an email address like name@example.com."; email.focus(); return; }
      msg.textContent = "Thanks, " + nameIn.value.trim() + ". This is a sample page, so no ticket was issued and nothing was charged.";
      ticket.classList.remove("pop");
      void ticket.offsetWidth;
      ticket.classList.add("pop");
    });
  }

  // A calendar file for both days, made here in the browser.
  var cal = document.getElementById("add-calendar");
  if (cal && !isNaN(start)) {
    cal.addEventListener("click", function () {
      var stamp = function (d) { return d.toISOString().replace(/[-:]/g, "").replace(/\\.\\d{3}/, ""); };
      var ics = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Northline//Northline 27//EN", "BEGIN:VEVENT",
        "UID:northline-27@northline.example", "DTSTAMP:" + stamp(new Date()), "DTSTART:" + stamp(start), "DTEND:" + stamp(end),
        "SUMMARY:Northline 27", "LOCATION:Lotus Hall\\\\, 40 Lotus Road\\\\, Colombo 1", "END:VEVENT", "END:VCALENDAR"
      ].join("\\r\\n");
      var url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
      var a = document.createElement("a");
      a.href = url;
      a.download = "northline-27.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      msg.textContent = "Saved northline-27.ics. Open it to add both days to your calendar.";
    });
  }

  // Copy the address, and say what happened.
  var copy = document.getElementById("copy-address");
  var copyMsg = document.getElementById("copy-msg");
  if (copy && copyMsg) {
    copy.addEventListener("click", function () {
      var address = copy.dataset.address;
      var done = function () { copyMsg.textContent = "Copied. It's a sample address, so replace it with yours."; };
      var fail = function () { copyMsg.textContent = "Couldn't copy here. The address is " + address + "."; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(address).then(done, fail);
      else fail();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Northline 27: design

Design read: a two-day conference in Colombo for designers, engineers and product people, independent and serious about its programme; energetic but clear, the schedule easy to read on a phone. Built on the Farbaek Studio kit, light.

## Look

The kit's signal look, tuned: a cool off-white paper, 18px cards, a heavy display face, and one night-blue object (the ticket).

## Palette

- \`--paper\` #f5f6fa and \`--paper-2\` #ffffff.
- \`--ink\` #0e1020, a night navy, and \`--ink-2\` #555a70.
- \`--accent\` #d1245f, a deep magenta, for actions, the featured pass and the design track.
- \`--accent-2\` #3a5bff, cobalt, for the engineering track and the ticket's light.

## Type

Red Hat Display at 800 for headlines, times and prices, set tight; Red Hat Text for everything else. Times and the countdown are tabular.

## Layout

A full-bleed hero of the hall with the date, the claim and a live countdown in glass tiles; three numbers; the schedule with day tabs and track filters; last year in a photo mosaic; the venue; three passes; registration beside the ticket; questions; a dense footer with the wordmark.

## Signature

The ticket: a night-blue pass that fills in with your name and pass as you type, tilts toward the pointer in 3D with a light that follows, and pops when you register.

## Motion

The claim rises word by word, the countdown ticks, the numbers count up, photos rise and tilt, the ticket floats and turns. All of it stops under reduced motion; the countdown still updates, because it's information.

## Media

Six real conference photos marked as placeholders: the hero, four from last year and the venue. Replace them with the event's own in Studio.

## Avoid

A fake "selling fast" counter, invented speaker headshots, sponsor logos that aren't real, and a ticket form that pretends to take payment.
`;

const README = `# Northline 27 event page (template)

A static site on the Farbaek Studio kit: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Make it yours

1. Set the start and end on the hero (\`data-start\` and \`data-end\`, with the time zone). The countdown and the calendar file use them.
2. Change the schedule, the passes, the venue and the questions in \`index.html\`.
3. Tune the colours and fonts at the top of \`styles.css\`, and update \`DESIGN.md\`.
4. Replace each photo marked as a placeholder with your own (Studio's Replace does it in a click).

The programme, figures, prices and venue are samples. Registration doesn't issue tickets until it's connected.
`;

export const EVENT_PAGE_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];

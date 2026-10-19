/**
 * Template: a one-day event page, built to the Studio standard (ADR 0030).
 * A blueprint look with a live countdown, a 3D ticket that turns over and
 * fills in your name as you register, a schedule you can filter by track,
 * and speakers with drawn portraits. Sample content; previews instantly
 * and is complete without JavaScript.
 */
import type { StarterFile } from "../types";

// A barcode and a door code, drawn from fixed numbers so the template is the same every time.
const barcode = (() => {
  const widths = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 4, 1, 1, 2, 1, 3, 2, 1, 1, 4, 2, 1, 3, 1, 2, 1, 1, 3];
  let x = 0;
  return widths
    .map((w, i) => {
      const r = i % 2 === 0 ? `<rect x="${x}" y="0" width="${w * 2}" height="44" />` : "";
      x += w * 2;
      return r;
    })
    .join("");
})();
const doorCode = (() => {
  const N = 21;
  let seed = 13;
  const cells: string[] = [];
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
  const finder = (ox: number, oy: number) =>
    `<rect x="${ox * 4}" y="${oy * 4}" width="28" height="28" /><rect x="${ox * 4 + 4}" y="${oy * 4 + 4}" width="20" height="20" fill="#ffffff" /><rect x="${ox * 4 + 8}" y="${oy * 4 + 8}" width="12" height="12" />`;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      if (!inFinder(x, y) && seed % 100 < 46) cells.push(`<rect x="${x * 4}" y="${y * 4}" width="4" height="4" />`);
    }
  }
  return finder(0, 0) + finder(N - 7, 0) + finder(0, N - 7) + cells.join("");
})();

type Track = "talk" | "workshop" | "build" | "all";
const SCHEDULE: { time: string; title: string; track: Track; room: string }[] = [
  { time: "09:00", title: "Doors open, coffee and name badges", track: "all", room: "Foyer" },
  { time: "09:30", title: "Opening: what we'll make today", track: "talk", room: "Hall A" },
  { time: "10:00", title: "Shipping small, and why it's braver", track: "talk", room: "Hall A" },
  { time: "10:45", title: "Paper prototypes in thirty minutes", track: "workshop", room: "Studio 2" },
  { time: "11:30", title: "Hardware for software people", track: "talk", room: "Hall A" },
  { time: "11:30", title: "Accessible by default: a hands-on hour", track: "workshop", room: "Studio 2" },
  { time: "12:30", title: "Lunch on the terrace", track: "all", room: "Terrace" },
  { time: "13:30", title: "Build session: teams form, ideas get made", track: "build", room: "Hall B" },
  { time: "17:30", title: "Demos: three minutes each, no slides", track: "all", room: "Hall A" },
  { time: "19:00", title: "Awards and dinner", track: "all", room: "Terrace" },
];
const TRACK_LABEL: Record<Track, string> = { talk: "Talk", workshop: "Workshop", build: "Build", all: "Everyone" };
const scheduleRows = SCHEDULE.map(
  (s) => `            <li class="slot" data-track="${s.track}">
              <time class="t">${s.time}</time>
              <span class="what">${s.title}</span>
              <span class="track tr-${s.track}">${TRACK_LABEL[s.track]}</span>
              <span class="room">${s.room}</span>
            </li>`,
).join("\n");

const SPEAKERS = [
  { name: "Amara Perera", role: "Hardware engineer", talk: "Hardware for software people", a: 0 },
  { name: "Kenji Watanabe", role: "Product designer", talk: "Paper prototypes in thirty minutes", a: 1 },
  { name: "Sofia Reyes", role: "Accessibility lead", talk: "Accessible by default", a: 2 },
  { name: "Dev Malhotra", role: "Founder of a two-person studio", talk: "Shipping small, and why it's braver", a: 3 },
];
const portrait = (initials: string, variant: number) => {
  const shapes = [
    `<circle cx="60" cy="60" r="44" fill="none" stroke="#ffd23f" stroke-width="2" stroke-dasharray="4 6" /><path d="M16 96L104 24" stroke="#bfd0f2" stroke-width="1.5" />`,
    `<rect x="18" y="18" width="84" height="84" fill="none" stroke="#ffd23f" stroke-width="2" /><path d="M18 60h84M60 18v84" stroke="#bfd0f2" stroke-width="1" stroke-dasharray="3 5" />`,
    `<path d="M60 14l46 80H14z" fill="none" stroke="#ffd23f" stroke-width="2" /><circle cx="60" cy="68" r="20" fill="none" stroke="#bfd0f2" stroke-width="1.5" />`,
    `<circle cx="42" cy="48" r="26" fill="none" stroke="#ffd23f" stroke-width="2" /><circle cx="78" cy="72" r="26" fill="none" stroke="#bfd0f2" stroke-width="1.5" />`,
  ];
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><rect width="120" height="120" fill="#0b2c6b" />${shapes[variant]}<text x="60" y="70" text-anchor="middle" font-family="Bahnschrift, 'DIN Alternate', 'Arial Narrow', sans-serif" font-size="30" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
};
const speakerCards = SPEAKERS.map(
  (s) => `          <li class="speaker reveal">
            <div class="portrait">${portrait(
              s.name
                .split(" ")
                .map((w) => w[0])
                .join(""),
              s.a,
            )}</div>
            <h3>${s.name}</h3>
            <p class="role">${s.role}</p>
            <p class="talk">${s.talk}</p>
          </li>`,
).join("\n");

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Build Day 2027: one day of making things</title>
    <meta name="description" content="Build Day 2027: talks in the morning, building all afternoon and demos at dusk, on 13 March 2027. A sample event page." />
    <meta name="theme-color" content="#0f3b8c" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="bar">
      <a class="brand" href="#top"><span class="brand-box" aria-hidden="true">BD</span>Build Day 2027</a>
      <nav class="nav" aria-label="Main">
        <a class="nav-link" href="#schedule">Schedule</a>
        <a class="nav-link" href="#speakers">Speakers</a>
        <a class="pill" href="#register">Save a seat</a>
      </nav>
    </header>

    <main id="main">
      <section class="hero" id="top">
        <div class="hero-copy">
          <p class="when mono">Sat 13 Mar 2027 / Colombo / 09:00 to 21:00</p>
          <h1>One day of making things, together.</h1>
          <p class="lead">Talks in the morning, building all afternoon, demos at dusk. Bring an idea or join a team.</p>
          <div class="actions">
            <a class="button" href="#register">Save a seat</a>
            <a class="link" href="#schedule">See the schedule <span aria-hidden="true">&rarr;</span></a>
          </div>
          <div class="countdown" id="countdown" aria-live="off">
            <p class="cd-label mono">Doors open in</p>
            <ol class="cd" id="cd">
              <li><span class="n" data-unit="d">143</span><span class="u mono">days</span></li>
              <li><span class="n" data-unit="h">12</span><span class="u mono">hours</span></li>
              <li><span class="n" data-unit="m">30</span><span class="u mono">min</span></li>
              <li><span class="n" data-unit="s">00</span><span class="u mono">sec</span></li>
            </ol>
          </div>
          <p class="note mono">A sample event. Names, talks and the venue are sample content.</p>
          <svg class="dim" viewBox="0 0 300 20" aria-hidden="true"><path d="M2 10h296M2 4v12M298 4v12M2 10l8-4v8zM298 10l-8-4v8z" /><text x="150" y="7" text-anchor="middle">12 hours</text></svg>
        </div>

        <div class="ticket-stage" id="ticket-stage">
          <div class="ticket-float">
            <div class="ticket" id="ticket">
              <div class="face front">
                <div class="t-main">
                  <p class="t-kicker mono">Build Day 2027</p>
                  <p class="t-name" id="t-name">Admit one</p>
                  <p class="t-type mono" id="t-type">Builder ticket</p>
                  <dl class="t-facts mono">
                    <div><dt>Date</dt><dd>13 Mar 2027</dd></div>
                    <div><dt>Doors</dt><dd>08:30</dd></div>
                    <div><dt>Hall</dt><dd>B, table 14</dd></div>
                  </dl>
                </div>
                <div class="t-stub">
                  <svg class="barcode" viewBox="0 0 120 44" aria-hidden="true" preserveAspectRatio="none">${barcode}</svg>
                  <p class="mono">No. 0213</p>
                </div>
              </div>
              <div class="face back" aria-hidden="true">
                <svg class="code" viewBox="0 0 84 84">${doorCode}</svg>
                <div>
                  <p class="b-title">Show this at the door</p>
                  <p class="mono">Hall B, table 14. Doors 08:30.</p>
                  <p class="mono b-note">Sample ticket, not valid for entry.</p>
                </div>
              </div>
            </div>
          </div>
          <button class="turn" type="button" id="turn" aria-pressed="false">Turn the ticket over</button>
        </div>
      </section>

      <section class="schedule" id="schedule" aria-labelledby="schedule-title">
        <div class="wrap">
          <div class="sec-head reveal">
            <h2 id="schedule-title">Schedule</h2>
            <div class="filters" role="group" aria-label="Show sessions">
              <button type="button" aria-pressed="true" data-track="every">All</button>
              <button type="button" aria-pressed="false" data-track="talk">Talks</button>
              <button type="button" aria-pressed="false" data-track="workshop">Workshops</button>
              <button type="button" aria-pressed="false" data-track="build">Build</button>
            </div>
          </div>
          <ol class="slots reveal" id="slots">
${scheduleRows}
          </ol>
          <p class="hint mono">Sessions for everyone stay in every view. Times are sample times, in Colombo time.</p>
        </div>
      </section>

      <section class="speakers" id="speakers" aria-labelledby="speakers-title">
        <div class="wrap">
          <h2 id="speakers-title" class="reveal">Speakers</h2>
          <ul class="speaker-grid">
${speakerCards}
          </ul>
          <p class="hint mono">Sample speakers. Portraits are drawn placeholders until you add photos.</p>
        </div>
      </section>

      <section class="register" id="register" aria-labelledby="register-title">
        <div class="wrap register-grid">
          <div class="reveal">
            <h2 id="register-title">Save a seat.</h2>
            <p class="sub">Free, with lunch and dinner. Watch your ticket fill in as you type.</p>
          </div>
          <form class="form reveal" id="form" novalidate>
            <div class="field">
              <label for="name">Your name</label>
              <input id="name" type="text" autocomplete="name" maxlength="40" required />
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="email" autocomplete="email" required />
            </div>
            <fieldset class="types">
              <legend>Ticket</legend>
              <label><input type="radio" name="type" value="Builder" checked /> <span>Builder</span></label>
              <label><input type="radio" name="type" value="Student" /> <span>Student</span></label>
              <label><input type="radio" name="type" value="Visitor" /> <span>Visitor</span></label>
            </fieldset>
            <button class="button" type="submit">Save my seat</button>
            <p class="form-msg" id="form-msg" role="status">A sample form: it doesn't send anything yet.</p>
          </form>
        </div>
      </section>

      <section class="faq" aria-labelledby="faq-title">
        <div class="wrap">
          <h2 id="faq-title" class="reveal">Good to know</h2>
          <div class="qs reveal">
            <details><summary>Do I need a team or an idea?</summary><p>No. Teams form at 13:30 around the ideas people bring. Join one, or start your own.</p></details>
            <details><summary>What should I bring?</summary><p>A laptop and its charger. We'll have power, fast internet, coffee and spare cables.</p></details>
            <details><summary>Is it a real event?</summary><p>No. Build Day 2027 is sample content in a Farbaek template. Ask the agent to make it about your event.</p></details>
          </div>
        </div>
      </section>
    </main>

    <footer class="foot mono">
      <p>Build Day 2027 is a sample event.</p>
      <a href="#top">Back to top</a>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `/* Build Day 2027. The design decisions behind these tokens are in DESIGN.md. */
:root {
  --blueprint: #0f3b8c;
  --deep: #0b2c6b;
  --paper: #ffffff;
  --pale: #bfd0f2;
  --signal: #ffd23f;
  --ink: #0b1c3f;
  --grid: rgba(255, 255, 255, 0.06);
  --grid-major: rgba(255, 255, 255, 0.12);
  --display: "Bahnschrift Condensed", "DIN Condensed", Bahnschrift, "DIN Alternate", "Roboto Condensed", "Arial Narrow", sans-serif;
  --body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(16px, 5vw, 64px);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background-color: var(--blueprint);
  background-image: linear-gradient(var(--grid-major) 1px, transparent 1px), linear-gradient(90deg, var(--grid-major) 1px, transparent 1px), linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px;
  color: var(--paper);
  font: 17px/1.6 var(--body);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
a { color: inherit; }
.mono { font-family: var(--mono); font-size: 13px; letter-spacing: 0.02em; }
h1, h2, h3 { font-family: var(--display); font-weight: 700; text-transform: uppercase; letter-spacing: -0.01em; }
h2 { margin: 0; font-size: clamp(44px, 7vw, 96px); line-height: 0.9; }
:focus-visible { outline: 3px solid var(--signal); outline-offset: 3px; border-radius: 6px; }
.skip { position: absolute; left: 16px; top: -60px; z-index: 20; padding: 10px 16px; border-radius: 999px; background: var(--signal); color: var(--ink); }
.skip:focus { top: 12px; }
.wrap { max-width: 1160px; margin: 0 auto; }

.bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px var(--gutter); background: rgba(15, 59, 140, 0.88); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid var(--grid-major); }
.brand { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; font: 700 20px var(--display); text-transform: uppercase; text-decoration: none; }
.brand-box { display: grid; place-items: center; width: 34px; height: 34px; border: 2px solid var(--signal); color: var(--signal); font-size: 15px; }
.nav { display: flex; align-items: center; gap: 2px; }
.nav-link { display: none; min-height: 44px; align-items: center; padding: 0 14px; border-radius: 999px; font-size: 15px; text-decoration: none; color: var(--pale); }
.nav-link:hover { color: var(--paper); background: rgba(255, 255, 255, 0.08); }
.pill { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--signal); color: var(--ink); font-size: 15px; font-weight: 700; text-decoration: none; }
@media (min-width: 760px) { .nav-link { display: inline-flex; } }

/* Hero */
.hero { display: grid; align-items: center; gap: 48px; min-height: calc(100dvh - 65px); padding: clamp(28px, 5vw, 64px) var(--gutter); }
@media (min-width: 1000px) { .hero { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); } }
.hero-copy { position: relative; }
.when { margin: 0 0 16px; color: var(--signal); }
h1 { margin: 0; max-width: 18ch; font-size: clamp(52px, 6.2vw, 100px); line-height: 0.88; }
.lead { max-width: 40ch; margin: 22px 0 0; color: var(--pale); font-size: clamp(18px, 1.6vw, 21px); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; margin-top: 30px; }
.button { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 28px; border: 0; border-radius: 999px; background: var(--signal); color: var(--ink); font: 700 16px var(--body); text-decoration: none; cursor: pointer; box-shadow: 0 14px 30px -16px rgba(255, 210, 63, 0.9); transition: transform 0.2s var(--ease), box-shadow 0.2s; }
.button:hover { transform: translateY(-2px); box-shadow: 0 18px 36px -14px rgba(255, 210, 63, 0.9); }
.button:active { transform: translateY(1px); }
.link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-weight: 600; text-underline-offset: 5px; }
.link span { transition: transform 0.2s var(--ease); }
.link:hover span { transform: translateX(4px); }
.countdown { margin-top: 36px; }
.cd-label { margin: 0 0 8px; color: var(--pale); }
.cd { display: flex; gap: 10px; margin: 0; padding: 0; list-style: none; }
.cd li { display: grid; justify-items: center; min-width: 72px; padding: 10px 8px 8px; border: 1px solid var(--grid-major); background: rgba(11, 44, 107, 0.6); }
.n { font: 700 clamp(30px, 3.4vw, 44px)/1 var(--display); font-variant-numeric: tabular-nums; }
.u { color: var(--pale); font-size: 11px; text-transform: uppercase; }
.n.tick { animation: tick 0.35s var(--ease); }
@keyframes tick { from { opacity: 0.3; transform: translateY(-6px); } }
.note { margin: 22px 0 0; color: var(--pale); }
.dim { display: none; width: 300px; margin-top: 24px; }
.dim path { fill: none; stroke: var(--pale); stroke-width: 1; }
.dim path:last-child { fill: var(--pale); }
.dim text { fill: var(--pale); font: 10px var(--mono); }
@media (min-width: 1000px) { .dim { display: block; } }

/* The ticket: 3D, it floats, follows the pointer and turns over. */
.ticket-stage { --tx: 10deg; --ty: -18deg; display: grid; justify-items: center; gap: 18px; perspective: 1400px; }
.ticket-float { width: min(440px, 100%); animation: float 6s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
.ticket { position: relative; aspect-ratio: 1.62 / 1; transform-style: preserve-3d; transform: rotateX(var(--tx)) rotateY(var(--ty)); transition: transform 0.9s var(--ease); }
.ticket.flipped { transform: rotateX(var(--tx)) rotateY(calc(var(--ty) + 180deg)); }
.face { position: absolute; inset: 0; display: grid; border-radius: 20px; backface-visibility: hidden; -webkit-backface-visibility: hidden; box-shadow: 0 40px 70px -30px rgba(3, 12, 32, 0.8); overflow: hidden; }
.front { grid-template-columns: minmax(0, 1fr) 30%; background: var(--signal); color: var(--ink); }
.front::before, .front::after { content: ""; position: absolute; left: 70%; width: 26px; height: 26px; margin-left: -13px; border-radius: 50%; background: var(--blueprint); }
.front::before { top: -13px; }
.front::after { bottom: -13px; }
.t-main { display: grid; align-content: space-between; padding: clamp(16px, 4%, 26px); }
.t-kicker { margin: 0; font-weight: 700; text-transform: uppercase; }
.t-name { margin: 6px 0 0; font: 700 clamp(28px, 4vw, 40px)/0.95 var(--display); text-transform: uppercase; overflow-wrap: anywhere; }
.t-type { margin: 4px 0 0; }
.t-facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 12px 0 0; }
.t-facts div { display: grid; }
.t-facts dt { opacity: 0.7; font-size: 11px; text-transform: uppercase; }
.t-facts dd { margin: 0; font-weight: 700; font-size: 12px; white-space: nowrap; }
.t-stub { display: grid; align-content: center; justify-items: center; gap: 8px; padding: 14px; border-left: 2px dashed rgba(11, 28, 63, 0.4); }
.barcode { width: 100%; height: 44px; fill: var(--ink); }
.t-stub p { margin: 0; }
.back { grid-template-columns: auto 1fr; align-items: center; gap: 20px; padding: 24px; background: var(--paper); color: var(--ink); transform: rotateY(180deg); }
.code { width: clamp(96px, 14vw, 132px); fill: var(--ink); }
.b-title { margin: 0 0 6px; font: 700 26px/1 var(--display); text-transform: uppercase; }
.back p { margin: 0; }
.b-note { margin-top: 10px !important; opacity: 0.7; }
.turn { display: none; min-height: 44px; padding: 0 18px; border: 1px solid var(--grid-major); border-radius: 999px; background: rgba(11, 44, 107, 0.6); color: var(--paper); font: 600 14px var(--body); cursor: pointer; }
.turn:hover { border-color: var(--signal); }
.ticket.stamp .t-name { animation: stamp 0.4s var(--ease); }
@keyframes stamp { from { opacity: 0.4; transform: translateY(4px); } }
.ticket-stage.off .ticket-float { animation-play-state: paused; }
.js .turn { display: inline-flex; align-items: center; }

/* Schedule */
.schedule, .speakers, .register, .faq { padding: clamp(72px, 10vw, 128px) var(--gutter); border-top: 1px solid var(--grid-major); }
.sec-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 20px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.filters button { min-height: 44px; padding: 0 18px; border: 1px solid var(--grid-major); border-radius: 999px; background: transparent; color: var(--paper); font: 600 15px var(--body); cursor: pointer; transition: background-color 0.2s, color 0.2s; }
.filters button:hover { border-color: var(--pale); }
.filters button[aria-pressed="true"] { background: var(--paper); color: var(--ink); border-color: var(--paper); }
.slots { margin: 36px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--grid-major); }
.slot { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 4px 20px; padding: 16px 0; border-bottom: 1px solid var(--grid-major); }
@media (min-width: 760px) { .slot { grid-template-columns: 80px minmax(0, 1fr) 110px 90px; align-items: center; } }
.slot[hidden] { display: none; }
.slot.enter { animation: enter 0.45s var(--ease) both; }
@keyframes enter { from { opacity: 0; transform: translateX(-10px); } }
.t { font: 700 22px var(--display); font-variant-numeric: tabular-nums; color: var(--signal); }
.what { font-size: 18px; font-weight: 600; }
.track { justify-self: start; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; grid-column: 2; }
@media (min-width: 760px) { .track { grid-column: auto; } }
.tr-talk { background: var(--paper); color: var(--ink); }
.tr-workshop { box-shadow: inset 0 0 0 1.5px var(--paper); }
.tr-build { background: var(--signal); color: var(--ink); }
.tr-all { color: var(--pale); box-shadow: inset 0 0 0 1px var(--grid-major); }
.room { color: var(--pale); font-size: 14px; grid-column: 2; }
@media (min-width: 760px) { .room { grid-column: auto; text-align: right; } }
.hint { margin: 18px 0 0; color: var(--pale); }

/* Speakers */
.speaker-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; margin: 40px 0 0; padding: 0; list-style: none; }
.portrait { overflow: hidden; aspect-ratio: 1; border: 1px solid var(--grid-major); }
.portrait svg { display: block; width: 100%; height: 100%; transition: transform 0.6s var(--ease); }
.speaker:hover .portrait svg { transform: scale(1.05) rotate(-1deg); }
.speaker h3 { margin: 14px 0 0; font-size: 28px; line-height: 1; }
.role { margin: 4px 0 0; color: var(--pale); font-size: 15px; }
.talk { margin: 8px 0 0; font-weight: 600; }

/* Register */
.register-grid { display: grid; gap: 36px; align-items: start; }
@media (min-width: 940px) { .register-grid { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); } }
.sub { max-width: 36ch; margin: 18px 0 0; color: var(--pale); font-size: 19px; }
.form { display: grid; gap: 18px; padding: clamp(20px, 3vw, 32px); border: 1px solid var(--grid-major); border-radius: 28px; background: rgba(11, 44, 107, 0.75); }
.field { display: grid; gap: 6px; }
.field label, legend { font-weight: 600; font-size: 15px; }
input[type="text"], input[type="email"] { min-height: 52px; padding: 0 16px; border: 1px solid var(--grid-major); border-radius: 12px; background: rgba(255, 255, 255, 0.06); color: var(--paper); font: 16px var(--body); }
input[type="text"]:focus, input[type="email"]:focus { border-color: var(--signal); outline: none; box-shadow: 0 0 0 4px rgba(255, 210, 63, 0.2); }
input[aria-invalid="true"] { border-color: #ff9b8a; }
.types { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; border: 0; }
.types legend { margin-bottom: 8px; }
.types label { position: relative; }
.types input { position: absolute; opacity: 0; }
.types span { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border: 1px solid var(--grid-major); border-radius: 999px; cursor: pointer; transition: background-color 0.2s, color 0.2s; }
.types input:checked + span { background: var(--signal); color: var(--ink); border-color: var(--signal); font-weight: 700; }
.types input:focus-visible + span { outline: 3px solid var(--signal); outline-offset: 3px; }
.form .button { justify-self: start; }
.form-msg { margin: 0; color: var(--pale); font-size: 14px; }
.form-msg.error { color: #ffb4a8; }
.form-msg.ok { color: var(--signal); font-weight: 600; }

/* Questions */
.qs { margin-top: 32px; border-top: 1px solid var(--grid-major); }
details { border-bottom: 1px solid var(--grid-major); }
summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; cursor: pointer; font-size: 18px; font-weight: 600; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary::after { content: "+"; flex: none; display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--grid-major); border-radius: 50%; transition: transform 0.3s var(--ease); }
details[open] summary::after { transform: rotate(45deg); }
details p { max-width: 60ch; margin: 0 0 20px; color: var(--pale); }

.foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 22px var(--gutter); border-top: 1px solid var(--grid-major); color: var(--pale); }
.foot p { margin: 0; }
.foot a { display: inline-flex; align-items: center; min-height: 44px; margin: -12px 0; }

.js .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.7s var(--ease), transform 0.7s var(--ease); }
.js .reveal.in { opacity: 1; transform: none; }

@media (max-width: 640px) { .ticket-stage { --tx: 6deg; --ty: -8deg; } .cd li { min-width: 0; flex: 1; } }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .js .reveal { opacity: 1; transform: none; }
}
`;

const SCRIPT = `// Build Day 2027: the countdown, the ticket, the schedule filter and the sample form.
// The page is complete without this file.
(function () {
  document.documentElement.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;
  var canObserve = "IntersectionObserver" in window;

  var reveals = document.querySelectorAll(".reveal");
  if (canObserve && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // The countdown to doors at 09:00 on 13 March 2027, in the visitor's local time.
  var START = new Date(2027, 2, 13, 9, 0, 0).getTime();
  var cd = document.getElementById("countdown");
  var units = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  var cells = {};
  document.querySelectorAll("[data-unit]").forEach(function (el) { cells[el.dataset.unit] = el; });
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function tick() {
    var left = START - Date.now();
    if (left <= 0) {
      cd.innerHTML = "<p class=\\"cd-label mono\\">Build Day 2027 has happened. Thanks to everyone who came.</p>";
      return false;
    }
    ["d", "h", "m", "s"].forEach(function (u) {
      var v = Math.floor(left / units[u]);
      left -= v * units[u];
      var text = u === "d" ? String(v) : pad(v);
      if (cells[u].textContent !== text) {
        cells[u].textContent = text;
        if (!reduce) { cells[u].classList.remove("tick"); void cells[u].offsetWidth; cells[u].classList.add("tick"); }
      }
    });
    return true;
  }
  if (cd && tick()) {
    var timer = setInterval(function () { if (!tick()) clearInterval(timer); }, 1000);
  }

  // The ticket follows the pointer, turns over, and pauses its float off screen.
  var stage = document.getElementById("ticket-stage");
  var ticket = document.getElementById("ticket");
  var turn = document.getElementById("turn");
  if (stage && finePointer && !reduce) {
    stage.addEventListener("pointermove", function (e) {
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty("--ty", (-18 + x * 24).toFixed(1) + "deg");
      stage.style.setProperty("--tx", (10 - y * 16).toFixed(1) + "deg");
    });
    stage.addEventListener("pointerleave", function () {
      stage.style.removeProperty("--ty");
      stage.style.removeProperty("--tx");
    });
  }
  if (stage && canObserve) {
    new IntersectionObserver(function (entries) { stage.classList.toggle("off", !entries[0].isIntersecting); }).observe(stage);
  }
  if (turn && ticket) {
    turn.addEventListener("click", function () {
      var flipped = ticket.classList.toggle("flipped");
      turn.setAttribute("aria-pressed", String(flipped));
      turn.textContent = flipped ? "Turn it back" : "Turn the ticket over";
    });
  }

  // The schedule filter. Sessions for everyone stay in every view.
  var slots = document.querySelectorAll(".slot");
  document.querySelectorAll(".filters button").forEach(function (b) {
    b.addEventListener("click", function () {
      var track = b.dataset.track;
      document.querySelectorAll(".filters button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      var shown = 0;
      slots.forEach(function (s) {
        var show = track === "every" || s.dataset.track === track || s.dataset.track === "all";
        s.hidden = !show;
        s.classList.remove("enter");
        if (show && !reduce) { s.style.animationDelay = shown * 35 + "ms"; void s.offsetWidth; s.classList.add("enter"); }
        if (show) shown += 1;
      });
    });
  });

  // The form: the ticket fills in as you type; saving checks the fields and says nothing was sent.
  var form = document.getElementById("form");
  var nameInput = document.getElementById("name");
  var emailInput = document.getElementById("email");
  var msg = document.getElementById("form-msg");
  var tName = document.getElementById("t-name");
  var tType = document.getElementById("t-type");
  function stamp() { ticket.classList.remove("stamp"); void ticket.offsetWidth; ticket.classList.add("stamp"); }
  if (form && nameInput && tName && tType) {
    nameInput.addEventListener("input", function () {
      tName.textContent = nameInput.value.trim() || "Admit one";
    });
    form.addEventListener("change", function (e) {
      if (e.target.name === "type") { tType.textContent = e.target.value + " ticket"; stamp(); }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var problems = [];
      nameInput.setAttribute("aria-invalid", String(!nameInput.value.trim()));
      emailInput.setAttribute("aria-invalid", String(!emailInput.checkValidity()));
      if (!nameInput.value.trim()) problems.push("your name");
      if (!emailInput.checkValidity()) problems.push("an email address like name@example.com");
      msg.classList.remove("ok", "error");
      if (problems.length) {
        msg.classList.add("error");
        msg.textContent = "Add " + problems.join(" and ") + ".";
        (nameInput.value.trim() ? emailInput : nameInput).focus();
        return;
      }
      msg.classList.add("ok");
      msg.textContent = "Your ticket is ready above. This is a sample form, so nothing was sent.";
      stamp();
      stage.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    });
  }
})();
`;

const DESIGN = `# Build Day 2027: design

Design read: a page for a one-day community making event, for builders, students and designers. Energetic and technical, like a drawing on the workshop wall.

## Palette (CSS variables in styles.css)

- \`--blueprint\` #0f3b8c: the page, with a fine white grid over it
- \`--deep\` #0b2c6b: panels and portraits
- \`--paper\` #ffffff: text
- \`--pale\` #bfd0f2: secondary text and lines (AA on blueprint)
- \`--signal\` #ffd23f: the one accent, for actions, times and the ticket
- \`--ink\` #0b1c3f: text on the signal yellow

## Type

- Display: a condensed engineering face (Bahnschrift Condensed, DIN Condensed), weight 700, uppercase.
- Body: the system sans at 17px.
- Labels, dates and data: the system monospace.

## Layout

A split hero (the date, headline, countdown and a dimension line on the left; the ticket on the right), a schedule with track filters, four speakers, a registration form that writes onto the ticket, and questions.

## Signature

The ticket: a 3D admission ticket that floats, leans toward the pointer, turns over to show its door code, and fills in your name and ticket type as you register.

## Motion

The ticket floats and pauses off screen; it turns over in 0.9 s. Countdown digits tick, schedule rows slide in when filtered, sections rise in on scroll. Everything stops under prefers-reduced-motion, and the page is complete without JavaScript.

## Shape

Pills for buttons and filters, 12px inputs, 20px ticket, square portraits and countdown cells (the blueprint is square).

## When this becomes another event

Update this file first. Change the date in script.js (START) and the hero, keep the ticket if people register, and keep one accent.
`;

const README = `# Build Day 2027 event page (template)

A one-day event page built to the Farbaek Studio standard: a blueprint look, a live countdown, a 3D ticket that turns over and fills in as you register, a schedule you can filter by track, speakers and questions.

- \`DESIGN.md\`: the design decisions. Change it first when the page becomes your event's.
- \`script.js\`: the countdown (START is 09:00 on 13 March 2027), the ticket, the schedule filter, the form and scroll reveals. The page works without it.

The event, talks, speakers, venue and times are sample content. Ask the agent to make it yours, for example: "Make this the page for our book club meetup on 3 May at the city library, with three talks".

The registration form doesn't send anything yet. Connecting it to a list or a ticketing service is a separate change.
`;

export const EVENT_PAGE_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
  { path: "README.md", content: README },
];

/**
 * Template: a landing page for one product, built to the Studio standard
 * (ADR 0030): a floating 3D week in the hero, a working planner, motion that
 * stops under reduced motion. Sample content, meant to be replaced; no build
 * step, previews instantly. Complete without JavaScript (gallery thumbnails
 * run none); script.js only adds to it.
 */
import type { StarterFile } from "../types";

const DAYS: { day: string; tag?: string; tasks: { text: string; done?: boolean }[] }[] = [
  { day: "Monday", tag: "Today", tasks: [{ text: "Send the Hale proposal", done: true }, { text: "Call the printer about April" }, { text: "Sketch the April cover" }] },
  { day: "Tuesday", tasks: [{ text: "Write the newsletter intro" }, { text: "Invoice March work" }, { text: "Review Sam's draft" }] },
  { day: "Wednesday", tasks: [{ text: "Plan the team lunch" }, { text: "Renew the domain" }, { text: "Back up the laptop" }] },
  { day: "Thursday", tasks: [{ text: "Studio visit" }, { text: "Edit the case study" }] },
  { day: "Friday", tasks: [{ text: "Ship the April issue" }, { text: "Weekly review" }] },
  { day: "Saturday", tasks: [{ text: "Nothing planned" }] },
  { day: "Sunday", tasks: [{ text: "Nothing planned" }] },
];

const weekCards = DAYS.map(
  (d, i) => `            <div class="day" style="--i: ${i}">
              <div class="card">
                <p class="day-name">${d.day}${d.tag ? ` <span>${d.tag}</span>` : ""}</p>
                <ul>
${d.tasks.map((t) => `                  <li${t.done ? ' class="done"' : ""}>${t.text}</li>`).join("\n")}
                </ul>
              </div>
            </div>`,
).join("\n");

const SAMPLE_PLAN = [
  ["Mon", ["Send the Hale proposal", "Call the printer about April", "Sketch the April cover"]],
  ["Tue", ["Renew the domain", "Write the newsletter intro", "Invoice March work"]],
  ["Wed", ["Book the dentist", "Review Sam's draft", "Plan the team lunch"]],
  ["Thu", ["Back up the laptop"]],
  ["Fri", []],
  ["Sat", []],
  ["Sun", []],
] as const;

const samplePlan = SAMPLE_PLAN.map(
  ([day, tasks], i) => `            <li style="--d: ${i}">
              <h3>${day}</h3>
              <ul>
${(tasks.length ? tasks : ["Free"]).map((t) => `                <li${tasks.length ? "" : ' class="free"'}>${t}</li>`).join("\n")}
              </ul>
            </li>`,
).join("\n");

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tidewater: plan your week in five minutes</title>
    <meta name="description" content="Tidewater turns the notes you already keep into a calm week plan, three priorities a day. Sample landing page." />
    <meta name="theme-color" content="#eef4f6" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="bar">
      <a class="logo" href="#top">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#0a2433" /><path d="M5 18c3.5-4 7.5-4 11 0s7.5 4 11 0" fill="none" stroke="#5ec4b6" stroke-width="3" stroke-linecap="round" /></svg>
        Tidewater
      </a>
      <nav class="nav" aria-label="Main">
        <a class="nav-link" href="#how">How it works</a>
        <a class="nav-link" href="#try">Try it</a>
        <a class="pill" href="#start">Get early access</a>
      </nav>
    </header>

    <main id="main">
      <section class="hero" id="top">
        <div class="hero-copy">
          <h1>Plan your week in five minutes.</h1>
          <p class="lead">Tidewater turns the notes you already keep into a calm week: three priorities a day, never more.</p>
          <div class="actions">
            <a class="button" href="#start">Get early access</a>
            <a class="link" href="#try">Try the planner <span aria-hidden="true">&rarr;</span></a>
          </div>
          <p class="note">A sample product. Names, quotes and numbers on this page are sample content.</p>
        </div>

        <div class="week" aria-hidden="true">
          <div class="stack">
${weekCards}
          </div>
        </div>

        <div class="tide" aria-hidden="true">
          <svg class="w1" viewBox="0 0 2400 140" preserveAspectRatio="none"><path d="M0 70C100 40 200 40 300 70S500 100 600 70S800 40 900 70S1100 100 1200 70S1400 40 1500 70S1700 100 1800 70S2000 40 2100 70S2300 100 2400 70V140H0Z" /></svg>
          <svg class="w2" viewBox="0 0 2400 140" preserveAspectRatio="none"><path d="M0 90C100 66 200 66 300 90S500 114 600 90S800 66 900 90S1100 114 1200 90S1400 66 1500 90S1700 114 1800 90S2000 66 2100 90S2300 114 2400 90V140H0Z" /></svg>
        </div>
      </section>

      <section class="how" id="how" aria-labelledby="how-title">
        <div class="wrap">
          <h2 id="how-title" class="reveal">Three steps, once a week.</h2>
          <ol class="steps reveal">
            <li>
              <span class="num">1</span>
              <h3>Bring your notes</h3>
              <p>Paste a list, a page of notes or last week's leftovers. Tidewater reads them as they are.</p>
            </li>
            <li>
              <span class="num">2</span>
              <h3>Choose three a day</h3>
              <p>It suggests a realistic three for each day, deadlines first. You make the call.</p>
            </li>
            <li>
              <span class="num">3</span>
              <h3>Work one calm page</h3>
              <p>Today is the only screen you see. Anything unfinished rolls forward on its own.</p>
            </li>
          </ol>
        </div>
      </section>

      <section class="try" id="try" aria-labelledby="try-title">
        <div class="wrap try-grid">
          <div class="try-copy reveal">
            <h2 id="try-title">Try it with your own notes.</h2>
            <p>One task per line. Start a line with ! to put it first. The planner spreads them across the week, three a day at most. It runs in your browser and sends nothing.</p>
            <form class="planner" id="planner">
              <label for="notes">Your notes</label>
              <textarea id="notes" rows="9" spellcheck="false">Send the Hale proposal
Call the printer about April
Sketch the April cover
Renew the domain
Write the newsletter intro
Invoice March work
Book the dentist
Review Sam's draft
Plan the team lunch
Back up the laptop</textarea>
              <button class="button" type="submit">Plan my week</button>
            </form>
          </div>
          <div class="board reveal">
            <ol class="plan" id="plan" aria-live="polite" aria-label="Your week">
${samplePlan}
            </ol>
            <p class="plan-more" id="plan-more">Planned 10 tasks.</p>
          </div>
        </div>
      </section>

      <section class="quote" aria-label="What a sample customer says">
        <figure class="wrap reveal">
          <blockquote>I stopped rewriting my to&#8209;do list every morning. The week just holds.</blockquote>
          <figcaption>Sample quote from a freelance designer</figcaption>
        </figure>
      </section>

      <section class="cta" id="start" aria-labelledby="start-title">
        <div class="wrap reveal">
          <h2 id="start-title">Be first in line.</h2>
          <p>Leave your email and we'll write once, when Tidewater opens.</p>
          <form class="signup" id="signup">
            <label class="sr-only" for="email">Email</label>
            <input id="email" type="email" autocomplete="email" placeholder="you@example.com" required />
            <button class="button" type="submit">Join the list</button>
          </form>
          <p class="signup-msg" id="signup-msg" role="status">This sample form doesn't send anything yet.</p>
        </div>
      </section>
    </main>

    <footer class="foot">
      <p>&copy; <span id="year">2026</span> Tidewater. A sample site.</p>
      <a href="#top">Back to top</a>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `/* Tidewater. The design decisions behind these tokens are in DESIGN.md. */
:root {
  --mist: #eef4f6;
  --deep: #0a2433;
  --tide: #0f766e;
  --foam: #d5ece8;
  --line: #d3dee3;
  --muted: #4a5f6b;
  --card: #ffffff;
  --display: ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif;
  --body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(16px, 5vw, 64px);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--mist); color: var(--deep); font: 17px/1.6 var(--body); -webkit-font-smoothing: antialiased; overflow-x: hidden; }
a { color: inherit; }
h1, h2, h3 { font-family: var(--display); letter-spacing: -0.03em; }
:focus-visible { outline: 3px solid var(--tide); outline-offset: 3px; border-radius: 8px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip { position: absolute; left: 16px; top: -60px; z-index: 20; padding: 10px 16px; border-radius: 999px; background: var(--deep); color: #fff; }
.skip:focus { top: 12px; }
.wrap { max-width: 1120px; margin: 0 auto; }

/* Header */
.bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px var(--gutter); background: rgba(238, 244, 246, 0.86); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.logo { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; font: 700 19px var(--display); letter-spacing: -0.02em; text-decoration: none; }
.nav { display: flex; align-items: center; gap: 4px; }
.nav-link { display: none; min-height: 44px; align-items: center; padding: 0 14px; border-radius: 999px; font-size: 15px; text-decoration: none; color: var(--muted); }
.nav-link:hover { color: var(--deep); background: rgba(10, 36, 51, 0.05); }
.pill { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--deep); color: #fff; font-size: 15px; font-weight: 600; text-decoration: none; transition: transform 0.2s var(--ease), background-color 0.2s; }
.pill:hover { background: var(--tide); }
@media (min-width: 760px) { .nav-link { display: inline-flex; } }

/* Hero */
.hero { position: relative; display: grid; align-items: center; gap: 24px; min-height: calc(100dvh - 68px); padding: clamp(28px, 6vw, 64px) var(--gutter) 150px; overflow: hidden; }
@media (min-width: 960px) { .hero { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); } }
h1 { margin: 0; max-width: 15ch; font-size: clamp(46px, 7.2vw, 96px); font-weight: 700; line-height: 0.98; letter-spacing: -0.05em; }
.lead { max-width: 44ch; margin: 22px 0 0; color: var(--muted); font-size: clamp(18px, 1.6vw, 21px); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; margin-top: 32px; }
.button { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 26px; border: 0; border-radius: 999px; background: var(--deep); color: #fff; font: 600 16px var(--body); text-decoration: none; cursor: pointer; box-shadow: 0 10px 30px -12px rgba(10, 36, 51, 0.6); transition: transform 0.2s var(--ease), background-color 0.2s, box-shadow 0.2s; }
.button:hover { background: var(--tide); transform: translateY(-2px); box-shadow: 0 16px 34px -14px rgba(15, 118, 110, 0.7); }
.button:active { transform: translateY(1px); }
.link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-weight: 600; text-underline-offset: 5px; }
.link span { transition: transform 0.2s var(--ease); }
.link:hover span { transform: translateX(4px); }
.note { margin: 28px 0 0; color: var(--muted); font-size: 13px; }

/* The floating week: seven cards in 3D, bobbing on the tide. */
.week { --step-x: 30px; --step-y: -26px; position: relative; height: clamp(340px, 46vw, 580px); perspective: 1400px; }
.week::before { content: ""; position: absolute; inset: 0 -10% 0 0; background: radial-gradient(closest-side, rgba(94, 196, 182, 0.32), rgba(94, 196, 182, 0) 70%); }
.stack { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateY(-26deg) rotateX(14deg); }
.day { position: absolute; left: 2%; top: 38%; width: min(330px, 74vw); transform-style: preserve-3d; transform: translate3d(calc(var(--i) * var(--step-x)), calc(var(--i) * var(--step-y)), calc(var(--i) * -100px)); }
@media (min-width: 640px) { .week { --step-x: 58px; --step-y: -36px; } }
.card { padding: 18px 20px 16px; border: 1px solid var(--line); border-radius: 20px; background: var(--card); box-shadow: 0 30px 60px -30px rgba(10, 36, 51, 0.5); opacity: calc(1 - var(--i) * 0.08); animation: bob 8s ease-in-out infinite; animation-delay: calc(var(--i) * -0.9s); }
.day-name { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; font: 700 16px var(--display); }
.day-name span { padding: 2px 10px; border-radius: 999px; background: var(--foam); color: var(--tide); font-size: 12px; }
.card ul { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; font-size: 15px; }
.card li { display: flex; align-items: center; gap: 10px; }
.card li::before { content: ""; flex: none; width: 14px; height: 14px; border: 2px solid var(--line); border-radius: 50%; }
.card li.done { color: var(--muted); text-decoration: line-through; }
.card li.done::before { border-color: var(--tide); background: var(--tide); box-shadow: inset 0 0 0 2px #fff; }
@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }

.tide { position: absolute; left: 0; right: 0; bottom: -1px; height: 130px; overflow: hidden; pointer-events: none; }
.tide svg { position: absolute; bottom: 0; left: 0; width: 200%; height: 100%; }
.tide .w1 { fill: var(--foam); animation: drift 22s linear infinite; }
.tide .w2 { fill: #ffffff; animation: drift 15s linear infinite reverse; }
@keyframes drift { to { transform: translateX(-50%); } }
.hero.off .card, .hero.off .tide svg { animation-play-state: paused; }

/* How it works: a real sequence, so it's numbered. */
.how { padding: clamp(64px, 9vw, 120px) var(--gutter); background: #ffffff; }
.how h2, .try h2, .cta h2 { margin: 0; font-size: clamp(32px, 4.6vw, 54px); line-height: 1.04; }
.steps { position: relative; display: grid; gap: 36px; margin: 56px 0 0; padding: 0; list-style: none; }
.steps::before { content: ""; position: absolute; left: 21px; top: 22px; bottom: 22px; width: 2px; background: linear-gradient(var(--tide), var(--foam)); transform-origin: top; }
.steps li { position: relative; padding-left: 68px; }
.num { position: absolute; left: 0; top: 0; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--deep); color: #fff; font: 700 17px var(--display); box-shadow: 0 0 0 6px #ffffff; }
.steps h3 { margin: 6px 0 6px; font-size: 22px; }
.steps p { max-width: 34ch; margin: 0; color: var(--muted); }
@media (min-width: 860px) {
  .steps { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 40px; }
  .steps::before { left: 22px; right: 22px; top: 21px; bottom: auto; width: auto; height: 2px; background: linear-gradient(90deg, var(--tide), var(--foam)); transform-origin: left; }
  .steps li { padding: 72px 0 0; }
}

/* Try it */
.try { padding: clamp(64px, 9vw, 120px) var(--gutter); }
.try-grid { display: grid; gap: 40px; align-items: start; }
@media (min-width: 960px) { .try-grid { grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); } }
.try-copy > p { max-width: 46ch; margin: 18px 0 0; color: var(--muted); }
.planner { display: grid; gap: 10px; margin-top: 26px; }
.planner label { font-weight: 600; font-size: 15px; }
textarea, input { width: 100%; border: 1px solid var(--line); border-radius: 12px; background: #ffffff; color: var(--deep); font: 16px/1.5 var(--body); transition: border-color 0.2s, box-shadow 0.2s; }
textarea { padding: 14px 16px; resize: vertical; }
textarea:focus, input:focus { border-color: var(--tide); box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.15); outline: none; }
.planner .button { justify-self: start; }
.board { padding: 18px; border: 1px solid var(--line); border-radius: 28px; background: rgba(255, 255, 255, 0.6); box-shadow: 0 40px 80px -50px rgba(10, 36, 51, 0.5); }
.plan { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.plan > li { display: grid; grid-template-columns: 48px minmax(0, 1fr); align-items: start; gap: 10px; min-height: 52px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 12px; background: #ffffff; }
.plan h3 { margin: 6px 0 0; color: var(--tide); font-size: 15px; letter-spacing: 0.01em; }
.plan ul { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 14px; line-height: 1.35; }
.plan ul li { padding: 6px 12px; border-radius: 999px; background: var(--mist); }
.plan ul .free { padding-left: 2px; background: none; color: var(--muted); font-style: italic; }
.plan-more { margin: 14px 4px 0; color: var(--muted); font-size: 14px; }

/* Quote */
.quote { padding: clamp(72px, 10vw, 140px) var(--gutter); background: var(--deep); color: #ffffff; }
.quote figure { margin: 0 auto; }
blockquote { max-width: 22ch; margin: 0; font: 700 clamp(32px, 5vw, 64px)/1.08 var(--display); letter-spacing: -0.035em; }
figcaption { margin-top: 24px; color: #9fd8cf; font-size: 15px; }

/* Sign-up */
.cta { padding: clamp(72px, 10vw, 130px) var(--gutter); text-align: center; }
.cta .wrap > p { margin: 14px auto 0; max-width: 40ch; color: var(--muted); }
.signup { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 520px; margin: 30px auto 0; }
.signup input { flex: 1 1 240px; min-height: 52px; padding: 0 18px; }
.signup-msg { margin: 14px 0 0; color: var(--muted); font-size: 14px; }
.signup-msg.ok { color: var(--tide); font-weight: 600; }

.foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 24px var(--gutter); border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
.foot p { margin: 0; }
.foot a { display: inline-flex; align-items: center; min-height: 44px; margin: -12px 0; }

/* Entrances run only when script.js is there to reveal them. */
.js .reveal { opacity: 0; transform: translateY(22px); transition: opacity 0.7s var(--ease), transform 0.7s var(--ease); }
.js .reveal.in { opacity: 1; transform: none; }
.js .steps::before { transform: scaleY(0); transition: transform 1.2s var(--ease) 0.2s; }
.js .steps.in::before { transform: none; }
@media (min-width: 860px) { .js .steps::before { transform: scaleX(0); } .js .steps.in::before { transform: none; } }
.plan.fresh > li { animation: rise 0.5s var(--ease) both; animation-delay: calc(var(--d) * 60ms); }
@keyframes rise { from { opacity: 0; transform: translateY(12px) scale(0.98); } }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .js .reveal, .js .steps::before { opacity: 1; transform: none; }
}
`;

const SCRIPT = `// Tidewater: small enhancements. The page is complete without this file.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canObserve = "IntersectionObserver" in window;

  // Sections rise in once as they scroll into view.
  var reveals = document.querySelectorAll(".reveal");
  if (canObserve && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // The floating week rests while it's off screen.
  var hero = document.querySelector(".hero");
  if (hero && canObserve) {
    new IntersectionObserver(function (entries) {
      hero.classList.toggle("off", !entries[0].isIntersecting);
    }).observe(hero);
  }

  // The planner: one task per line, three a day, in order; lines starting with ! go first.
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var form = document.getElementById("planner");
  var plan = document.getElementById("plan");
  var more = document.getElementById("plan-more");
  if (form && plan && more) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var lines = document.getElementById("notes").value.split(String.fromCharCode(10))
        .map(function (line) { return line.trim(); })
        .filter(Boolean);
      var first = lines.filter(function (l) { return l.charAt(0) === "!"; }).map(function (l) { return l.slice(1).trim(); }).filter(Boolean);
      var rest = lines.filter(function (l) { return l.charAt(0) !== "!"; });
      var tasks = first.concat(rest);
      plan.textContent = "";
      DAYS.forEach(function (name, d) {
        var day = document.createElement("li");
        day.style.setProperty("--d", String(d));
        var title = document.createElement("h3");
        title.textContent = name;
        var list = document.createElement("ul");
        var items = tasks.slice(d * 3, d * 3 + 3);
        if (items.length === 0) items = [null];
        items.forEach(function (text) {
          var item = document.createElement("li");
          if (text === null) {
            item.className = "free";
            item.textContent = "Free";
          } else {
            item.textContent = text;
          }
          list.appendChild(item);
        });
        day.appendChild(title);
        day.appendChild(list);
        plan.appendChild(day);
      });
      var extra = tasks.length - DAYS.length * 3;
      if (tasks.length === 0) more.textContent = "Add a task, one per line.";
      else if (extra > 0) more.textContent = "The week is full. " + extra + (extra === 1 ? " task waits" : " tasks wait") + " for next week.";
      else more.textContent = "Planned " + tasks.length + (tasks.length === 1 ? " task." : " tasks.");
      plan.classList.remove("fresh");
      void plan.offsetWidth;
      plan.classList.add("fresh");
    });
  }

  // The sign-up is a sample: it checks the address and says plainly that nothing was sent.
  var signup = document.getElementById("signup");
  var message = document.getElementById("signup-msg");
  if (signup && message) {
    signup.addEventListener("submit", function (event) {
      event.preventDefault();
      message.textContent = "Thanks. This is a sample form, so nothing was sent yet.";
      message.classList.add("ok");
      signup.reset();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Tidewater: design

Design read: a landing page for a weekly planner, for freelancers and small-team leads. Calm and confident, with soft depth and slow water motion.

## Palette (CSS variables in styles.css)

- \`--mist\` #eef4f6: the page, cool and airy
- \`--deep\` #0a2433: text, the primary button, the quote band
- \`--tide\` #0f766e: the one accent, for links, focus and highlights
- \`--foam\` #d5ece8: soft accent fills and the back wave
- \`--line\` #d3dee3: borders
- \`--muted\` #4a5f6b: secondary text

## Type

- Display: the rounded system face (ui-rounded, SF Pro Rounded), weight 700, tight tracking. Headlines only.
- Body: the system sans at 17px, line height 1.6.

## Layout

A split hero (the promise on the left, the floating week on the right), a numbered three-step sequence, a working planner, one quote band, one sign-up.

## Signature

The floating week: seven day cards stacked in 3D perspective, bobbing above a slow tide. It shows the promise (a whole week, three things a day) before a word is read.

## Motion

Cards bob on an 8 s loop and the waves drift; both pause off screen. Sections rise in once as they scroll into view, the step line draws itself, and the planner's days rise in when you plan. Buttons lift on hover and press down. Everything stops under prefers-reduced-motion, and the page is complete without JavaScript.

## Shape

Pills for buttons and chips, 12px for inputs and the planner's day rows, 20px cards, 28px for the planner board.

## When this becomes another brand

Update this file first. Keep the structure if it fits; change the palette, the display face and the signature to suit the new product.
`;

const README = `# Tidewater landing page (template)

A one-page landing page built to the Farbaek Studio standard: a hero with a floating 3D week, three steps, a planner that works in the browser, a quote and an email sign-up.

- \`DESIGN.md\`: the design decisions (palette, type, signature, motion). Change it first when the site becomes yours.
- \`script.js\`: scroll reveals, the planner and the sign-up message. The page works without it.

The product name, the quote and the tasks are sample content. Ask the agent to replace them with yours, for example: "Make this the landing page for my bookkeeping service in Colombo".

The sign-up form doesn't send anything yet. Connecting it to an email list is a separate change.
`;

export const LANDING_PAGE_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
  { path: "README.md", content: README },
];

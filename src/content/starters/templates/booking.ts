/**
 * Template: appointment booking (a physio clinic), built to the Studio
 * standard (ADR 0030, ADR 0124). Choose a treatment, a day and an open time
 * on a drawn day ribbon, then confirm: the booking is kept in this browser
 * and can be added to a calendar as a real .ics file. Sample content;
 * nothing is sent anywhere, and the page says so. Previews instantly and is
 * complete without JavaScript.
 */
import type { StarterFile } from "../types";

const SERVICES = [
  { id: "assessment", name: "First assessment", minutes: 60, price: 85, note: "A full look at what hurts and why, with a plan to take home." },
  { id: "follow-up", name: "Follow-up session", minutes: 30, price: 55, note: "Hands-on treatment and the next step in your plan." },
  { id: "sports", name: "Sports massage", minutes: 45, price: 65, note: "Deep work for tight muscles before or after a race." },
] as const;

const serviceCards = SERVICES.map(
  (s, i) => `            <label class="service">
              <input type="radio" name="service" value="${s.id}" data-minutes="${s.minutes}" data-price="${s.price}" data-name="${s.name}"${i === 0 ? " checked" : ""} />
              <span class="service-body">
                <strong>${s.name}</strong>
                <span class="service-meta">${s.minutes} min, $${s.price}</span>
                <small>${s.note}</small>
              </span>
            </label>`,
).join("\n");

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Northside Physio, book a visit (sample)</title>
    <meta name="description" content="Book a physiotherapy appointment online: choose a treatment, a day and a time. A sample booking site." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#book">Skip to booking</a>
    <header class="top">
      <a class="brand" href="#top" aria-label="Northside Physio, home"><span class="mark" aria-hidden="true"></span>Northside Physio</a>
      <a class="top-cta" href="#book">Book a visit</a>
    </header>

    <main id="top">
      <section class="hero">
        <p class="sample-note">Sample booking site: times and bookings are examples, and nothing is sent.</p>
        <h1>Move without the ache.</h1>
        <p class="lede">Book a physio appointment in under a minute. Pick what you need, a day that suits you and an open time.</p>
      </section>

      <section id="book" class="book" aria-labelledby="book-title">
        <h2 id="book-title">Book a visit</h2>
        <form id="booking" class="steps" novalidate>
          <fieldset class="step">
            <legend><span class="num" aria-hidden="true">1</span> Treatment</legend>
            <div class="services">
${serviceCards}
            </div>
          </fieldset>

          <fieldset class="step">
            <legend><span class="num" aria-hidden="true">2</span> Day</legend>
            <div class="days" id="days" role="radiogroup" aria-label="Day">
              <p class="no-js">Turn on JavaScript to see open days, or call us on 555 0142.</p>
            </div>
          </fieldset>

          <fieldset class="step">
            <legend><span class="num" aria-hidden="true">3</span> Time</legend>
            <div class="ribbon" id="ribbon" aria-hidden="true"></div>
            <div class="slots" id="slots" role="radiogroup" aria-label="Time"></div>
            <p class="hint" id="slots-hint">Choose a day to see open times.</p>
          </fieldset>

          <fieldset class="step">
            <legend><span class="num" aria-hidden="true">4</span> Your details</legend>
            <div class="fields">
              <label>Name <input id="name" name="name" autocomplete="name" required /></label>
              <label>Email <input id="email" name="email" type="email" autocomplete="email" required /></label>
            </div>
          </fieldset>

          <div class="summary" aria-live="polite">
            <p id="summary">Choose a day and a time.</p>
            <button type="submit" class="confirm" id="confirm" disabled>Confirm booking</button>
            <p class="error" id="error" hidden></p>
          </div>
        </form>

        <div class="done" id="done" hidden tabindex="-1">
          <h3>You're booked (sample)</h3>
          <p id="done-text"></p>
          <div class="done-actions">
            <a class="ics" id="ics" href="#book" download="northside-physio.ics">Add to calendar</a>
            <button type="button" class="again" id="again">Book another</button>
          </div>
          <p class="small">This is a sample, so no clinic received it. It's kept only in this browser.</p>
        </div>
      </section>

      <section class="info" aria-labelledby="info-title">
        <h2 id="info-title">Good to know</h2>
        <ul>
          <li><strong>Hours:</strong> weekdays 8am to 6pm, Saturdays 9am to 1pm.</li>
          <li><strong>Changing a visit:</strong> free up to 24 hours before.</li>
          <li><strong>What to wear:</strong> something you can move in.</li>
        </ul>
      </section>
    </main>

    <footer class="foot">
      <p>Northside Physio is a sample booking site made with Farbaek. Times, prices and bookings are sample content.</p>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `:root {
  --mist: #f3f7f5;
  --paper: #ffffff;
  --ink: #0f1f1a;
  --muted: #4d5f58;
  --line: #d7e3de;
  --forest: #1f5f4a;
  --forest-deep: #143f31;
  --mint: #d3ebe1;
  --taken: #e6ebe9;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
  background: var(--mist);
}

/* Filters hide items with the hidden attribute; a display rule must never bring them back. */
[hidden] { display: none !important; }
* { box-sizing: border-box; }
body { margin: 0; line-height: 1.5; }
:focus-visible { outline: 3px solid var(--forest); outline-offset: 3px; border-radius: 8px; }
.skip { position: absolute; left: -999px; top: 8px; background: var(--paper); padding: 10px 14px; border-radius: 999px; }
.skip:focus { left: 12px; z-index: 30; }

.top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px clamp(16px, 4vw, 40px); border-bottom: 1px solid var(--line); background: var(--paper); }
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; text-decoration: none; color: inherit; min-height: 44px; letter-spacing: -0.02em; }
.mark { width: 22px; height: 22px; border-radius: 7px; background: linear-gradient(135deg, var(--forest), #3f9474); transform: rotate(45deg) scale(0.8); }
.top-cta { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--forest); color: var(--paper); text-decoration: none; font-weight: 600; }

.hero { max-width: 900px; margin: 0 auto; padding: clamp(40px, 8vw, 88px) clamp(16px, 4vw, 40px) 24px; }
.sample-note { display: inline-block; margin: 0 0 16px; padding: 6px 12px; border-radius: 999px; border: 1px dashed var(--muted); color: var(--muted); font-size: 14px; }
.hero h1 { margin: 0; font-size: clamp(2.4rem, 7vw, 4.4rem); line-height: 1; letter-spacing: -0.045em; font-weight: 800; }
.lede { margin: 18px 0 0; font-size: clamp(1.05rem, 2vw, 1.25rem); color: var(--muted); max-width: 52ch; }

.book { max-width: 900px; margin: 0 auto; padding: 24px clamp(16px, 4vw, 40px) 56px; }
.book h2, .info h2 { font-size: clamp(1.5rem, 3vw, 2rem); letter-spacing: -0.03em; margin: 0 0 18px; }
.steps { display: grid; gap: 16px; }
.step { margin: 0; padding: 18px; border: 1px solid var(--line); border-radius: 20px; background: var(--paper); min-width: 0; }
.step legend { display: inline-flex; align-items: center; gap: 10px; padding: 0 6px; font-weight: 700; }
.num { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; background: var(--mint); color: var(--forest-deep); font-size: 14px; }

.services { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.service { position: relative; display: block; cursor: pointer; }
.service input { position: absolute; opacity: 0; inset: 0; }
.service-body { display: grid; gap: 4px; height: 100%; padding: 14px; border: 1.5px solid var(--line); border-radius: 16px; transition: border-color 160ms, background 160ms; }
.service-meta { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--forest-deep); font-size: 14px; }
.service small { color: var(--muted); }
.service input:checked + .service-body { border-color: var(--forest); background: var(--mint); }
.service input:focus-visible + .service-body { outline: 3px solid var(--forest); outline-offset: 2px; }

.days { display: flex; gap: 8px; overflow-x: auto; padding: 4px 2px 8px; scroll-snap-type: x mandatory; }
.day { flex: 0 0 auto; scroll-snap-align: start; display: grid; justify-items: center; gap: 2px; min-width: 64px; min-height: 64px; padding: 8px 10px; border-radius: 16px; border: 1.5px solid var(--line); background: var(--paper); font: inherit; cursor: pointer; color: var(--ink); }
.day small { color: var(--muted); font-size: 12px; }
.day strong { font-size: 1.1rem; font-variant-numeric: tabular-nums; }
.day[aria-checked="true"] { border-color: var(--forest); background: var(--forest); color: var(--paper); }
.day[aria-checked="true"] small { color: var(--mint); }
.day:disabled { opacity: 0.45; cursor: not-allowed; }

.ribbon { position: relative; height: 18px; margin: 4px 0 14px; border-radius: 999px; background: var(--taken); overflow: hidden; }
.ribbon span { position: absolute; top: 0; bottom: 0; border-radius: 999px; background: var(--mint); transform-origin: left; }
.ribbon span.picked { background: var(--forest); }
.slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
.slot { min-height: 44px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--paper); font: inherit; font-variant-numeric: tabular-nums; cursor: pointer; color: var(--ink); }
.slot:disabled { background: var(--taken); color: var(--muted); text-decoration: line-through; cursor: not-allowed; border-style: dashed; }
.slot[aria-checked="true"] { border-color: var(--forest); background: var(--forest); color: var(--paper); font-weight: 700; }
.hint { color: var(--muted); margin: 10px 0 0; }

.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.fields label { display: grid; gap: 6px; font-weight: 600; }
.fields input { min-height: 48px; border-radius: 12px; border: 1.5px solid var(--line); padding: 0 12px; font: inherit; font-size: 16px; font-weight: 400; background: var(--paper); color: var(--ink); }

.summary { display: grid; gap: 10px; padding: 18px; border-radius: 20px; background: var(--ink); color: var(--paper); }
.summary p { margin: 0; }
.confirm { min-height: 52px; border: 0; border-radius: 999px; background: var(--mint); color: var(--forest-deep); font: inherit; font-weight: 800; font-size: 1.05rem; cursor: pointer; }
.confirm:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: #ffd2c8; }

.done { margin-top: 18px; padding: 22px; border-radius: 20px; background: var(--paper); border: 1.5px solid var(--forest); }
.done h3 { margin: 0 0 6px; font-size: 1.4rem; }
.done-actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0 8px; }
.ics, .again { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
.ics { background: var(--forest); color: var(--paper); }
.again { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink); }
.small { color: var(--muted); font-size: 0.92rem; margin: 0; }

.info { max-width: 900px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 40px) 48px; }
.info ul { padding-left: 1.1rem; color: var(--muted); }
.info li { margin: 8px 0; }
.foot { padding: 28px clamp(16px, 4vw, 40px) 44px; text-align: center; color: var(--muted); border-top: 1px solid var(--line); font-size: 0.95rem; }

/* Before script.js runs (no .js class) the steps that need it say so; entrances wait for it. */
.js .no-js { display: none; }
.js .step { opacity: 0; transform: translateY(14px); }
.js .step.seen { opacity: 1; transform: none; transition: opacity 480ms ease-out, transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.ribbon span { animation: grow 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
@keyframes grow { from { transform: scaleX(0); } }

@media (max-width: 560px) {
  .top-cta { padding: 0 14px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .js .step { opacity: 1; transform: none; }
}
`;

const SCRIPT = `document.documentElement.classList.add("js");

(function () {
  var KEY = "northside-physio-sample-booking";
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var form = document.getElementById("booking");
  var daysEl = document.getElementById("days");
  var slotsEl = document.getElementById("slots");
  var ribbon = document.getElementById("ribbon");
  var summary = document.getElementById("summary");
  var confirm = document.getElementById("confirm");
  var picked = { day: null, time: null };

  // Opening hours by weekday (0 is Sunday): [open, close] in minutes after midnight, or null when closed.
  var HOURS = [null, [480, 1080], [480, 1080], [480, 1080], [480, 1080], [480, 1080], [540, 780]];
  var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function service() {
    var r = form.querySelector('input[name="service"]:checked');
    return { id: r.value, name: r.dataset.name, minutes: Number(r.dataset.minutes), price: Number(r.dataset.price) };
  }
  // Sample bookings: the same times are taken each time you look, worked out from the date.
  function taken(date, start) {
    var n = date.getFullYear() * 400 + date.getMonth() * 31 + date.getDate() + start / 15;
    return Math.sin(n * 12.9898) * 43758.5453 % 1 > 0.35;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function clock(min) { var h = Math.floor(min / 60), m = min % 60; return (h % 12 || 12) + ":" + pad(m) + (h < 12 ? " am" : " pm"); }

  // Entrances, once each step is on screen.
  var steps = Array.prototype.slice.call(document.querySelectorAll(".step"));
  if ("IntersectionObserver" in window && !still) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    steps.forEach(function (s) { io.observe(s); });
  } else {
    steps.forEach(function (s) { s.classList.add("seen"); });
  }

  // The next 14 days, closed days shown but not choosable.
  daysEl.innerHTML = "";
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  for (var i = 1; i <= 14; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() + i);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "day";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", "false");
    b.dataset.date = d.toISOString();
    b.innerHTML = "<small></small><strong></strong><small></small>";
    b.children[0].textContent = DAY[d.getDay()];
    b.children[1].textContent = String(d.getDate());
    b.children[2].textContent = MONTH[d.getMonth()];
    b.setAttribute("aria-label", DAY[d.getDay()] + " " + d.getDate() + " " + MONTH[d.getMonth()] + (HOURS[d.getDay()] ? "" : ", closed"));
    if (!HOURS[d.getDay()]) b.disabled = true;
    daysEl.appendChild(b);
  }

  function renderSlots() {
    slotsEl.innerHTML = "";
    ribbon.innerHTML = "";
    picked.time = null;
    if (!picked.day) return update();
    var h = HOURS[picked.day.getDay()];
    var len = service().minutes;
    var open = 0;
    for (var t = h[0]; t + len <= h[1]; t += 30) {
      var free = !taken(picked.day, t) && !taken(picked.day, t + 15);
      var s = document.createElement("button");
      s.type = "button";
      s.className = "slot";
      s.setAttribute("role", "radio");
      s.setAttribute("aria-checked", "false");
      s.dataset.start = String(t);
      s.textContent = clock(t);
      s.setAttribute("aria-label", clock(t) + (free ? "" : ", taken"));
      s.disabled = !free;
      slotsEl.appendChild(s);
      if (free) {
        open += 1;
        var bar = document.createElement("span");
        bar.style.left = ((t - h[0]) / (h[1] - h[0])) * 100 + "%";
        bar.style.width = (len / (h[1] - h[0])) * 100 + "%";
        bar.dataset.start = String(t);
        ribbon.appendChild(bar);
      }
    }
    document.getElementById("slots-hint").textContent = open ? open + " open times. Taken times are crossed out." : "Nothing open that day for this treatment. Try another day.";
    update();
  }

  function update() {
    var sv = service();
    confirm.disabled = !(picked.day && picked.time !== null);
    summary.textContent = picked.day && picked.time !== null
      ? sv.name + ", " + DAY[picked.day.getDay()] + " " + picked.day.getDate() + " " + MONTH[picked.day.getMonth()] + " at " + clock(picked.time) + ". " + sv.minutes + " min, $" + sv.price + "."
      : "Choose a day and a time.";
  }

  daysEl.addEventListener("click", function (e) {
    var b = e.target.closest(".day");
    if (!b || b.disabled) return;
    Array.prototype.forEach.call(daysEl.children, function (x) { x.setAttribute("aria-checked", String(x === b)); });
    picked.day = new Date(b.dataset.date);
    renderSlots();
  });
  slotsEl.addEventListener("click", function (e) {
    var s = e.target.closest(".slot");
    if (!s || s.disabled) return;
    Array.prototype.forEach.call(slotsEl.children, function (x) { x.setAttribute("aria-checked", String(x === s)); });
    picked.time = Number(s.dataset.start);
    Array.prototype.forEach.call(ribbon.children, function (x) { x.classList.toggle("picked", x.dataset.start === s.dataset.start); });
    update();
  });
  Array.prototype.forEach.call(form.querySelectorAll('input[name="service"]'), function (r) {
    r.addEventListener("change", renderSlots);
  });

  function ics(start, minutes, title) {
    function stamp(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z"; }
    var end = new Date(start.getTime() + minutes * 60000);
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Northside Physio sample//EN", "BEGIN:VEVENT", "UID:" + start.getTime() + "@northside.example", "DTSTAMP:" + stamp(new Date()), "DTSTART:" + stamp(start), "DTEND:" + stamp(end), "SUMMARY:" + title + " (sample)", "LOCATION:Northside Physio", "END:VEVENT", "END:VCALENDAR"].join("\\r\\n");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = document.getElementById("error");
    var name = document.getElementById("name").value.trim();
    var email = document.getElementById("email").value.trim();
    if (!name || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {
      err.hidden = false;
      err.textContent = !name ? "Add your name so we know who's coming." : "Add an email address like name@example.com.";
      return;
    }
    err.hidden = true;
    var sv = service();
    var start = new Date(picked.day);
    start.setMinutes(picked.time);
    try { localStorage.setItem(KEY, JSON.stringify({ service: sv.id, start: start.toISOString(), name: name })); } catch (x) {}
    var link = document.getElementById("ics");
    link.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics(start, sv.minutes, sv.name));
    document.getElementById("done-text").textContent = summary.textContent + " A confirmation would go to " + email + ".";
    form.hidden = true;
    var done = document.getElementById("done");
    done.hidden = false;
    done.focus();
  });
  document.getElementById("again").addEventListener("click", function () {
    document.getElementById("done").hidden = true;
    form.hidden = false;
    renderSlots();
  });

  update();
})();
`;

const DESIGN = `# Design plan: Northside Physio (sample booking site)

Built to the Studio standard. Sample content: replace the treatments, hours and copy with your own.

## Palette

- Mist #f3f7f5 for the page and paper #ffffff for the steps.
- Ink #0f1f1a for text and the summary bar; muted #4d5f58 for secondary text.
- Forest #1f5f4a is the one accent: chosen days and times and the main buttons. Mint #d3ebe1 marks open time.

## Type

- System sans (system-ui) throughout, heavy and tightly tracked for the headline.
- Monospace for durations and prices, so they line up.

## Layout

- A short hero, then one form in four numbered steps: treatment, day, time, details.
- Days scroll sideways as large pills; times fill a grid that reflows on phones.
- A dark summary bar holds the booking in one sentence and the confirm button.

## Signature

The day ribbon: one bar per open time, drawn across the day's opening hours, so you can see at a glance how full a day is. The chosen time turns forest green.

## Motion

- Steps rise in once as they come on screen.
- The ribbon's bars grow in from the left when a day is chosen.
- Under reduced motion, everything is still and fully visible.
`;

const README = `# Northside Physio (sample booking site)

A sample appointment booking site made with Farbaek. Everything here is sample content.

- \`index.html\`: the page and the four-step form.
- \`styles.css\`: the look.
- \`script.js\`: open days and times from the opening hours, sample bookings that block times, the summary, and a downloadable calendar file.
- \`DESIGN.md\`: the design plan.

Bookings are kept only in this browser and nothing is sent. Ask Farbaek to connect a real calendar or booking service when you're ready.
`;

export const BOOKING_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
  { path: "README.md", content: README },
];

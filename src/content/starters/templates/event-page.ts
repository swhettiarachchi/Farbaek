/**
 * Template: a page for an event: date and place up front, the schedule,
 * speakers and a way to register. Sample content; previews instantly.
 */
import type { StarterFile } from "../types";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Build Day 2027: one day of making things</title>
    <meta name="description" content="Build Day is a one-day meetup for people who make software. Sample event page." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="head">
      <a class="mark" href="#top">Build Day</a>
      <a class="reg" href="#register">Register</a>
    </header>

    <main id="top">
      <section class="hero">
        <p class="when"><time datetime="2027-03-14">14 March 2027</time> · Lakeside Hall</p>
        <h1>One day of making things, together.</h1>
        <p class="lead">Talks in the morning, building in the afternoon, demos at five. Bring a laptop and an idea.</p>
        <a class="btn" href="#register">Save your seat</a>
        <p class="seats">Sample event. 120 seats.</p>
      </section>

      <section class="schedule" aria-labelledby="schedule-title">
        <h2 id="schedule-title">Schedule</h2>
        <ol>
          <li><time>09:00</time><div><h3>Doors and coffee</h3><p>Find a table, meet your neighbours.</p></div></li>
          <li><time>10:00</time><div><h3>Short talks</h3><p>Four talks, fifteen minutes each.</p></div></li>
          <li><time>12:30</time><div><h3>Lunch</h3><p>Rice and curry, vegetarian options.</p></div></li>
          <li><time>13:30</time><div><h3>Build</h3><p>Work alone or in a team of up to four.</p></div></li>
          <li><time>17:00</time><div><h3>Demos</h3><p>Three minutes each, no slides needed.</p></div></li>
        </ol>
      </section>

      <section class="speakers" aria-labelledby="speakers-title">
        <h2 id="speakers-title">Speakers</h2>
        <p class="sample">Sample speakers.</p>
        <ul>
          <li><span class="avatar" aria-hidden="true">AP</span><b>Asha Perera</b><small>Making apps that work offline</small></li>
          <li><span class="avatar" aria-hidden="true">MK</span><b>Malik Khan</b><small>Your first hundred users</small></li>
          <li><span class="avatar" aria-hidden="true">SR</span><b>Sofia Reyes</b><small>Design for people in a hurry</small></li>
        </ul>
      </section>

      <section id="register" class="register">
        <h2>Register</h2>
        <p>Free, with lunch. This sample page doesn't take registrations yet.</p>
        <a class="btn" href="mailto:hello@example.com?subject=Build%20Day">Email to reserve a seat</a>
      </section>
    </main>

    <footer class="foot">Build Day is a sample event.</footer>
  </body>
</html>
`;

const STYLES = `:root {
  --bg: #0e1730;
  --panel: #16224a;
  --ink: #eef1fb;
  --muted: #a7b1d1;
  --line: #2a3766;
  --coral: #ff6b5a;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 var(--font); }
a { color: inherit; }

.head { display: flex; align-items: center; justify-content: space-between; padding: 18px clamp(16px, 5vw, 64px); }
.mark { font-family: var(--mono); font-weight: 700; text-decoration: none; letter-spacing: 0.02em; }
.mark::before { content: "▲ "; color: var(--coral); }
.reg { text-decoration: none; border-bottom: 2px solid var(--coral); }

.hero { padding: clamp(56px, 10vw, 128px) clamp(16px, 5vw, 64px); background: radial-gradient(60% 80% at 85% 10%, rgb(255 107 90 / 0.22), transparent 70%); }
.when { margin: 0 0 18px; font-family: var(--mono); color: var(--coral); }
h1 { margin: 0; max-width: 15ch; font-size: clamp(42px, 8vw, 88px); line-height: 0.98; letter-spacing: -0.05em; }
.lead { max-width: 46ch; color: var(--muted); font-size: 19px; }
.btn { display: inline-flex; align-items: center; min-height: 48px; padding: 0 22px; margin-top: 12px; border-radius: 999px; background: var(--coral); color: #1d0c09; font-weight: 700; text-decoration: none; }
.seats { margin: 12px 0 0; color: var(--muted); font-size: 14px; }

.schedule, .speakers, .register { max-width: 980px; margin: 0 auto; padding: 64px clamp(16px, 5vw, 64px); border-top: 1px solid var(--line); }
h2 { margin: 0 0 24px; font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.03em; }
.schedule ol { margin: 0; padding: 0; list-style: none; }
.schedule li { display: grid; grid-template-columns: 90px 1fr; gap: 16px; padding: 18px 0; border-bottom: 1px solid var(--line); }
.schedule time { font-family: var(--mono); color: var(--coral); }
.schedule h3 { margin: 0; font-size: 19px; }
.schedule p { margin: 2px 0 0; color: var(--muted); }

.sample { margin: -16px 0 20px; color: var(--muted); font-size: 14px; }
.speakers ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.speakers li { display: grid; gap: 4px; padding: 20px; background: var(--panel); border: 1px solid var(--line); border-radius: 20px; }
.avatar { display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: 8px; border-radius: 50%; background: var(--coral); color: #1d0c09; font-weight: 800; }
.speakers small { color: var(--muted); font-size: 15px; }

.register p { color: var(--muted); }
.foot { padding: 24px clamp(16px, 5vw, 64px); color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); }
`;

const README = `# Build Day event page (template)

A page for an event: date and place, a schedule, speakers and a way to register.

The event, date, schedule and speakers are sample content. Ask the agent to make it yours, for example: "Make this the page for our book club meetup on 3 May at the city library".

Registering is an email link for now. A real sign-up form is a separate change.
`;

export const EVENT_PAGE_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "README.md", content: README },
];

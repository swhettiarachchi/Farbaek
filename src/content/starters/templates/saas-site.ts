/**
 * Template: a marketing site for a software product, built to the Studio
 * standard (ADR 0030). The hero is a working sample of the product (a tilted
 * invoice screen whose reminders really change state), then a chase
 * timeline you can scrub, a bento of features, plans with a monthly and
 * yearly switch, and questions. Sample content; previews instantly and is
 * complete without JavaScript.
 */
import type { StarterFile } from "../types";

type Status = "overdue" | "reminded" | "sent" | "paid";
const INVOICES: { id: string; client: string; amount: number; status: Status; note: string }[] = [
  { id: "1042", client: "Hale Studio", amount: 2150, status: "overdue", note: "6 days overdue" },
  { id: "1041", client: "Okafor and Daughters", amount: 1200, status: "reminded", note: "Reminder 1 sent" },
  { id: "1040", client: "Brightline Dental", amount: 3870, status: "sent", note: "Due in 5 days" },
  { id: "1039", client: "Kite Coffee", amount: 1200, status: "paid", note: "Paid yesterday" },
];
const LABEL: Record<Status, string> = { overdue: "Overdue", reminded: "Reminded", sent: "Sent", paid: "Paid" };
const ACTION: Record<Status, string | null> = { overdue: "Send reminder", reminded: "Mark paid", sent: "Send reminder", paid: null };
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const invoiceRows = INVOICES.map(
  (inv) => `              <li class="inv" data-status="${inv.status}" data-amount="${inv.amount}" data-client="${inv.client}">
                <span class="who"><strong>${inv.client}</strong><small><span class="mono">#${inv.id}</span> · <span class="inv-note">${inv.note}</span></small></span>
                <span class="amt mono">${money(inv.amount)}</span>
                <span class="chip s-${inv.status}"><span class="glyph" aria-hidden="true"></span><span class="chip-label">${LABEL[inv.status]}</span></span>
                ${ACTION[inv.status] ? `<button class="act" type="button">${ACTION[inv.status]}</button>` : `<span class="act-none" aria-hidden="true"></span>`}
              </li>`,
).join("\n");

const outstanding = INVOICES.filter((i) => i.status !== "paid").reduce((n, i) => n + i.amount, 0);

const BARS = [
  ["May", 52],
  ["Jun", 64],
  ["Jul", 58],
  ["Aug", 76],
  ["Sep", 70],
  ["Oct", 92],
] as const;
const chart = BARS.map(
  ([m, h], i) => `<g style="--b: ${i}"><rect class="bar" x="${i * 46 + 8}" y="${100 - h}" width="28" height="${h}" rx="6" /><text x="${i * 46 + 22}" y="116" text-anchor="middle">${m}</text></g>`,
).join("");

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ledgerly: invoices that chase themselves</title>
    <meta name="description" content="Ledgerly sends your invoices, follows up politely and tells you the moment you're paid. Sample software site." />
    <meta name="theme-color" content="#f5f6f8" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="bar">
      <a class="brand" href="#top">
        <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true"><rect width="28" height="28" rx="8" fill="#121417" /><path d="M9 7v14h10" fill="none" stroke="#f97316" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        Ledgerly
      </a>
      <nav class="nav" aria-label="Main">
        <a class="nav-link" href="#chase">How it chases</a>
        <a class="nav-link" href="#features">Features</a>
        <a class="nav-link" href="#pricing">Pricing</a>
        <a class="pill" href="#start">Start free</a>
      </nav>
    </header>

    <main id="main">
      <section class="hero" id="top">
        <div class="hero-copy">
          <h1>Invoices that chase themselves.</h1>
          <p class="lead">Send it once. Ledgerly follows up politely and tells you the moment it's paid.</p>
          <div class="actions">
            <a class="button" href="#start">Start free for 14 days</a>
            <a class="link" href="#pricing">See pricing <span aria-hidden="true">&rarr;</span></a>
          </div>
          <p class="note">A sample product. Clients, amounts and prices here are sample content.</p>
        </div>

        <div class="stage" id="stage">
          <div class="app" role="region" aria-label="A working sample of the Ledgerly invoice screen">
            <div class="app-top">
              <span class="lights" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="app-title">Invoices</span>
              <span class="owed">Outstanding <strong class="mono" id="owed">${money(outstanding)}</strong></span>
            </div>
            <ul class="invoices" id="invoices">
${invoiceRows}
            </ul>
            <div class="app-foot">
              <div>
                <p class="k">Paid by month</p>
                <p class="v mono">$12,960 <span>in October</span></p>
              </div>
              <svg class="chart" viewBox="0 0 284 122" role="img" aria-label="Sample chart: payments rising from May to October">${chart}</svg>
            </div>
          </div>
          <p class="toast" id="toast" role="status"><span class="glyph" aria-hidden="true"></span><span id="toast-text">Paid: Kite Coffee, $1,200.00</span></p>
        </div>
      </section>

      <section class="chase" id="chase" aria-labelledby="chase-title">
        <div class="wrap chase-grid">
          <div class="reveal">
            <h2 id="chase-title">Everything after "Send" happens on its own.</h2>
            <p class="sub">Choose how firm to be. Ledgerly writes each follow-up in your words and stops the moment the invoice is paid. Drag the slider to see what goes out.</p>
            <div class="scrub">
              <label for="days">Days since the invoice went out: <output id="days-out" for="days" class="mono">7</output></label>
              <input id="days" type="range" min="0" max="21" step="1" value="7" />
            </div>
            <ol class="steps" id="steps">
              <li data-day="0"><span class="mono">Day 0</span> Invoice sent</li>
              <li data-day="3"><span class="mono">Day 3</span> A friendly nudge</li>
              <li data-day="7" class="on"><span class="mono">Day 7</span> A firm reminder</li>
              <li data-day="14"><span class="mono">Day 14</span> Final notice, late fee added</li>
            </ol>
          </div>
          <article class="email reveal" aria-live="polite" aria-label="The email that goes out">
            <p class="email-meta"><span>To: accounts@hale.example</span><span class="mono" id="email-when">Day 7</span></p>
            <h3 id="email-subject">Invoice #1042 is now a week overdue</h3>
            <p id="email-body">Hi Priya, a quick reminder that invoice #1042 for $2,150.00 was due last Tuesday. You can pay by card or bank transfer from the link below. If it's already on its way, thank you, and please ignore this.</p>
            <p class="email-pay"><span class="pay-btn">Pay $2,150.00</span><span class="mono">Sample email</span></p>
          </article>
        </div>
      </section>

      <section class="features" id="features" aria-labelledby="features-title">
        <div class="wrap">
          <h2 id="features-title" class="reveal">Built for people who'd rather do the work than chase it.</h2>
          <div class="bento">
            <article class="tile t-pay reveal">
              <h3>Paid by card or bank transfer</h3>
              <p>Every invoice carries a payment link. Clients pay in two taps; you see it within the minute.</p>
              <div class="paysheet" aria-hidden="true">
                <span class="ps-row"><span class="ps-dot"></span>Card ending 4242<span class="mono">$2,150.00</span></span>
                <span class="ps-row muted"><span class="ps-dot"></span>Bank transfer<span class="mono">1 to 2 days</span></span>
                <span class="ps-btn">Pay now</span>
              </div>
            </article>
            <article class="tile t-fee reveal">
              <h3>Late fees, worked out</h3>
              <p>Set a rate once. Ledgerly adds it on the day you choose, and says so in the email.</p>
              <p class="big mono">2%<span> after 14 days</span></p>
            </article>
            <article class="tile t-tone reveal">
              <h3>Your words, your tone</h3>
              <div class="seg" role="group" aria-label="Reminder tone">
                <button type="button" aria-pressed="true" data-tone="friendly">Friendly</button>
                <button type="button" aria-pressed="false" data-tone="firm">Firm</button>
              </div>
              <p class="tone-line" id="tone-line">"Just a nudge on invoice #1042. No rush if it's already on its way."</p>
            </article>
            <article class="tile t-log reveal">
              <h3>Every follow-up on the record</h3>
              <ol class="log">
                <li><span class="mono">09:00</span> Reminder 2 of 3 sent to Hale Studio</li>
                <li><span class="mono">11:42</span> Hale Studio opened the invoice</li>
                <li><span class="mono">14:05</span> Paid by card: $2,150.00</li>
              </ol>
            </article>
          </div>
        </div>
      </section>

      <section class="pricing" id="pricing" aria-labelledby="pricing-title">
        <div class="wrap">
          <div class="pricing-head reveal">
            <h2 id="pricing-title">Simple plans. Sample prices.</h2>
            <div class="seg billing" role="group" aria-label="Billing period">
              <button type="button" aria-pressed="true" data-period="monthly">Monthly</button>
              <button type="button" aria-pressed="false" data-period="yearly">Yearly, 2 months free</button>
            </div>
          </div>
          <div class="plans">
            <article class="plan reveal">
              <h3>Solo</h3>
              <p class="plan-for">For freelancers with a handful of clients.</p>
              <p class="price"><span class="mono amount" data-monthly="12" data-yearly="10">$12</span><span class="per">a month</span></p>
              <ul>
                <li>Unlimited invoices</li>
                <li>Automatic reminders</li>
                <li>Card and bank payments</li>
              </ul>
              <a class="button ghost" href="#start">Start free</a>
            </article>
            <article class="plan featured reveal">
              <p class="badge">Most teams pick this</p>
              <h3>Studio</h3>
              <p class="plan-for">For small teams that bill every week.</p>
              <p class="price"><span class="mono amount" data-monthly="29" data-yearly="24">$29</span><span class="per">a month</span></p>
              <ul>
                <li>Everything in Solo</li>
                <li>Late fees and your own tone</li>
                <li>Up to 5 teammates</li>
              </ul>
              <a class="button" href="#start">Start free</a>
            </article>
          </div>
          <p class="billing-note" id="billing-note">Billed monthly. Cancel any time.</p>
        </div>
      </section>

      <section class="faq" aria-labelledby="faq-title">
        <div class="wrap faq-grid">
          <h2 id="faq-title" class="reveal">Questions</h2>
          <div class="qs reveal">
            <details>
              <summary>Will my clients know the reminders are automatic?</summary>
              <p>They come from your address, in your words, signed by you. Ledgerly only decides when to send them.</p>
            </details>
            <details>
              <summary>What happens when a client pays?</summary>
              <p>Reminders stop at once, the invoice is marked paid and a receipt goes out. You get one short note.</p>
            </details>
            <details>
              <summary>Can I pause reminders for one client?</summary>
              <p>Yes. Pause a client or a single invoice, and pick it up again whenever you like.</p>
            </details>
            <details>
              <summary>Is this a real product?</summary>
              <p>No. Ledgerly is sample content in a Farbaek template. Ask the agent to make it about your product.</p>
            </details>
          </div>
        </div>
      </section>

      <section class="final" id="start" aria-labelledby="start-title">
        <div class="wrap reveal">
          <h2 id="start-title">Stop chasing. Start sending.</h2>
          <p>Fourteen days free, no card needed.</p>
          <form class="signup" id="signup">
            <label class="sr-only" for="email">Work email</label>
            <input id="email" type="email" autocomplete="email" placeholder="you@studio.com" required />
            <button class="button light" type="submit">Start my free trial</button>
          </form>
          <p class="signup-msg" id="signup-msg" role="status">A sample offer: this form doesn't create an account yet.</p>
        </div>
      </section>
    </main>

    <footer class="foot">
      <p>&copy; <span id="year">2026</span> Ledgerly. A sample site.</p>
      <a href="#top">Back to top</a>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `/* Ledgerly. The design decisions behind these tokens are in DESIGN.md. */
:root {
  --paper: #f5f6f8;
  --ink: #121417;
  --orange: #c2410c;
  --flare: #f97316;
  --orange-soft: #fdebe1;
  --paid: #15803d;
  --paid-soft: #e3f4e8;
  --muted: #565c66;
  --line: #e1e4e9;
  --card: #ffffff;
  --display: "Segoe UI Variable Display", "SF Pro Display", system-ui, -apple-system, sans-serif;
  --body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(16px, 5vw, 64px);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.6 var(--body); -webkit-font-smoothing: antialiased; overflow-x: hidden; }
a { color: inherit; }
h1, h2, h3 { font-family: var(--display); font-weight: 650; letter-spacing: -0.035em; }
h2 { margin: 0; font-size: clamp(30px, 4.4vw, 52px); line-height: 1.05; }
.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
:focus-visible { outline: 3px solid var(--orange); outline-offset: 3px; border-radius: 8px; }
.skip { position: absolute; left: 16px; top: -60px; z-index: 20; padding: 10px 16px; border-radius: 999px; background: var(--ink); color: #fff; }
.skip:focus { top: 12px; }
.wrap { max-width: 1160px; margin: 0 auto; }

.bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px var(--gutter); background: rgba(245, 246, 248, 0.85); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid rgba(225, 228, 233, 0.7); }
.brand { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; font: 650 19px var(--display); letter-spacing: -0.03em; text-decoration: none; }
.nav { display: flex; align-items: center; gap: 2px; }
.nav-link { display: none; min-height: 44px; align-items: center; padding: 0 14px; border-radius: 999px; color: var(--muted); font-size: 15px; text-decoration: none; }
.nav-link:hover { color: var(--ink); background: rgba(18, 20, 23, 0.05); }
.pill { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--ink); color: #fff; font-size: 15px; font-weight: 600; text-decoration: none; }
.pill:hover { background: var(--orange); }
@media (min-width: 820px) { .nav-link { display: inline-flex; } }

.button { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 26px; border: 0; border-radius: 999px; background: var(--orange); color: #fff; font: 600 16px var(--body); text-decoration: none; cursor: pointer; box-shadow: 0 12px 30px -14px rgba(194, 65, 12, 0.8); transition: transform 0.2s var(--ease), box-shadow 0.2s, background-color 0.2s; }
.button:hover { transform: translateY(-2px); box-shadow: 0 18px 36px -14px rgba(194, 65, 12, 0.85); }
.button:active { transform: translateY(1px); }
.button.ghost { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--ink); }
.button.ghost:hover { background: var(--ink); color: #fff; }
.button.light { background: #fff; color: var(--ink); box-shadow: none; }
.link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-weight: 600; text-underline-offset: 5px; }
.link span { transition: transform 0.2s var(--ease); }
.link:hover span { transform: translateX(4px); }

/* Hero: the promise, and a working sample of the product, tilted in 3D. */
.hero { display: grid; align-items: center; gap: 48px; min-height: calc(100dvh - 69px); padding: clamp(32px, 6vw, 72px) var(--gutter) clamp(56px, 8vw, 96px); overflow: hidden; }
@media (min-width: 1000px) { .hero { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); } }
h1 { margin: 0; max-width: 15ch; font-size: clamp(42px, 5.4vw, 76px); line-height: 0.98; letter-spacing: -0.05em; }
.lead { max-width: 36ch; margin: 22px 0 0; color: var(--muted); font-size: clamp(18px, 1.6vw, 21px); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; margin-top: 32px; }
.note { margin: 26px 0 0; color: var(--muted); font-size: 13px; }

.stage { --rx: 0deg; --ry: 0deg; position: relative; perspective: 1800px; padding: 24px 0 40px; }
.stage::before { content: ""; position: absolute; inset: 8% 4% 0 10%; border-radius: 50%; background: radial-gradient(closest-side, rgba(249, 115, 22, 0.18), rgba(249, 115, 22, 0)); }
.app { position: relative; border-radius: 20px; background: var(--card); box-shadow: 0 0 0 1px var(--line), 0 50px 100px -40px rgba(18, 20, 23, 0.45), 0 20px 40px -30px rgba(18, 20, 23, 0.3); transform: rotateY(calc(-14deg + var(--ry))) rotateX(calc(7deg + var(--rx))); transition: transform 0.5s var(--ease); animation: app-in 1.1s var(--ease) both; }
@keyframes app-in { from { opacity: 0; translate: 0 40px; } }
.app-top { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.lights { display: inline-flex; gap: 6px; }
.lights i { width: 10px; height: 10px; border-radius: 50%; background: var(--line); }
.app-title { font: 650 16px var(--display); }
.owed { margin-left: auto; color: var(--muted); font-size: 14px; }
.owed strong { margin-left: 6px; color: var(--ink); font-size: 16px; }
.invoices { margin: 0; padding: 6px 10px; list-style: none; }
.inv { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "who amt" "chip act"; align-items: center; gap: 6px 12px; padding: 12px 8px; border-bottom: 1px solid var(--line); }
.inv:last-child { border-bottom: 0; }
@media (min-width: 560px) { .inv { grid-template-columns: minmax(0, 1fr) auto auto 132px; grid-template-areas: "who amt chip act"; } }
.who { grid-area: who; display: grid; min-width: 0; }
.who strong { overflow: hidden; font-size: 15px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.who small { color: var(--muted); font-size: 13px; }
.amt { grid-area: amt; justify-self: end; font-size: 15px; }
.chip { grid-area: chip; display: inline-flex; align-items: center; gap: 6px; justify-self: start; padding: 3px 10px 3px 8px; border-radius: 999px; font-size: 12.5px; font-weight: 600; }
.chip .glyph, .toast .glyph { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; font-size: 11px; line-height: 1; }
.s-overdue { background: var(--orange-soft); color: var(--orange); }
.s-overdue .glyph::before { content: "!"; font-weight: 800; }
.s-overdue .glyph { background: var(--orange); color: #fff; animation: ping 2.4s var(--ease) infinite; }
.s-reminded { background: #eceef2; color: var(--ink); }
.s-reminded .glyph::before { content: "\\21BB"; }
.s-sent { background: transparent; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
.s-sent .glyph::before { content: "\\2192"; }
.s-paid { background: var(--paid-soft); color: var(--paid); }
.s-paid .glyph::before, .toast .glyph::before { content: "\\2713"; font-weight: 800; }
@keyframes ping { 0% { box-shadow: 0 0 0 0 rgba(194, 65, 12, 0.5); } 70%, 100% { box-shadow: 0 0 0 8px rgba(194, 65, 12, 0); } }
.act { grid-area: act; justify-self: end; min-height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ink); font: 600 13px var(--body); cursor: pointer; transition: background-color 0.2s, border-color 0.2s, transform 0.15s; }
.act:hover { border-color: var(--ink); }
.act:active { transform: scale(0.97); }
.inv.flash { animation: flash 0.9s var(--ease); }
@keyframes flash { from { background: var(--orange-soft); } }
.app-foot { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 14px 18px 16px; border-top: 1px solid var(--line); }
.app-foot .k { margin: 0; color: var(--muted); font-size: 13px; }
.app-foot .v { margin: 2px 0 0; font-size: 22px; }
.app-foot .v span { color: var(--muted); font: 13px var(--body); }
.chart { width: min(284px, 100%); height: auto; }
.chart .bar { fill: var(--ink); transform-box: fill-box; transform-origin: bottom; animation: grow 0.9s var(--ease) both; animation-delay: calc(0.5s + var(--b) * 80ms); }
.chart g:last-child .bar { fill: var(--flare); }
.chart text { fill: var(--muted); font: 11px var(--body); }
@keyframes grow { from { transform: scaleY(0); } }
.toast { position: absolute; right: -6px; bottom: 6px; display: inline-flex; align-items: center; gap: 8px; margin: 0; padding: 10px 16px 10px 12px; border-radius: 999px; background: var(--ink); color: #fff; font-size: 14px; box-shadow: 0 20px 40px -18px rgba(18, 20, 23, 0.6); transform: translate3d(calc(var(--ry) * -2), calc(var(--rx) * 2), 0); transition: transform 0.5s var(--ease); animation: toast-in 0.7s var(--ease) 1.2s both; }
.toast .glyph { background: var(--paid); color: #fff; }
.toast.pop { animation: toast-pop 0.6s var(--ease); }
@keyframes toast-in { from { opacity: 0; translate: 0 16px; } }
@keyframes toast-pop { 40% { scale: 1.06; } }
.stage.off .s-overdue .glyph { animation-play-state: paused; }

/* The chase: scrub through what goes out. */
.chase { padding: clamp(72px, 10vw, 128px) var(--gutter); background: var(--ink); color: #fff; }
.chase-grid { display: grid; gap: 48px; align-items: center; }
@media (min-width: 960px) { .chase-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.chase .sub { max-width: 46ch; margin: 18px 0 0; color: #b9bec7; }
.scrub { display: grid; gap: 10px; margin-top: 32px; }
.scrub label { font-size: 15px; color: #d7dbe1; }
.scrub output { margin-left: 4px; color: #fff; font-weight: 700; }
input[type="range"] { width: 100%; height: 44px; margin: 0; background: transparent; accent-color: var(--flare); cursor: pointer; }
.steps { display: grid; gap: 6px; margin: 18px 0 0; padding: 0; list-style: none; }
.steps li { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 12px; color: #9aa1ab; transition: background-color 0.3s, color 0.3s; }
.steps li .mono { min-width: 56px; font-size: 13px; }
.steps li.done { color: #d7dbe1; }
.steps li.on { background: rgba(255, 255, 255, 0.08); color: #fff; }
.steps li.on .mono { color: var(--flare); }
.email { padding: clamp(20px, 3vw, 32px); border-radius: 28px; background: #fff; color: var(--ink); box-shadow: 0 40px 80px -40px rgba(0, 0, 0, 0.6); }
.email-meta { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 14px; padding-bottom: 12px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 13px; }
.email h3 { margin: 0 0 10px; font-size: 22px; line-height: 1.2; }
.email p { margin: 0; }
#email-body { color: #33373e; }
.email-pay { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px !important; color: var(--muted); font-size: 12px; }
.pay-btn { padding: 10px 18px; border-radius: 999px; background: var(--orange); color: #fff; font-size: 14px; font-weight: 600; }
.email.swap { animation: swap 0.45s var(--ease); }
@keyframes swap { from { opacity: 0.2; translate: 0 8px; } }

/* Features: a bento, not three equal cards. */
.features { padding: clamp(72px, 10vw, 128px) var(--gutter); }
.features h2 { max-width: 20ch; }
.bento { display: grid; gap: 14px; margin-top: 48px; }
@media (min-width: 900px) {
  .bento { grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: minmax(180px, auto); }
  .t-pay { grid-column: span 4; grid-row: span 2; }
  .t-fee { grid-column: span 2; }
  .t-tone { grid-column: span 2; }
  .t-log { grid-column: span 6; }
}
.tile { position: relative; overflow: hidden; padding: 24px; border: 1px solid var(--line); border-radius: 20px; background: var(--card); transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease); }
.tile:hover { transform: translateY(-3px); box-shadow: 0 30px 60px -40px rgba(18, 20, 23, 0.4); }
.tile h3 { margin: 0 0 8px; font-size: 21px; }
.tile p { max-width: 44ch; margin: 0; color: var(--muted); }
.paysheet { display: grid; gap: 10px; max-width: 380px; margin-top: 28px; padding: 18px; border-radius: 20px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
.ps-row { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; background: #fff; box-shadow: 0 0 0 1.5px var(--ink); font-size: 15px; }
.ps-row .mono { margin-left: auto; }
.ps-row.muted { box-shadow: 0 0 0 1px var(--line); color: var(--muted); }
.ps-dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 4px var(--ink); }
.ps-row.muted .ps-dot { box-shadow: inset 0 0 0 1.5px var(--line); }
.ps-btn { justify-self: stretch; padding: 12px; border-radius: 999px; background: var(--ink); color: #fff; font-weight: 600; text-align: center; }
.big { margin-top: 20px !important; color: var(--ink) !important; font-size: 56px; line-height: 1; letter-spacing: -0.04em; }
.big span { color: var(--muted); font: 15px var(--body); letter-spacing: 0; }
.seg { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
.seg button { min-height: 40px; padding: 0 16px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: 600 14px var(--body); cursor: pointer; transition: background-color 0.2s, color 0.2s; }
.seg button[aria-pressed="true"] { background: var(--ink); color: #fff; }
.tone-line { margin-top: 18px !important; color: var(--ink) !important; font-size: 16px; }
.log { display: grid; gap: 0; margin: 14px 0 0; padding: 0; list-style: none; }
.log li { display: flex; gap: 16px; padding: 10px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 15px; }
.log .mono { color: var(--ink); }

/* Pricing */
.pricing { padding: clamp(72px, 10vw, 128px) var(--gutter); background: #fff; border-block: 1px solid var(--line); }
.pricing-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 20px; }
.plans { display: grid; gap: 18px; max-width: 860px; margin: 44px auto 0; }
@media (min-width: 760px) { .plans { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.plan { position: relative; display: grid; align-content: start; gap: 6px; padding: 30px; border: 1px solid var(--line); border-radius: 28px; background: var(--paper); }
.plan.featured { background: var(--ink); color: #fff; border-color: var(--ink); box-shadow: 0 40px 80px -40px rgba(18, 20, 23, 0.55); }
.plan h3 { margin: 0; font-size: 24px; }
.plan-for { margin: 0; color: var(--muted); }
.featured .plan-for { color: #b9bec7; }
.badge { position: absolute; top: -14px; left: 26px; margin: 0; padding: 4px 12px; border-radius: 999px; background: var(--flare); color: var(--ink); font-size: 13px; font-weight: 700; }
.price { display: flex; align-items: baseline; gap: 8px; margin: 14px 0 6px; }
.amount { font-size: 54px; line-height: 1; letter-spacing: -0.04em; }
.per { color: var(--muted); }
.featured .per { color: #b9bec7; }
.amount.roll { animation: roll 0.45s var(--ease); }
@keyframes roll { from { opacity: 0; translate: 0 -14px; } }
.plan ul { display: grid; gap: 8px; margin: 10px 0 22px; padding: 0; list-style: none; }
.plan li { display: flex; gap: 10px; }
.plan li::before { content: "\\2713"; color: var(--orange); font-weight: 800; }
.featured li::before { color: var(--flare); }
.featured .button { background: var(--flare); color: var(--ink); }
.plan .button { justify-self: start; }
.billing-note { margin: 22px 0 0; color: var(--muted); font-size: 14px; text-align: center; }

/* Questions */
.faq { padding: clamp(72px, 10vw, 128px) var(--gutter); }
.faq-grid { display: grid; gap: 32px; }
@media (min-width: 900px) { .faq-grid { grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr); } }
.qs { border-top: 1px solid var(--line); }
details { border-bottom: 1px solid var(--line); }
summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; cursor: pointer; font-size: 18px; font-weight: 600; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary::after { content: "+"; flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--line); font-weight: 400; transition: transform 0.3s var(--ease); }
details[open] summary::after { transform: rotate(45deg); }
details p { max-width: 60ch; margin: 0 0 20px; color: var(--muted); }

.final { padding: clamp(72px, 10vw, 128px) var(--gutter); background: var(--orange); color: #fff; text-align: center; }
.final h2 { font-size: clamp(36px, 6vw, 72px); }
.final p { max-width: 46ch; margin: 16px auto 0; color: #fff3ec; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.signup { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 540px; margin: 30px auto 0; }
.signup input { flex: 1 1 240px; min-height: 52px; padding: 0 18px; border: 0; border-radius: 12px; background: #fff; color: var(--ink); font: 16px var(--body); }
.signup input:focus { outline: 3px solid var(--ink); outline-offset: 2px; }
.final .signup-msg { margin-top: 14px; font-size: 14px; }

.foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 24px var(--gutter); color: var(--muted); font-size: 14px; }
.foot p { margin: 0; }
.foot a { display: inline-flex; align-items: center; min-height: 44px; margin: -12px 0; }

.js .reveal { opacity: 0; transform: translateY(22px); transition: opacity 0.7s var(--ease), transform 0.7s var(--ease); }
.js .reveal.in { opacity: 1; transform: none; }

@media (max-width: 559px) { .app { transform: rotateX(4deg); } .toast { right: 8px; } }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .js .reveal { opacity: 1; transform: none; }
}
`;

const SCRIPT = `// Ledgerly: the working sample and small enhancements. The page is complete without this file.
(function () {
  document.documentElement.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;
  var canObserve = "IntersectionObserver" in window;
  var money = function (n) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  // Sections rise in once as they scroll into view.
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

  // The product screen leans toward the pointer, and rests when it's off screen.
  var stage = document.getElementById("stage");
  if (stage && finePointer && !reduce) {
    stage.addEventListener("pointermove", function (e) {
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty("--ry", (x * 10).toFixed(2) + "deg");
      stage.style.setProperty("--rx", (y * -8).toFixed(2) + "deg");
    });
    stage.addEventListener("pointerleave", function () {
      stage.style.setProperty("--ry", "0deg");
      stage.style.setProperty("--rx", "0deg");
    });
  }
  if (stage && canObserve) {
    new IntersectionObserver(function (entries) { stage.classList.toggle("off", !entries[0].isIntersecting); }).observe(stage);
  }

  // The invoices work: send a reminder, then mark it paid. The total follows.
  var LABELS = { overdue: "Overdue", reminded: "Reminded", sent: "Sent", paid: "Paid" };
  var list = document.getElementById("invoices");
  var owed = document.getElementById("owed");
  var toast = document.getElementById("toast");
  var toastText = document.getElementById("toast-text");
  function total() {
    var sum = 0;
    list.querySelectorAll(".inv").forEach(function (row) { if (row.dataset.status !== "paid") sum += Number(row.dataset.amount); });
    owed.textContent = money(sum);
  }
  function say(text) {
    toastText.textContent = text;
    toast.classList.remove("pop");
    void toast.offsetWidth;
    toast.classList.add("pop");
  }
  if (list && owed && toast && toastText) {
    list.addEventListener("click", function (e) {
      var button = e.target.closest(".act");
      if (!button || button.tagName !== "BUTTON") return;
      var row = button.closest(".inv");
      var client = row.dataset.client;
      var next = row.dataset.status === "reminded" ? "paid" : "reminded";
      row.dataset.status = next;
      var chip = row.querySelector(".chip");
      chip.className = "chip s-" + next;
      chip.querySelector(".chip-label").textContent = LABELS[next];
      row.querySelector(".inv-note").textContent = next === "paid" ? "Paid just now" : "Reminder sent just now";
      if (next === "paid") {
        var gone = document.createElement("span");
        gone.className = "act-none";
        button.replaceWith(gone);
        say("Paid: " + client + ", " + money(Number(row.dataset.amount)));
      } else {
        button.textContent = "Mark paid";
        say("Reminder sent to " + client);
      }
      row.classList.remove("flash");
      void row.offsetWidth;
      row.classList.add("flash");
      total();
    });
  }

  // The chase timeline: scrub the days and see the email that would go out.
  var EMAILS = [
    { day: 0, subject: "Invoice #1042 from Lumen Studio", body: "Hi Priya, here's invoice #1042 for $2,150.00, due in 14 days. You can pay by card or bank transfer from the link below. Thanks for the work together." },
    { day: 3, subject: "A quick nudge on invoice #1042", body: "Hi Priya, just a friendly nudge that invoice #1042 for $2,150.00 is due soon. If it's already on its way, thank you, and please ignore this." },
    { day: 7, subject: "Invoice #1042 is now a week overdue", body: "Hi Priya, a quick reminder that invoice #1042 for $2,150.00 was due last Tuesday. You can pay by card or bank transfer from the link below. If it's already on its way, thank you, and please ignore this." },
    { day: 14, subject: "Final notice: invoice #1042", body: "Hi Priya, invoice #1042 is now two weeks overdue, so a 2% late fee of $43.00 has been added, as agreed in our terms. The new total is $2,193.00. Please pay from the link below, or reply if something's wrong." }
  ];
  var range = document.getElementById("days");
  var out = document.getElementById("days-out");
  var steps = document.querySelectorAll("#steps li");
  var email = document.querySelector(".email");
  var subject = document.getElementById("email-subject");
  var body = document.getElementById("email-body");
  var when = document.getElementById("email-when");
  var payLabel = document.querySelector(".pay-btn");
  var shown = 7;
  function showDay(days) {
    out.textContent = String(days);
    var current = EMAILS[0];
    EMAILS.forEach(function (m) { if (days >= m.day) current = m; });
    steps.forEach(function (li) {
      var d = Number(li.dataset.day);
      li.classList.toggle("on", d === current.day);
      li.classList.toggle("done", d < current.day);
    });
    if (current.day !== shown) {
      shown = current.day;
      subject.textContent = current.subject;
      body.textContent = current.body;
      when.textContent = "Day " + current.day;
      payLabel.textContent = current.day >= 14 ? "Pay $2,193.00" : "Pay $2,150.00";
      email.classList.remove("swap");
      void email.offsetWidth;
      email.classList.add("swap");
    }
  }
  if (range && out && email) range.addEventListener("input", function () { showDay(Number(range.value)); });

  // Tone: friendly or firm.
  var TONES = {
    friendly: "\\u201CJust a nudge on invoice #1042. No rush if it's already on its way.\\u201D",
    firm: "\\u201CInvoice #1042 is 7 days overdue. Please pay by Friday, or reply to arrange a date.\\u201D"
  };
  var toneLine = document.getElementById("tone-line");
  document.querySelectorAll("[data-tone]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-tone]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      toneLine.textContent = TONES[b.dataset.tone];
    });
  });

  // Billing period: monthly or yearly.
  var note = document.getElementById("billing-note");
  document.querySelectorAll("[data-period]").forEach(function (b) {
    b.addEventListener("click", function () {
      var period = b.dataset.period;
      document.querySelectorAll("[data-period]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      document.querySelectorAll(".amount").forEach(function (a) {
        a.textContent = "$" + a.dataset[period];
        a.classList.remove("roll");
        void a.offsetWidth;
        a.classList.add("roll");
      });
      note.textContent = period === "yearly" ? "Billed yearly, a month's price shown. Cancel any time." : "Billed monthly. Cancel any time.";
    });
  });

  // The trial sign-up is a sample: it says plainly that no account was made.
  var signup = document.getElementById("signup");
  var signupMsg = document.getElementById("signup-msg");
  if (signup && signupMsg) {
    signup.addEventListener("submit", function (e) {
      e.preventDefault();
      signupMsg.textContent = "Thanks. This is a sample, so no account was created yet.";
      signup.reset();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Ledgerly: design

Design read: a software site for freelancers and small studios who invoice clients. Confident and precise, with the product itself as the hero.

## Palette (CSS variables in styles.css)

- \`--paper\` #f5f6f8: the page, a cool off-white
- \`--ink\` #121417: text, dark bands, the featured plan
- \`--orange\` #c2410c: the one accent, for actions and anything overdue (AA on white)
- \`--flare\` #f97316: a brighter orange for fills and highlights on dark, never for small text on light
- \`--paid\` #15803d: only for the Paid status, always with a tick and a label
- \`--muted\` #565c66 and \`--line\` #e1e4e9: secondary text and borders

## Type

- Display: Segoe UI Variable Display or SF Pro Display, weight 650, tracking -0.035em to -0.05em.
- Body: the system sans at 17px.
- Numbers: the system monospace with tabular figures, so amounts line up like a ledger.

## Layout

A split hero (promise left, the product right), a dark band where you scrub the chase timeline, a bento of four features in mixed sizes, two plans with a period switch, questions, an orange closing band.

## Signature

The live ledger: a working invoice screen, tilted in 3D, that leans toward the pointer. Reminders really send and invoices really get paid, and the total follows.

## Motion

The product screen rises in and its chart bars grow on load; the overdue mark pings. Sections rise in once on scroll. Scrubbing the chase swaps the email, switching billing rolls the prices. Everything stops under prefers-reduced-motion, and the page is complete without JavaScript.

## Shape

Pills for buttons, chips and switches; 12px rows; 20px cards and tiles; 28px for plans and the email.

## When this becomes another product

Update this file first. Keep the product-as-hero idea: replace the invoice screen with a small, working piece of the real product.
`;

const README = `# Ledgerly software site (template)

A software marketing site built to the Farbaek Studio standard: a working, tilted product screen as the hero, a chase timeline you can scrub, a bento of features, plans with a monthly and yearly switch, and questions.

- \`DESIGN.md\`: the design decisions. Change it first when the site becomes yours.
- \`script.js\`: the working sample (reminders, payments, the timeline, tone and billing switches) and scroll reveals. The page works without it.

The product, clients, amounts, emails and prices are sample content. Ask the agent to replace them, for example: "Turn this into the site for my appointment booking app for clinics, with plans at $12 and $29 a month".

The Start free buttons don't sign anyone up yet. Connecting sign-up and payments is a separate change.
`;

export const SAAS_SITE_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
  { path: "README.md", content: README },
];

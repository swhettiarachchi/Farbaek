/**
 * Template: a site for a software product, the premium direction for apps,
 * tools and startups (ADR 0165): built on the Farbaek Studio kit, light by
 * default, with the craft of the "Software product site" skill. The hero is
 * a working sample of the product, a live ledger floating in 3D whose
 * reminders really send and invoices really get paid, with its notices
 * hovering in front of it. Then a dark chapter over a horizon scene where
 * scrolling (or the slider) walks through every follow-up that goes out, a
 * bento of features that work, plans with a monthly and yearly switch,
 * questions and an honest sign-up. Real photos in replaceable slots. Sample
 * content throughout; complete without JavaScript.
 */
import { KIT_URL } from "@/core/media/library";
import { photoUrl } from "@/core/media/photos";
import { STUDIO_KIT_CSS, STUDIO_KIT_JS } from "@/core/media/studio-kit";
import type { StarterFile } from "../types";

const photo = (id: string, w: number, h: number, slot: string, alt: string) =>
  `<img src="${photoUrl(id, w, h)}" alt="${alt}" width="${w}" height="${h}" loading="lazy" data-farbaek-media="${slot}" data-farbaek-placeholder />`;

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
  (inv) => `                  <li class="inv" data-status="${inv.status}" data-amount="${inv.amount}" data-client="${inv.client}">
                    <span class="who"><strong>${inv.client}</strong><small><span class="mono">#${inv.id}</span> · <span class="inv-note">${inv.note}</span></small></span>
                    <span class="amt mono">${money(inv.amount)}</span>
                    <span class="state s-${inv.status}"><span class="glyph" aria-hidden="true"></span><span class="state-label">${LABEL[inv.status]}</span></span>
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
  ([m, h], i) => `<g style="--b: ${i}"><rect class="bar" x="${i * 46 + 8}" y="${100 - h}" width="28" height="${h}" rx="7" /><text x="${i * 46 + 22}" y="116" text-anchor="middle">${m}</text></g>`,
).join("");

// The follow-ups, in order: the timeline, the slider and the email all read from this.
const CHASE = [
  { day: 0, title: "Invoice sent", subject: "Invoice #1042 from Lumen Studio", body: "Hi Priya, here's invoice #1042 for $2,150.00, due in 14 days. You can pay by card or bank transfer from the link below. Thanks for the work together.", pay: "$2,150.00" },
  { day: 3, title: "A friendly nudge", subject: "A quick nudge on invoice #1042", body: "Hi Priya, just a friendly nudge that invoice #1042 for $2,150.00 is due soon. If it's already on its way, thank you, and please ignore this.", pay: "$2,150.00" },
  { day: 7, title: "A firm reminder", subject: "Invoice #1042 is now a week overdue", body: "Hi Priya, a quick reminder that invoice #1042 for $2,150.00 was due last Tuesday. You can pay by card or bank transfer from the link below. If it's already on its way, thank you, and please ignore this.", pay: "$2,150.00" },
  { day: 14, title: "Final notice, late fee added", subject: "Final notice: invoice #1042", body: "Hi Priya, invoice #1042 is now two weeks overdue, so a 2% late fee of $43.00 has been added, as agreed in our terms. The new total is $2,193.00. Please pay from the link below, or reply if something's wrong.", pay: "$2,193.00" },
] as const;

const chaseSteps = CHASE.map(
  (c, i) => `            <article class="chase-step${i === 2 ? " is-on" : ""}" data-day="${c.day}" data-fs-reveal>
              <p class="mono chase-step__day">Day ${c.day}</p>
              <h3 class="fs-h3">${c.title}</h3>
            </article>`,
).join("\n");

const TEAM = "1603201667141-5a2d4c673378";
const DESK = "1758518730083-4c12527b6742";
const FACE = "1630487656049-6db93a53a7e9";

const INDEX = `<!doctype html>
<html lang="en" data-fs-look="signal">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ledgerly: invoices that chase themselves</title>
    <meta name="description" content="Ledgerly sends your invoices, follows up politely in your words and tells you the moment you're paid. A sample software site." />
    <script>document.documentElement.classList.add("fs-js");</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&amp;family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="fs-skip" href="#main">Skip to content</a>
    <header class="fs-nav">
      <a class="fs-nav__brand" href="#top"><span class="mark" aria-hidden="true"></span>Ledgerly</a>
      <ul class="fs-nav__links">
        <li><a href="#chase">How it chases</a></li>
        <li><a href="#features">Features</a></li>
        <li><a href="#pricing">Pricing</a></li>
        <li><a href="#questions">Questions</a></li>
      </ul>
      <a class="fs-btn" href="#start">Start free <span class="fs-btn__icon" aria-hidden="true"></span></a>
      <button class="fs-nav__toggle" type="button" aria-label="Open the menu"></button>
    </header>
    <nav class="fs-menu" aria-label="Menu">
      <a href="#chase">How it chases</a>
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a href="#questions">Questions</a>
      <a href="#start">Start free</a>
    </nav>

    <main id="main">
      <section class="hero" id="top">
        <div class="fs-glow" aria-hidden="true"></div>
        <div class="fs-container hero__grid">
          <div class="hero__copy">
            <h1 class="fs-display hero__claim" data-fs-reveal="words">Invoices that chase themselves.</h1>
            <p class="fs-lead" data-fs-reveal>Send it once. Ledgerly follows up politely, in your words, and tells you the moment you're paid.</p>
            <div class="fs-actions" data-fs-reveal>
              <a class="fs-btn" href="#start">Start free for 14 days <span class="fs-btn__icon" aria-hidden="true"></span></a>
              <a class="fs-btn fs-btn--ghost" href="#chase">See how it chases</a>
            </div>
            <p class="fs-small hero__note" data-fs-reveal>A sample product. Press the buttons in the ledger: they work.</p>
          </div>

          <div class="hero__stage" data-fs-reveal="scale">
            <div class="ledger-tilt" data-fs-tilt="4">
              <div class="ledger-3d">
                <div class="ledger" role="region" aria-label="A working sample of the Ledgerly invoice screen">
                  <div class="ledger__top">
                    <span class="lights" aria-hidden="true"><i></i><i></i><i></i></span>
                    <span class="ledger__title">Invoices</span>
                    <span class="owed">Outstanding <strong class="mono" id="owed">${money(outstanding)}</strong></span>
                  </div>
                  <ul class="invoices" id="invoices">
${invoiceRows}
                  </ul>
                  <div class="ledger__foot">
                    <div>
                      <p class="k">Paid by month</p>
                      <p class="v mono">$12,960 <span>in October</span></p>
                    </div>
                    <svg class="chart" viewBox="0 0 284 122" role="img" aria-label="Sample chart: payments rising from May to October">${chart}</svg>
                  </div>
                </div>
                <p class="float float--paid" id="toast" role="status"><span class="tick" aria-hidden="true"></span><span id="toast-text">Paid: Kite Coffee, $1,200.00</span></p>
                <p class="float float--next" aria-hidden="true"><span class="mono">Day 7</span> Firm reminder to Hale Studio</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--ink chase" id="chase" aria-labelledby="chase-title">
        <div class="chase__scene" data-farbaek-scene="horizon" data-farbaek-media="chase-scene" data-tone="dark" data-intensity="0.5" aria-hidden="true"></div>
        <div class="fs-container fs-head">
          <h2 class="fs-h2" id="chase-title" data-fs-reveal>Everything after Send happens on its own.</h2>
          <p class="fs-lead" data-fs-reveal>Choose how firm to be. Ledgerly writes each follow-up in your words and stops the moment the invoice is paid.</p>
        </div>
        <div class="fs-container chase__grid">
          <div class="chase__stage" id="chase-stage">
            <article class="email" aria-live="polite" aria-label="The email that goes out">
              <p class="email__meta"><span>To: accounts@hale.example</span><span class="mono" id="email-when">Day 7</span></p>
              <h3 id="email-subject">Invoice #1042 is now a week overdue</h3>
              <p id="email-body">Hi Priya, a quick reminder that invoice #1042 for $2,150.00 was due last Tuesday. You can pay by card or bank transfer from the link below. If it's already on its way, thank you, and please ignore this.</p>
              <p class="email__pay"><span class="pay" id="email-pay">Pay $2,150.00</span><span class="fs-sample">Sample email</span></p>
            </article>
            <div class="scrub">
              <label for="days">Days since the invoice went out: <output id="days-out" for="days" class="mono">7</output></label>
              <input id="days" type="range" min="0" max="21" step="1" value="7" />
            </div>
          </div>
          <div class="chase__steps">
${chaseSteps}
          </div>
        </div>
      </section>

      <section class="fs-section" id="features" aria-labelledby="features-title">
        <div class="fs-container">
          <div class="fs-head fs-head--split">
            <h2 class="fs-h2" id="features-title" data-fs-reveal>Built for people who'd rather do the work than chase it.</h2>
            <p class="fs-lead" data-fs-reveal>Everything a small studio needs to get paid on time, and nothing it has to babysit.</p>
          </div>
          <div class="bento" data-fs-stagger>
            <article class="tile tile--pay" data-fs-reveal>
              <h3 class="fs-h3">Paid by card or bank transfer</h3>
              <p>Every invoice carries a payment link. Clients pay in two taps, and you see it within the minute.</p>
              <div class="paysheet" aria-hidden="true">
                <span class="ps-row"><svg class="ps-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Card ending 4242<span class="mono">$2,150.00</span></span>
                <span class="ps-row muted"><span class="ps-gap"></span>Bank transfer<span class="mono">1 to 2 days</span></span>
                <span class="ps-btn">Pay now</span>
              </div>
            </article>
            <article class="tile tile--photo" data-fs-reveal>
              <div class="fs-frame tile__frame" data-fs-tilt="5">
                ${photo(TEAM, 1200, 900, "feature-team", "Three people working together around a table with laptops")}
              </div>
              <p class="tile__caption">For studios that bill every week, from one to a dozen people.</p>
            </article>
            <article class="tile tile--tone" data-fs-reveal>
              <h3 class="fs-h3">Your words, your tone</h3>
              <div class="seg" role="group" aria-label="Reminder tone">
                <button type="button" aria-pressed="true" data-tone="friendly">Friendly</button>
                <button type="button" aria-pressed="false" data-tone="firm">Firm</button>
              </div>
              <p class="tone-line" id="tone-line">"Just a nudge on invoice #1042. No rush if it's already on its way."</p>
            </article>
            <article class="tile tile--fee" data-fs-reveal>
              <h3 class="fs-h3">Late fees, worked out</h3>
              <p>Set a rate once. Ledgerly adds it on the day you choose, and says so in the email.</p>
              <p class="big"><span data-fs-count>2</span>%<span class="big__note"> after 14 days</span></p>
            </article>
            <article class="tile tile--log" data-fs-reveal>
              <h3 class="fs-h3">Every follow-up on the record</h3>
              <ol class="log">
                <li><span class="mono">09:00</span> Reminder 2 of 3 sent to Hale Studio</li>
                <li><span class="mono">11:42</span> Hale Studio opened the invoice</li>
                <li><span class="mono">14:05</span> Paid by card: $2,150.00</li>
              </ol>
            </article>
          </div>
        </div>
      </section>

      <section class="fs-section fs-section--raised">
        <div class="fs-container fs-split">
          <div class="fs-split__text">
            <figure class="fs-quote" data-fs-reveal>
              <blockquote>We used to spend Friday afternoons chasing invoices. Now Ledgerly does it, and we only hear about the payments.</blockquote>
              <figcaption>
                ${photo(FACE, 96, 96, "quote-photo", "A man working at a table with colleagues")}
                <span>Ravi, studio lead at a design team</span>
                <span class="fs-sample">Sample quote</span>
              </figcaption>
            </figure>
          </div>
          <div data-fs-reveal="scale">
            <div class="fs-frame quote__frame" data-fs-tilt="5">
              ${photo(DESK, 1200, 1000, "quote-desk", "A person working at a desk with a laptop and notes")}
            </div>
          </div>
        </div>
      </section>

      <section class="fs-section" id="pricing" aria-labelledby="pricing-title">
        <div class="fs-container">
          <div class="pricing__head">
            <h2 class="fs-h2" id="pricing-title" data-fs-reveal>Simple plans. Sample prices.</h2>
            <div class="seg" role="group" aria-label="Billing period" data-fs-reveal>
              <button type="button" aria-pressed="true" data-period="monthly">Monthly</button>
              <button type="button" aria-pressed="false" data-period="yearly">Yearly, 2 months free</button>
            </div>
          </div>
          <div class="plans" data-fs-stagger>
            <article class="plan" data-fs-reveal>
              <h3 class="fs-h3">Solo</h3>
              <p class="plan__for">For freelancers with a handful of clients.</p>
              <p class="price"><span class="amount" data-monthly="12" data-yearly="10">$12</span><span class="per">a month</span></p>
              <ul class="fs-list">
                <li>Unlimited invoices</li>
                <li>Automatic reminders</li>
                <li>Card and bank payments</li>
              </ul>
              <a class="fs-btn fs-btn--ghost" href="#start">Start free</a>
            </article>
            <article class="plan plan--featured" data-fs-reveal>
              <p class="plan__badge">Most studios pick this</p>
              <h3 class="fs-h3">Studio</h3>
              <p class="plan__for">For small teams that bill every week.</p>
              <p class="price"><span class="amount" data-monthly="29" data-yearly="24">$29</span><span class="per">a month</span></p>
              <ul class="fs-list">
                <li>Everything in Solo</li>
                <li>Late fees and your own tone</li>
                <li>Up to 5 teammates</li>
              </ul>
              <a class="fs-btn" href="#start">Start free <span class="fs-btn__icon" aria-hidden="true"></span></a>
            </article>
          </div>
          <p class="fs-small billing-note" id="billing-note" role="status">Billed monthly. Cancel any time.</p>
        </div>
      </section>

      <section class="fs-section fs-section--raised" id="questions" aria-labelledby="questions-title">
        <div class="fs-container fs-split fs-split--wide">
          <div class="fs-head">
            <h2 class="fs-h2" id="questions-title" data-fs-reveal>Questions</h2>
            <p class="fs-lead" data-fs-reveal>Anything else, write to us and a person answers.</p>
          </div>
          <div class="fs-faq" data-fs-reveal>
            <details><summary>Will my clients know the reminders are automatic?</summary><p>They come from your address, in your words, signed by you. Ledgerly only decides when to send them.</p></details>
            <details><summary>What happens when a client pays?</summary><p>Reminders stop at once, the invoice is marked paid and a receipt goes out. You get one short note.</p></details>
            <details><summary>Can I pause reminders for one client?</summary><p>Yes. Pause a client or a single invoice, and pick it up again whenever you like.</p></details>
            <details><summary>Is this a real product?</summary><p>No. Ledgerly is sample content in a Farbaek template. Ask the agent to make it about your product.</p></details>
          </div>
        </div>
      </section>

      <section class="fs-section" id="start" aria-labelledby="start-title">
        <div class="fs-container">
          <div class="fs-cta signup" data-fs-reveal="scale">
            <h2 class="fs-h2" id="start-title">Stop chasing. Start sending.</h2>
            <p class="fs-lead">Fourteen days free, no card needed.</p>
            <form class="signup__form" id="signup" novalidate>
              <div class="field">
                <label for="signup-email">Work email</label>
                <input id="signup-email" name="email" type="email" autocomplete="email" placeholder="you@studio.com" required />
              </div>
              <button class="fs-btn" type="submit">Start my free trial <span class="fs-btn__icon" aria-hidden="true"></span></button>
            </form>
            <p class="fs-small" id="signup-msg" role="status">A sample offer: this form doesn't create an account yet.</p>
          </div>
        </div>
      </section>
    </main>

    <footer class="fs-footer">
      <div class="fs-container">
        <div class="fs-footer__grid">
          <div><h2>Product</h2><ul><li><a href="#chase">How it chases</a></li><li><a href="#features">Features</a></li><li><a href="#pricing">Pricing</a></li></ul></div>
          <div><h2>Help</h2><ul><li><a href="#questions">Questions</a></li><li><a href="mailto:hello@ledgerly.example">Write to us</a></li></ul></div>
          <div><h2>Ledgerly</h2><p>Invoicing for people who'd rather do the work.</p></div>
        </div>
        <div class="fs-footer__base"><span>&copy; <span id="year">2026</span> Ledgerly. A sample site.</span><span>Prices in US dollars</span></div>
        <div class="fs-wordmark" aria-hidden="true">Ledgerly</div>
      </div>
    </footer>

    <script type="module" src="${KIT_URL}"></script>
    <script type="module" src="${STUDIO_KIT_JS}"></script>
    <script src="script.js" defer></script>
  </body>
</html>
`;

const STYLES = `/* Ledgerly: the brand on top of the Farbaek Studio kit. The decisions are in DESIGN.md. */
:root {
  --accent: #c2410c;
  --accent-2: #f97316;
  --on-accent: #ffffff;
  --ink: #121417;
  --ink-2: #545a64;
  --paper: #f6f7f9;
  --paper-2: #ffffff;
  --line: rgb(18 20 23 / 0.1);
  --font-display: "Sora", ui-sans-serif, system-ui, sans-serif;
  --font-body: "DM Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "Cascadia Mono", monospace;
  --paid: #15803d;
  --paid-soft: #e3f4e8;
  --accent-soft: #fdebe1;
  --radius: 18px;
  --radius-lg: 30px;
  --fs-display-weight: 600;
  --fs-display-track: -0.045em;
}

[hidden] { display: none !important; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.mark { position: relative; width: 24px; height: 24px; border-radius: 8px; background: var(--ink); }
.mark::after { content: ""; position: absolute; left: 7px; top: 5px; width: 9px; height: 12px; border-left: 3px solid var(--accent-2); border-bottom: 3px solid var(--accent-2); border-radius: 0 0 0 3px; }

/* The hero: the promise on the left, the product floating in 3D on the right. */
.hero { position: relative; isolation: isolate; padding: 132px 0 clamp(64px, 9vw, 120px); overflow: clip; }
.hero .fs-glow { inset: 10% -20% auto 30%; height: 80%; }
.hero__grid { display: grid; gap: clamp(40px, 6vw, 72px); align-items: center; }
@media (min-width: 1000px) { .hero__grid { grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); } }
.hero__copy { display: grid; gap: 22px; justify-items: start; }
.hero__claim { font-size: clamp(42px, 6vw, 88px); max-width: 12ch; line-height: 0.98; }
.hero__note { color: var(--ink-2); }

/* The ledger: a working screen, tilted, with its notices floating in front at their own depth. */
.hero__stage { perspective: 1800px; padding: 24px 0 40px; }
@media (min-width: 1000px) { .hero__stage { padding-right: 32px; } }
.ledger-tilt { position: relative; border-radius: 22px; }
.ledger-3d { position: relative; transform-style: preserve-3d; transform: rotateY(-11deg) rotateX(6deg); }
.ledger { position: relative; border-radius: 22px; background: var(--paper-2); box-shadow: 0 0 0 1px var(--line), 0 60px 110px -50px rgb(18 20 23 / 0.5), 0 24px 48px -30px rgb(194 65 12 / 0.35); overflow: hidden; }
.ledger__top { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.lights { display: inline-flex; gap: 6px; }
.lights i { width: 10px; height: 10px; border-radius: 50%; background: rgb(18 20 23 / 0.12); }
.ledger__title { font: 600 16px var(--font-display); letter-spacing: -0.02em; }
.owed { margin-left: auto; color: var(--ink-2); font-size: 14px; }
.owed strong { margin-left: 6px; color: var(--ink); font-size: 16px; }
.invoices { margin: 0; padding: 6px 10px; list-style: none; }
.inv { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "who amt" "state act"; align-items: center; gap: 6px 12px; padding: 12px 8px; border-bottom: 1px solid var(--line); border-radius: 12px; }
.inv:last-child { border-bottom: 0; }
@media (min-width: 560px) { .inv { grid-template-columns: minmax(0, 1fr) auto auto 132px; grid-template-areas: "who amt state act"; } }
.who { grid-area: who; display: grid; min-width: 0; }
.who strong { overflow: hidden; font-size: 15px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.who small { color: var(--ink-2); font-size: 13px; }
.amt { grid-area: amt; justify-self: end; font-size: 15px; }
.state { grid-area: state; display: inline-flex; align-items: center; gap: 6px; justify-self: start; padding: 3px 10px 3px 6px; border-radius: 999px; font-size: 12.5px; font-weight: 600; }
.glyph, .tick { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; font-size: 11px; line-height: 1; }
.s-overdue { background: var(--accent-soft); color: var(--accent); }
.s-overdue .glyph { background: var(--accent); color: #fff; }
.s-overdue .glyph::before { content: "!"; font-weight: 800; }
.s-reminded { background: rgb(18 20 23 / 0.06); color: var(--ink); }
.s-reminded .glyph::before { content: "\\21BB"; }
.s-sent { color: var(--ink-2); box-shadow: inset 0 0 0 1px var(--line); }
.s-sent .glyph::before { content: "\\2192"; }
.s-paid { background: var(--paid-soft); color: var(--paid); }
.s-paid .glyph::before, .tick::before { content: "\\2713"; font-weight: 800; }
.act { grid-area: act; justify-self: end; min-height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); color: var(--ink); font: 600 13px var(--font-body); cursor: pointer; transition: border-color 200ms, transform 150ms; }
.act:hover { border-color: var(--ink); }
.act:active { transform: scale(0.97); }
.ledger__foot { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 14px 18px 16px; border-top: 1px solid var(--line); }
.ledger__foot .k { color: var(--ink-2); font-size: 13px; }
.ledger__foot .v { margin-top: 2px; font-size: 22px; }
.ledger__foot .v span { color: var(--ink-2); font: 13px var(--font-body); }
.chart { width: min(284px, 100%); height: auto; }
.chart .bar { fill: var(--ink); transform-box: fill-box; transform-origin: bottom; }
.chart g:last-child .bar { fill: var(--accent-2); }
.chart text { fill: var(--ink-2); font: 11px var(--font-body); }
/* The notices float in front of the screen, at their own depth, so the ledger reads as an object in space. */
.float { position: absolute; display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px 10px 10px; border-radius: 999px; font-size: 14px; white-space: nowrap; box-shadow: 0 24px 44px -20px rgb(18 20 23 / 0.55); }
.float--paid { right: 8px; bottom: 18px; background: var(--ink); color: #fff; transform: translateZ(80px); }
.float--paid .tick { background: var(--paid); color: #fff; }
.float--next { left: -18px; top: -16px; padding: 9px 16px; background: var(--paper-2); color: var(--ink); box-shadow: 0 0 0 1px var(--line), 0 24px 44px -24px rgb(18 20 23 / 0.45); transform: translateZ(50px); }
.float--next .mono { color: var(--accent); font-size: 13px; }
@media (max-width: 559px) {
  .ledger-3d { transform: rotateX(4deg); }
  .float--paid { right: 6px; }
  .float--next { left: 6px; }
}

/* The chase: a dark chapter over a horizon scene; the email follows the slider and the steps. */
.chase { overflow: clip; isolation: isolate; }
.chase__scene { position: absolute; inset: 0; z-index: -1; }
.chase__grid { display: grid; gap: 40px; align-items: start; }
@media (min-width: 960px) { .chase__grid { grid-template-columns: 1.15fr 0.85fr; } }
.chase__stage { position: sticky; top: 84px; z-index: 1; display: grid; gap: 22px; }
.email { display: grid; gap: 14px; padding: clamp(22px, 3vw, 32px); border: 1px solid var(--line); border-radius: var(--radius-lg); background: color-mix(in oklab, var(--paper-2) 86%, transparent); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
.email__meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; color: var(--ink-2); font-size: 14px; }
.email h3 { font: 600 clamp(20px, 2.2vw, 26px)/1.2 var(--font-display); letter-spacing: -0.03em; }
.email p#email-body { color: var(--ink-2); }
.email__pay { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.pay { display: inline-flex; align-items: center; min-height: 44px; padding: 0 20px; border-radius: 999px; background: var(--accent-2); color: #1a0b02; font-weight: 600; }
.email.swap { animation: swap 500ms var(--fs-ease); }
.scrub { display: grid; gap: 8px; }
.scrub label { color: var(--ink-2); font-size: 15px; }
.scrub output { margin-left: 4px; color: var(--ink); font-weight: 600; }
.scrub input { width: 100%; height: 44px; margin: 0; background: transparent; accent-color: var(--accent-2); cursor: pointer; }
.chase__steps { display: grid; gap: clamp(48px, 14vh, 140px); padding-bottom: 12vh; }
.chase-step { display: grid; gap: 6px; padding: 18px 22px; border-left: 2px solid var(--line); border-radius: 0 18px 18px 0; background: color-mix(in oklab, var(--paper) 60%, transparent); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); transition: border-color 300ms; }
.chase-step__day { color: var(--ink-2); font-size: 14px; }
.chase-step.is-on { border-left-color: var(--accent-2); }
.chase-step.is-on .chase-step__day { color: var(--accent-2); }

/* Features: a bento of tiles that each show the thing working. */
.bento { display: grid; gap: 16px; }
@media (min-width: 900px) {
  .bento { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .tile--pay { grid-column: span 3; }
  .tile--photo { grid-column: span 3; grid-row: span 2; }
  .tile--tone { grid-column: span 3; }
  .tile--fee { grid-column: span 3; }
  .tile--log { grid-column: span 3; }
}
.tile { display: grid; align-content: start; gap: 12px; padding: clamp(22px, 3vw, 30px); border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper-2); }
.tile p { color: var(--ink-2); }
.tile--photo { padding: 10px; align-content: stretch; grid-template-rows: 1fr auto; }
/* The photo fills its tile, so it never pushes past its column. */
.tile__frame { aspect-ratio: auto; height: 100%; min-height: 300px; border-radius: calc(var(--radius) - 6px); }
.tile__frame img { width: 100%; height: 100%; object-fit: cover; }
.tile__caption { padding: 8px 12px 6px; }
.paysheet { display: grid; gap: 8px; margin-top: 6px; padding: 14px; border-radius: 14px; background: var(--paper); }
.ps-row { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.ps-row .mono { margin-left: auto; }
.ps-row.muted { color: var(--ink-2); }
.ps-check { width: 14px; height: 14px; flex: none; color: var(--paid); }
.ps-gap { width: 14px; flex: none; }
.ps-btn { justify-self: start; margin-top: 4px; padding: 10px 18px; border-radius: 999px; background: var(--ink); color: #fff; font-size: 14px; font-weight: 600; }
.tile .big { font: 600 clamp(48px, 6vw, 80px)/1 var(--font-display); letter-spacing: -0.05em; color: var(--ink); }
.big__note { font: 400 16px var(--font-body); letter-spacing: 0; color: var(--ink-2); }
.log { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.log li { display: flex; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--paper); font-size: 14px; }
.log .mono { color: var(--ink-2); }
.seg { display: inline-flex; gap: 4px; padding: 4px; width: fit-content; border: 1px solid var(--line); border-radius: 999px; background: var(--paper-2); }
.seg button { min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: none; color: var(--ink-2); font: 500 15px/1 var(--font-body); cursor: pointer; transition: background-color 200ms, color 200ms; }
.seg button[aria-pressed="true"] { background: var(--ink); color: #fff; }
.tile .tone-line { color: var(--ink); font: 500 18px/1.45 var(--font-body); }

.quote__frame { --fs-ratio: 6 / 5; border-radius: var(--radius-lg); }
.quote__frame img { width: 100%; height: 100%; object-fit: cover; }

/* Pricing. */
.pricing__head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 40px; }
.plans { display: grid; gap: 16px; }
@media (min-width: 760px) { .plans { grid-template-columns: 1fr 1fr; } }
.plan { position: relative; display: grid; align-content: start; gap: 14px; padding: clamp(24px, 3.5vw, 40px); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--paper-2); }
.plan__for { color: var(--ink-2); }
.plan--featured { background: var(--ink); color: #fff; border-color: transparent; box-shadow: 0 40px 80px -40px rgb(194 65 12 / 0.55); }
.plan--featured .plan__for, .plan--featured .per { color: #c9cdd4; }
.plan--featured .fs-list li::before { background: var(--accent-2); }
.plan__badge { position: absolute; top: 20px; right: 20px; padding: 6px 12px; border-radius: 999px; background: var(--accent-2); color: #1a0b02; font-size: 13px; font-weight: 600; }
.price { display: flex; align-items: baseline; gap: 10px; }
.amount { font: 600 clamp(44px, 5vw, 64px)/1 var(--font-display); letter-spacing: -0.05em; }
.amount.roll { animation: roll 450ms var(--fs-ease); }
.per { color: var(--ink-2); }
.plan .fs-btn { justify-self: start; }
.billing-note { margin-top: 22px; color: var(--ink-2); text-align: center; }

/* Sign-up. */
.signup .fs-lead { max-width: 52ch; }
.signup__form { display: grid; gap: 14px; align-items: end; max-width: 620px; }
@media (min-width: 640px) { .signup__form { grid-template-columns: 1fr auto; } }
.field { display: grid; gap: 8px; font-size: 14px; color: var(--ink-2); }
.field input { min-height: 52px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in oklab, var(--paper) 92%, transparent); color: var(--ink); font: 400 16px/1 var(--font-body); }
.field input[aria-invalid="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }

@media (prefers-reduced-motion: no-preference) {
  .chart .bar { animation: grow 900ms var(--fs-ease) both; animation-delay: calc(500ms + var(--b) * 80ms); }
  .s-overdue .glyph { animation: ping 2.4s var(--fs-ease) infinite; }
  .float--paid.pop { animation: pop 600ms var(--fs-ease); }
  .inv.flash { animation: flash 900ms var(--fs-ease); }
  .ledger-3d { animation: drift 9s ease-in-out infinite alternate; }
  [data-off] .ledger-3d, [data-off] .s-overdue .glyph { animation-play-state: paused; }
  @keyframes grow { from { transform: scaleY(0); } }
  @keyframes ping { 0% { box-shadow: 0 0 0 0 rgb(194 65 12 / 0.5); } 70%, 100% { box-shadow: 0 0 0 8px rgb(194 65 12 / 0); } }
  @keyframes pop { 40% { scale: 1.06; } }
  @keyframes flash { from { background: var(--accent-soft); } }
  @keyframes drift { from { transform: rotateY(-11deg) rotateX(6deg); } to { transform: rotateY(-7deg) rotateX(4deg) translateY(-6px); } }
  @keyframes swap { from { opacity: 0.4; transform: translateY(8px); } }
  @keyframes roll { from { opacity: 0; transform: translateY(10px); } }
}
@media (prefers-reduced-motion: no-preference) and (max-width: 559px) {
  @keyframes drift { from { transform: rotateX(4deg); } to { transform: rotateX(2deg) translateY(-4px); } }
}
/* Under reduced motion the ledger stays tilted but still, and nothing slides. */
@media (prefers-reduced-motion: reduce) {
  .act, .seg button, .chase-step { transition: none; }
}
`;

const SCRIPT = `// Ledgerly: the working ledger, the chase timeline, the tone and billing switches and the sign-up.
// The page is complete without this file; the Studio kit does the reveals, the tilt and the counters.
(function () {
  var money = function (n) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var canObserve = "IntersectionObserver" in window;

  // The ledger works: send a reminder, then mark it paid. The total and the notice follow.
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
      var state = row.querySelector(".state");
      state.className = "state s-" + next;
      state.querySelector(".state-label").textContent = LABELS[next];
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

  // The ledger rests while it's off screen.
  var stage = document.querySelector(".hero__stage");
  if (stage && canObserve) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) stage.removeAttribute("data-off"); else stage.setAttribute("data-off", "");
    }).observe(stage);
  }

  // The chase: the slider and the steps as they pass the middle of the screen both pick the email.
  var EMAILS = ${JSON.stringify(CHASE.map(({ day, subject, body, pay }) => ({ day, subject, body, pay })))};
  var range = document.getElementById("days");
  var out = document.getElementById("days-out");
  var steps = Array.prototype.slice.call(document.querySelectorAll(".chase-step"));
  var email = document.querySelector(".email");
  var subject = document.getElementById("email-subject");
  var body = document.getElementById("email-body");
  var when = document.getElementById("email-when");
  var pay = document.getElementById("email-pay");
  var shown = 7;
  function showDay(days, fromSlider) {
    if (!email) return;
    var current = EMAILS[0];
    EMAILS.forEach(function (m) { if (days >= m.day) current = m; });
    if (!fromSlider && range) { range.value = String(current.day); }
    if (out) out.textContent = String(fromSlider ? days : current.day);
    steps.forEach(function (s) { s.classList.toggle("is-on", Number(s.dataset.day) === current.day); });
    if (current.day === shown) return;
    shown = current.day;
    subject.textContent = current.subject;
    body.textContent = current.body;
    when.textContent = "Day " + current.day;
    pay.textContent = "Pay " + current.pay;
    email.classList.remove("swap");
    void email.offsetWidth;
    email.classList.add("swap");
  }
  if (range) range.addEventListener("input", function () { showDay(Number(range.value), true); });
  if (canObserve) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) showDay(Number(e.target.dataset.day), false); });
    }, { rootMargin: "-55% 0px -30% 0px" });
    steps.forEach(function (s) { io.observe(s); });
  }

  // Tone: friendly or firm.
  var TONES = {
    friendly: "\\u201CJust a nudge on invoice #1042. No rush if it's already on its way.\\u201D",
    firm: "\\u201CInvoice #1042 is 7 days overdue. Please pay by Friday, or reply to arrange a date.\\u201D"
  };
  var toneLine = document.getElementById("tone-line");
  document.querySelectorAll("[data-tone]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-tone]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      if (toneLine) toneLine.textContent = TONES[b.dataset.tone];
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
      if (note) note.textContent = period === "yearly" ? "Billed yearly, a month's price shown. Cancel any time." : "Billed monthly. Cancel any time.";
    });
  });

  // The trial sign-up is a sample: it checks the address, then says plainly that no account was made.
  var form = document.getElementById("signup");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("signup-email");
      var msg = document.getElementById("signup-msg");
      var ok = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(input.value.trim());
      input.setAttribute("aria-invalid", String(!ok));
      msg.textContent = ok ? "Thanks. This is a sample, so no account was created for " + input.value.trim() + "." : "Enter an email address like name@studio.com.";
      if (!ok) input.focus();
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
`;

const DESIGN = `# Ledgerly: design

Design read: a site for a software product, invoicing for freelancers and small studios, for people who bill clients and hate chasing them. Confident and precise, with the product itself as the hero. Built on the Farbaek Studio kit.

## Look

The kit's signal look, tuned warm: a cool off-white paper, white cards, an ink-black featured plan, 18px and 30px corners.

## Palette

- \`--paper\` #f6f7f9 and \`--paper-2\` #ffffff.
- \`--ink\` #121417 and \`--ink-2\` #545a64.
- \`--accent\` #c2410c, burnt orange, for actions and anything overdue (AA with white text).
- \`--accent-2\` #f97316, a brighter orange for fills on dark: the pay button, the active step, the badge. Never for small text on light.
- \`--paid\` #15803d, only for the Paid status, always with a tick and a label.

## Type

Sora at 600 for headlines and big numbers, set tight. DM Sans for everything else. JetBrains Mono with tabular figures for amounts, dates and invoice numbers, so they line up like a ledger.

## Layout

A split hero: the promise on the left, the working ledger on the right. A dark chapter where the email follows the slider and the steps. A bento of five tiles, one of them a photo. A quote beside a photo. Two plans with a period switch. Questions, the sign-up band, and a footer with the wordmark.

## Signature

The live ledger in 3D: the invoice screen tilted in space, with the Paid notice and the next reminder floating in front of it at their own depth. It leans toward the pointer and drifts slowly. Reminders really send, invoices really get paid, and the total follows.

## Motion

The claim rises word by word, the chart bars grow, the overdue mark pings, the ledger drifts and leans. Scrolling the chase swaps the email, switching billing rolls the prices. The horizon scene moves behind the dark chapter. All of it stops under reduced motion, and the page is complete without JavaScript.

## Media

Three real photos marked as placeholders: the team tile, the quote's face and the desk beside it. Replace them with your own in Studio. The horizon scene takes its colours from the brand.

## Avoid

Invented customer logos, user counts or ratings. A sign-up that pretends to create an account. Orange for small text on light paper.
`;

const README = `# Ledgerly software site (template)

A static site on the Farbaek Studio kit: \`index.html\`, \`styles.css\` and \`script.js\`. There's no build step and nothing to install.

## Make it yours

1. Change the product, the claim, the ledger's rows, the follow-ups and the plans in \`index.html\` (the follow-up emails are in \`script.js\` too).
2. Tune the colours and fonts at the top of \`styles.css\`, and update \`DESIGN.md\`.
3. Replace each photo marked as a placeholder with your own (Studio's Replace does it in a click).

Keep the idea that the hero is a small, working piece of your real product. The product, clients, amounts, emails, quote and prices are samples. The sign-up doesn't create an account until it's connected.
`;

export const SAAS_SITE_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "README.md", content: README },
];

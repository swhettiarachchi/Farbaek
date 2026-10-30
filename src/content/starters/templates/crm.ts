/**
 * Template: a CRM for a small studio (ADR 0140), built to the Studio
 * standard (ADR 0030). A pipeline board where deals move between stages by
 * button, keyboard or drag; a flow bar of the pipeline's value by stage; a
 * contacts table with search, a stage filter and sorting; a new-deal dialog;
 * and an activity log. Everything is sample data, saved only in this browser,
 * and the page says so. Previews instantly; the board, tiles and table are
 * complete without JavaScript.
 */
import type { StarterFile } from "../types";

type Deal = { id: string; company: string; contact: string; value: number; stage: "lead" | "qualified" | "proposal" | "won"; next: string };

/** The sample deals, written into the page and used by the script. */
const DEALS: Deal[] = [
  { id: "d1", company: "Harbour Lane Studio", contact: "Ama Mensah", value: 4800, stage: "lead", next: "2026-11-03" },
  { id: "d2", company: "Lotus Bakes", contact: "Ravi Perera", value: 2200, stage: "lead", next: "2026-11-06" },
  { id: "d3", company: "Northfield Clinic", contact: "Lena Ortiz", value: 9600, stage: "qualified", next: "2026-10-29" },
  { id: "d4", company: "Pine and Paper", contact: "Tomas Varga", value: 3400, stage: "qualified", next: "2026-11-10" },
  { id: "d5", company: "Saltmarsh Cycles", contact: "Mei Tanaka", value: 12500, stage: "proposal", next: "2026-10-31" },
  { id: "d6", company: "Kiln Coffee", contact: "Jonah Reyes", value: 1800, stage: "proposal", next: "2026-11-12" },
  { id: "d7", company: "Brightwater Dental", contact: "Priya Nair", value: 7200, stage: "won", next: "2026-11-20" },
  { id: "d8", company: "Orchard Row Hotel", contact: "Sam Okafor", value: 15400, stage: "won", next: "2026-12-01" },
];
const STAGES: { id: Deal["stage"]; name: string }[] = [
  { id: "lead", name: "New lead" },
  { id: "qualified", name: "Qualified" },
  { id: "proposal", name: "Proposal sent" },
  { id: "won", name: "Won" },
];
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const date = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const total = (stage: Deal["stage"]) => DEALS.filter((d) => d.stage === stage).reduce((n, d) => n + d.value, 0);
const card = (d: Deal) =>
  `            <li class="deal" draggable="true" data-id="${d.id}"><p class="deal-co">${d.company}</p><p class="deal-who">${d.contact}</p><p class="deal-row"><span class="deal-value">${money(d.value)}</span><span class="deal-next">Next ${date(d.next)}</span></p></li>`;
const column = (s: (typeof STAGES)[number]) => `        <section class="col" data-stage="${s.id}" aria-labelledby="col-${s.id}">
          <header class="col-head"><h3 id="col-${s.id}"><span class="dot dot-${s.id}" aria-hidden="true"></span>${s.name}</h3><p class="col-total">${DEALS.filter((d) => d.stage === s.id).length} deals, ${money(total(s.id))}</p></header>
          <ol class="deals">
${DEALS.filter((d) => d.stage === s.id).map(card).join("\n")}
          </ol>
        </section>`;
const row = (d: Deal) =>
  `            <tr><td><strong>${d.company}</strong></td><td>${d.contact}</td><td><span class="stage-tag tag-${d.stage}">${STAGES.find((s) => s.id === d.stage)!.name}</span></td><td class="num">${money(d.value)}</td><td>${date(d.next)}</td></tr>`;
const open = DEALS.filter((d) => d.stage !== "won").reduce((n, d) => n + d.value, 0);
const pipelineTotal = DEALS.reduce((n, d) => n + d.value, 0);
const flow = STAGES.map((s) => `          <span class="seg seg-${s.id}" style="flex-grow: ${total(s.id)}" title="${s.name}: ${money(total(s.id))}"><span class="seg-label">${s.name} ${money(total(s.id))}</span></span>`).join("\n");

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fieldnote, studio CRM (sample)</title>
    <meta name="description" content="A sample CRM for a small studio: a pipeline board, contacts and follow-ups in one place." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <a class="skip" href="#main">Skip to the pipeline</a>
    <div class="shell">
      <aside class="side" aria-label="Sections">
        <a class="brand" href="#main" aria-label="Fieldnote, pipeline"><span class="mark" aria-hidden="true"></span>Fieldnote</a>
        <nav>
          <a href="#main" aria-current="page">Pipeline</a>
          <a href="#contacts">Contacts</a>
          <a href="#activity">Activity</a>
        </nav>
        <p class="side-note">Sample CRM: every company and person is made up, and changes stay in this browser.</p>
      </aside>

      <main id="main" class="main">
        <header class="head">
          <div>
            <p class="eyebrow-sample">Sample data</p>
            <h1>Pipeline</h1>
            <p class="sub">Eight deals, four stages, and what to do next on each.</p>
          </div>
          <div class="head-actions">
            <button type="button" class="btn ghost" id="reset">Reset sample data</button>
            <button type="button" class="btn primary" id="new-deal">New deal</button>
          </div>
        </header>

        <section class="tiles" aria-label="Key numbers">
          <article class="tile"><h2>Open pipeline</h2><p class="value" id="t-open">${money(open)}</p><p class="hint">Deals not yet won</p></article>
          <article class="tile"><h2>Weighted forecast</h2><p class="value" id="t-forecast">${money(Math.round(total("lead") * 0.1 + total("qualified") * 0.3 + total("proposal") * 0.6))}</p><p class="hint">10, 30 and 60% by stage</p></article>
          <article class="tile"><h2>Won</h2><p class="value" id="t-won">${money(total("won"))}</p><p class="hint">${DEALS.filter((d) => d.stage === "won").length} deals</p></article>
          <article class="tile"><h2>Follow-ups due</h2><p class="value" id="t-due">2</p><p class="hint">On or before Oct 31</p></article>
        </section>

        <section class="flow-card" aria-labelledby="flow-title">
          <div class="card-head">
            <h2 id="flow-title">Where the value sits</h2>
            <p class="muted" id="flow-total">${money(pipelineTotal)} across every stage</p>
          </div>
          <div class="flow" id="flow" role="img" aria-label="The pipeline's value by stage">
${flow}
          </div>
        </section>

        <section aria-labelledby="board-title">
          <div class="card-head">
            <h2 id="board-title">Board</h2>
            <p class="muted">Drag a deal, or use its arrows, to move it to another stage.</p>
          </div>
          <div class="board" id="board">
${STAGES.map(column).join("\n")}
          </div>
        </section>

        <section id="contacts" class="table-card" aria-labelledby="contacts-title">
          <div class="card-head">
            <h2 id="contacts-title">Contacts</h2>
            <div class="filters">
              <label class="field"><span>Search</span><input type="search" id="q" placeholder="Company or person" /></label>
              <label class="field"><span>Stage</span>
                <select id="stage-filter">
                  <option value="all">Every stage</option>
${STAGES.map((s) => `                  <option value="${s.id}">${s.name}</option>`).join("\n")}
                </select>
              </label>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col"><button type="button" class="sort" data-sort="company">Company</button></th>
                  <th scope="col">Contact</th>
                  <th scope="col">Stage</th>
                  <th scope="col" class="num"><button type="button" class="sort" data-sort="value">Value</button></th>
                  <th scope="col"><button type="button" class="sort" data-sort="next">Next step</button></th>
                </tr>
              </thead>
              <tbody id="rows">
${DEALS.map(row).join("\n")}
              </tbody>
            </table>
          </div>
          <p class="muted empty" id="empty" hidden>No contact matches. Clear the search to see everyone.</p>
        </section>

        <section id="activity" class="activity-card" aria-labelledby="activity-title">
          <h2 id="activity-title">Activity</h2>
          <ol class="log" id="log">
            <li><span class="when">Today</span>Sample data loaded: eight deals across four stages.</li>
          </ol>
        </section>
        <p class="sr-only" aria-live="polite" id="announce"></p>
      </main>
    </div>

    <dialog id="deal-dialog" aria-labelledby="dialog-title">
      <form method="dialog" id="deal-form" class="dialog-form">
        <h2 id="dialog-title">New deal</h2>
        <p class="muted">Sample only: it's saved in this browser.</p>
        <label class="field"><span>Company</span><input name="company" required maxlength="80" /></label>
        <label class="field"><span>Contact</span><input name="contact" required maxlength="80" /></label>
        <label class="field"><span>Value in dollars</span><input name="value" type="number" min="0" step="100" required /></label>
        <label class="field"><span>Next step on</span><input name="next" type="date" required /></label>
        <p class="form-error" id="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          <button type="button" class="btn ghost" id="cancel-deal">Cancel</button>
          <button type="submit" class="btn primary" value="save">Add to New lead</button>
        </div>
      </form>
    </dialog>
    <script src="script.js"></script>
  </body>
</html>
`;

const STYLES = `/* Fieldnote, a sample CRM. Palette and type are in DESIGN.md. */
:root {
  --bg: #f3f6f2;
  --surface: #ffffff;
  --ink: #142019;
  --muted: #56655c;
  --line: #dbe4dd;
  --pine: #0f6e56;
  --pine-soft: #e2f1eb;
  --amber: #9a5205;
  --amber-soft: #fbefe1;
  --lead: #7a8794;
  --qualified: #3b6ea8;
  --proposal: #b06a12;
  --won: #0f6e56;
  --radius: 14px;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
}
* { box-sizing: border-box; }
html { color-scheme: light; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
h1, h2, h3 { margin: 0; letter-spacing: -0.02em; }
p { margin: 0; }
.skip { position: absolute; left: -999px; top: 8px; background: var(--ink); color: #fff; padding: 10px 14px; border-radius: 10px; z-index: 10; }
.skip:focus { left: 12px; }
:focus-visible { outline: 3px solid var(--pine); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.muted { color: var(--muted); }

.shell { display: grid; grid-template-columns: 236px 1fr; min-height: 100vh; }
.side { padding: 28px 20px; border-right: 1px solid var(--line); background: var(--surface); position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 28px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 650; font-size: 18px; color: var(--ink); text-decoration: none; min-height: 44px; }
.mark { width: 26px; height: 26px; border-radius: 8px; background: conic-gradient(from 210deg, var(--pine), #3aa384, var(--pine)); }
.side nav { display: grid; gap: 4px; }
.side nav a { display: flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 10px; color: var(--muted); text-decoration: none; font-weight: 550; }
.side nav a[aria-current="page"], .side nav a:hover { background: var(--pine-soft); color: var(--pine); }
.side-note { margin-top: auto; font-size: 13px; color: var(--muted); }

.main { padding: 32px clamp(16px, 3vw, 40px) 64px; display: grid; gap: 28px; min-width: 0; }
/* Grid items grow to their content by default; the board and table scroll inside their own boxes instead. */
.main > * { min-width: 0; }
.head { display: flex; justify-content: space-between; align-items: end; gap: 16px; flex-wrap: wrap; }
.eyebrow-sample { display: inline-block; font-size: 12px; font-weight: 650; color: var(--amber); background: var(--amber-soft); border-radius: 999px; padding: 2px 10px; margin-bottom: 8px; }
h1 { font-size: clamp(28px, 4vw, 40px); font-weight: 650; }
.sub { color: var(--muted); margin-top: 4px; }
.head-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn { min-height: 44px; padding: 0 18px; border-radius: 999px; font: inherit; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: transform 160ms var(--ease), background 160ms; }
.btn:active { transform: scale(0.98); }
.btn.primary { background: var(--pine); color: #fff; }
.btn.primary:hover { background: #0b5b47; }
.btn.ghost { background: transparent; border-color: var(--line); color: var(--ink); }
.btn.ghost:hover { background: var(--surface); }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; }
.tile h2 { font-size: 13px; font-weight: 600; color: var(--muted); letter-spacing: 0; }
.value { font-size: 28px; font-weight: 650; letter-spacing: -0.02em; margin-top: 6px; font-variant-numeric: tabular-nums; }
.hint { font-size: 13px; color: var(--muted); margin-top: 2px; }

.flow-card, .table-card, .activity-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; }
.card-head { display: flex; justify-content: space-between; align-items: end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.card-head h2 { font-size: 18px; font-weight: 650; }
.flow { display: flex; gap: 4px; height: 52px; }
.seg { position: relative; min-width: 6px; border-radius: 10px; display: flex; align-items: end; padding: 6px 8px; overflow: hidden; transition: flex-grow 600ms var(--ease); }
.seg-label { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; }
.seg-lead { background: var(--lead); }
.seg-qualified { background: var(--qualified); }
.seg-proposal { background: var(--proposal); }
.seg-won { background: repeating-linear-gradient(135deg, var(--won) 0 10px, #138567 10px 20px); }

.board { display: grid; grid-template-columns: repeat(4, minmax(220px, 1fr)); gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; }
.col { background: #eaf0eb; border-radius: var(--radius); padding: 12px; scroll-snap-align: start; min-height: 180px; transition: background 160ms; }
.col.over { background: var(--pine-soft); outline: 2px dashed var(--pine); outline-offset: -2px; }
.col-head { display: grid; gap: 2px; margin-bottom: 10px; }
.col-head h3 { font-size: 15px; display: flex; align-items: center; gap: 8px; }
.col-total { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot-lead { background: var(--lead); }
.dot-qualified { background: var(--qualified); }
.dot-proposal { background: var(--proposal); }
.dot-won { background: var(--won); }
.deals { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.deal { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: grid; gap: 2px; cursor: grab; box-shadow: 0 1px 0 rgba(20, 32, 25, 0.04); }
.deal.dragging { opacity: 0.5; }
.deal-co { font-weight: 650; }
.deal-who { font-size: 14px; color: var(--muted); }
.deal-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: 14px; }
.deal-value { font-weight: 650; font-variant-numeric: tabular-nums; }
.deal-next { color: var(--muted); }
.deal-next.due { color: var(--amber); font-weight: 600; }
.deal-moves { display: flex; gap: 6px; margin-top: 8px; }
.move { min-width: 44px; min-height: 44px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); font: inherit; cursor: pointer; }
.move:hover { background: var(--pine-soft); }
.move:disabled { opacity: 0.35; cursor: not-allowed; }

.filters { display: flex; gap: 10px; flex-wrap: wrap; }
.field { display: grid; gap: 4px; font-size: 13px; font-weight: 600; color: var(--muted); }
.field input, .field select { min-height: 44px; border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; font: inherit; font-size: 16px; color: var(--ink); background: var(--surface); }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 15px; }
th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { font-size: 13px; color: var(--muted); font-weight: 600; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.sort { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; min-height: 44px; }
.sort[aria-sort]::after { content: " \\2193"; }
.stage-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: var(--bg); }
.stage-tag::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.tag-lead { color: #4f5b67; }
.tag-qualified { color: var(--qualified); }
.tag-proposal { color: var(--amber); }
.tag-won { color: var(--won); }
.empty { padding-top: 12px; }

.log { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
.log li { display: flex; gap: 12px; font-size: 15px; }
.when { color: var(--muted); font-size: 13px; min-width: 64px; padding-top: 2px; }

dialog { border: 0; border-radius: 20px; padding: 0; width: min(440px, calc(100vw - 32px)); box-shadow: 0 30px 60px rgba(20, 32, 25, 0.25); }
dialog::backdrop { background: rgba(20, 32, 25, 0.4); }
.dialog-form { padding: 24px; display: grid; gap: 14px; }
.dialog-actions { display: flex; justify-content: end; gap: 10px; }
.form-error { color: #a12b1b; font-size: 14px; }

@media (prefers-reduced-motion: no-preference) {
  .js .deal { animation: rise 420ms var(--ease) both; }
  .js .tile { animation: rise 420ms var(--ease) both; }
  .deal.moved { animation: settle 520ms var(--ease); }
}
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes settle { 0% { transform: scale(0.96); box-shadow: 0 0 0 3px var(--pine-soft); } 100% { transform: none; } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

@media (max-width: 860px) {
  .shell { grid-template-columns: 1fr; }
  .side { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; border-right: 0; border-bottom: 1px solid var(--line); }
  .side nav { display: flex; gap: 4px; }
  .side-note { margin-top: 0; width: 100%; }
  .board { grid-template-columns: repeat(4, minmax(78vw, 1fr)); }
}
`;

const SCRIPT = `// Fieldnote, a sample CRM. Every deal is sample data, saved only in this browser.
(() => {
  document.documentElement.classList.add("js");
  const KEY = "fieldnote-crm-sample";
  const STAGES = ${JSON.stringify(STAGES)};
  const WEIGHT = { lead: 0.1, qualified: 0.3, proposal: 0.6, won: 0 };
  const SAMPLE = ${JSON.stringify(DEALS)};
  const TODAY = "2026-10-31";
  const $ = (s) => document.querySelector(s);
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const day = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  let state = load();
  let sort = { key: "company", dir: 1 };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && Array.isArray(saved.deals)) return saved;
    } catch (e) {}
    return { deals: SAMPLE.map((d) => ({ ...d })), log: [{ when: "Today", text: "Sample data loaded: eight deals across four stages." }] };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function say(text) {
    $("#announce").textContent = text;
    state.log.unshift({ when: "Just now", text });
    state.log = state.log.slice(0, 8);
  }
  const stageName = (id) => STAGES.find((s) => s.id === id).name;
  const sum = (list) => list.reduce((n, d) => n + d.value, 0);

  function renderTiles() {
    const open = state.deals.filter((d) => d.stage !== "won");
    $("#t-open").textContent = money(sum(open));
    $("#t-forecast").textContent = money(open.reduce((n, d) => n + d.value * WEIGHT[d.stage], 0));
    const won = state.deals.filter((d) => d.stage === "won");
    $("#t-won").textContent = money(sum(won));
    $("#t-won").nextElementSibling.textContent = won.length + (won.length === 1 ? " deal" : " deals");
    $("#t-due").textContent = String(open.filter((d) => d.next <= TODAY).length);
  }

  function renderFlow() {
    const all = sum(state.deals);
    $("#flow-total").textContent = money(all) + " across every stage";
    for (const s of STAGES) {
      const v = sum(state.deals.filter((d) => d.stage === s.id));
      const seg = document.querySelector(".seg-" + s.id);
      seg.style.flexGrow = String(v);
      seg.title = s.name + ": " + money(v);
      seg.querySelector(".seg-label").textContent = s.name + " " + money(v);
    }
  }

  function renderBoard(movedId) {
    for (const s of STAGES) {
      const col = document.querySelector('.col[data-stage="' + s.id + '"]');
      const list = state.deals.filter((d) => d.stage === s.id);
      col.querySelector(".col-total").textContent = list.length + (list.length === 1 ? " deal, " : " deals, ") + money(sum(list));
      const i = STAGES.findIndex((x) => x.id === s.id);
      col.querySelector(".deals").innerHTML = list
        .map((d) => {
          const due = d.stage !== "won" && d.next <= TODAY;
          const back = i > 0 ? STAGES[i - 1].name : "";
          const fwd = i < STAGES.length - 1 ? STAGES[i + 1].name : "";
          return '<li class="deal' + (d.id === movedId ? " moved" : "") + '" draggable="true" data-id="' + d.id + '">' +
            '<p class="deal-co">' + esc(d.company) + "</p>" +
            '<p class="deal-who">' + esc(d.contact) + "</p>" +
            '<p class="deal-row"><span class="deal-value">' + money(d.value) + '</span><span class="deal-next' + (due ? " due" : "") + '">' + (due ? "Follow up due " : "Next ") + day(d.next) + "</span></p>" +
            '<div class="deal-moves">' +
            '<button type="button" class="move" data-move="-1" ' + (back ? 'aria-label="Move ' + esc(d.company) + " back to " + back + '"' : 'aria-label="' + esc(d.company) + ' is in the first stage" disabled') + ">&#8592;</button>" +
            '<button type="button" class="move" data-move="1" ' + (fwd ? 'aria-label="Move ' + esc(d.company) + " forward to " + fwd + '"' : 'aria-label="' + esc(d.company) + ' is won" disabled') + ">&#8594;</button>" +
            "</div></li>";
        })
        .join("");
    }
  }

  function renderTable() {
    const q = $("#q").value.trim().toLowerCase();
    const stage = $("#stage-filter").value;
    const rows = state.deals
      .filter((d) => (stage === "all" || d.stage === stage) && (!q || (d.company + " " + d.contact).toLowerCase().includes(q)))
      .sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : a[sort.key] < b[sort.key] ? -1 : 0) * sort.dir);
    $("#rows").innerHTML = rows
      .map((d) => "<tr><td><strong>" + esc(d.company) + "</strong></td><td>" + esc(d.contact) + '</td><td><span class="stage-tag tag-' + d.stage + '">' + stageName(d.stage) + '</span></td><td class="num">' + money(d.value) + "</td><td>" + day(d.next) + "</td></tr>")
      .join("");
    $("#empty").hidden = rows.length > 0;
    for (const b of document.querySelectorAll(".sort")) {
      if (b.dataset.sort === sort.key) b.setAttribute("aria-sort", sort.dir > 0 ? "ascending" : "descending");
      else b.removeAttribute("aria-sort");
    }
  }

  function renderLog() {
    $("#log").innerHTML = state.log.map((l) => '<li><span class="when">' + esc(l.when) + "</span>" + esc(l.text) + "</li>").join("");
  }

  function render(movedId) {
    renderTiles();
    renderFlow();
    renderBoard(movedId);
    renderTable();
    renderLog();
  }

  function move(id, to) {
    const deal = state.deals.find((d) => d.id === id);
    if (!deal || deal.stage === to) return;
    deal.stage = to;
    say(deal.company + " moved to " + stageName(to) + ".");
    save();
    render(id);
  }

  $("#board").addEventListener("click", (e) => {
    const button = e.target.closest(".move");
    if (!button || button.disabled) return;
    const id = button.closest(".deal").dataset.id;
    const deal = state.deals.find((d) => d.id === id);
    const i = STAGES.findIndex((s) => s.id === deal.stage) + Number(button.dataset.move);
    if (STAGES[i]) move(id, STAGES[i].id);
  });
  $("#board").addEventListener("dragstart", (e) => {
    const card = e.target.closest(".deal");
    if (!card) return;
    card.classList.add("dragging");
    e.dataTransfer.setData("text/plain", card.dataset.id);
  });
  $("#board").addEventListener("dragend", (e) => e.target.closest(".deal")?.classList.remove("dragging"));
  for (const col of document.querySelectorAll(".col")) {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("over"));
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("over");
      move(e.dataTransfer.getData("text/plain"), col.dataset.stage);
    });
  }

  $("#q").addEventListener("input", renderTable);
  $("#stage-filter").addEventListener("change", renderTable);
  for (const b of document.querySelectorAll(".sort")) {
    b.addEventListener("click", () => {
      sort = { key: b.dataset.sort, dir: sort.key === b.dataset.sort ? -sort.dir : 1 };
      renderTable();
    });
  }

  const dialog = $("#deal-dialog");
  $("#new-deal").addEventListener("click", () => {
    $("#deal-form").reset();
    $("#form-error").hidden = true;
    dialog.showModal();
  });
  $("#cancel-deal").addEventListener("click", () => dialog.close());
  $("#deal-form").addEventListener("submit", (e) => {
    const data = new FormData(e.target);
    const company = String(data.get("company") || "").trim();
    const contact = String(data.get("contact") || "").trim();
    const value = Number(data.get("value"));
    const next = String(data.get("next") || "");
    if (!company || !contact || !(value >= 0) || !next) {
      e.preventDefault();
      $("#form-error").textContent = "Fill in the company, the contact, a value and a date.";
      $("#form-error").hidden = false;
      return;
    }
    const id = "d" + Date.now().toString(36);
    state.deals.push({ id, company, contact, value, stage: "lead", next });
    say(company + " added to New lead.");
    save();
    render(id);
  });

  $("#reset").addEventListener("click", () => {
    try { localStorage.removeItem(KEY); } catch (e) {}
    state = load();
    say("Sample data reset.");
    render();
  });

  render();
})();
`;

const DESIGN = `# DESIGN.md

Fieldnote is a sample CRM for a small studio: where every deal stands, and what to do next.

## Palette

Sage-white ground (#f3f6f2), white cards, pine ink (#142019) and pine as the one action colour (#0f6e56). Each stage has its own colour, always with its name beside it: slate for new leads, blue for qualified, amber for proposals and pine for won. Amber also marks a follow-up that's due, with the words "Follow up due".

## Type

The system sans at 16px, headings at weight 650 with tight tracking, numbers in tabular figures so values line up.

## Layout

A sidebar with the sections, then one column: key numbers, the flow bar, the board, the contacts table and the activity log. Under 860px the sidebar becomes a top bar and the board scrolls sideways, one stage at a time.

## Signature

The flow bar: the pipeline's value by stage as one horizontal bar. When a deal moves, its stage's segment grows or shrinks to the new total.

## Motion

Deals and tiles rise in once. A moved deal settles into its new column, and the flow bar's segments ease to their new sizes. All motion stops under reduced motion, and the page is complete without it. This is sample data: replace the deals in script.js.
`;

export const CRM_FILES: StarterFile[] = [
  { path: "index.html", content: INDEX },
  { path: "styles.css", content: STYLES },
  { path: "script.js", content: SCRIPT },
  { path: "DESIGN.md", content: DESIGN },
];

// Responsive audit (ADR 0051): opens every route at representative screen
// widths in headless Chrome, as a phone, tablet or desktop, and reports:
//   - sideways scroll (the page is wider than the screen);
//   - cut-off content: visible text or controls running past the screen
//     edge, even where an overflow-x: clip hides the scroll;
//   - small touch targets on touch screens (under 44 by 44 CSS pixels,
//     ignoring links inside running text);
//   - crowded side-scrolling frames: a pinned (sticky) column wider than
//     half its frame, so what scrolls behind it can't be seen (a 10-plan
//     table on a phone did this);
//   - console errors and uncaught exceptions.
// Run it against a production build, usually the demo workspace:
//
//   pnpm build && pnpm start:demo            (or the farbaek-demo preview)
//   pnpm qa:responsive                       every route, every width
//   pnpm qa:responsive --widths=320,375 --routes=/,/pricing
//   pnpm qa:responsive --shots=<folder>      also save a screenshot of each
//   pnpm qa:responsive --text-scale=2        as Android's text size at 200% (ADR 0171)
//
// It writes a JSON report (--out, default the system temp folder) and exits 1
// when a page scrolls sideways, has a crowded scroll frame or logs an error. These are emulated screens;
// they don't stand in for real phones.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const BASE = flag("base") ?? "http://localhost:3000";
const WIDTHS = (flag("widths") ?? "320,360,375,390,414,430,600,768,1024,1280,1440").split(",").map(Number);
const SHOTS = flag("shots");
const OUT = flag("out") ?? join(tmpdir(), `farbaek-responsive-${Date.now()}.json`);
// The browser's default font size, which rem, em and rem-based media queries all follow.
const TEXT_SCALE = Number(flag("text-scale") ?? 1);

/** Routes with fixed paths. Dynamic ones are found from their list pages (DISCOVER). */
const STATIC_ROUTES = [
  "/", "/pricing", "/security", "/sign-in", "/verify", "/this-page-does-not-exist",
  "/terms", "/privacy", "/acceptable-use", "/delete-account", "/proofpack/v1", "/account-deleted", "/auth/connect", "/auth/connect/done",
  "/app", "/app/agents", "/app/approvals", "/app/billing", "/app/build", "/app/help", "/app/help/new", "/app/mesh",
  "/app/more", "/app/new", "/app/projects", "/app/rescue", "/app/sandbox", "/app/sandbox/new", "/app/settings",
  "/app/tasks", "/app/templates", "/app/workspaces/new",
  "/app/activity", "/app/incidents", "/app/integrations", "/app/policies", "/app/trust", "/app/workflows", "/app/workflows/new",
];
const DISCOVER = [
  { from: "/app/projects", pattern: /^\/app\/projects\/[^/]+$/, then: ["", "/files", "/launch", "/security", "/github", "/graph", "/design"] },
  { from: "/app/tasks", pattern: /^\/app\/tasks\/[^/]+$/, then: [""] },
  { from: "/app/incidents", pattern: /^\/app\/incidents\/\d+$/, then: [""] },
  { from: "/app/workflows", pattern: /^\/app\/workflows\/(?!new$)[^/]+$/, then: [""] },
  { from: "/app/build", pattern: /^\/app\/build\/[^/]+$/, then: [""] },
  { from: "/app/templates", pattern: /^\/app\/templates\/[^/]+$/, then: [""] },
  { from: "/app/help", pattern: /^\/app\/help\/(?!new$)[^/]+$/, then: [""] },
  { from: "/app/sandbox", pattern: /^\/app\/sandbox\/(?!new$)[^/]+$/, then: [""] },
  { from: "/app", pattern: /^\/app\/new\/[^/]+$/, then: [""] },
];
const routeFilter = flag("routes")?.split(",");

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error("Chrome wasn't found. Set CHROME_PATH.");
  return found;
}

/** Phones below 768, tablets below 1024 (both touch), desktops above. */
function deviceFor(width) {
  if (width < 768) return { viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  if (width < 1024) return { viewport: { width, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  return { viewport: { width, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 };
}

/** Runs in the page: what overflows, what's cut off and which touch targets are small. */
function inspect(touch) {
  const vw = document.documentElement.clientWidth;
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    const text = (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 60);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
  };
  const hiddenFromPeople = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.getAttribute("aria-hidden") === "true" || n.hasAttribute("inert")) return true;
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return true;
    }
    return false;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && !hiddenFromPeople(el);
  };
  // Something a person reads or uses: text of its own, a control, an image.
  const meaningful = (el) =>
    el.matches("a,button,input,select,textarea,img,video,svg,[role=button],[role=link]") ||
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const cut = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (!meaningful(el) || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 && r.left >= -1) continue;
    // Inside a scroller of its own (a code block, a table, a tab strip), it can be scrolled to.
    let scrollable = false;
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth) {
        scrollable = true;
        break;
      }
    }
    if (!scrollable) cut.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right) });
  }

  const small = [];
  if (touch) {
    const controls = document.body.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=switch],[role=checkbox]");
    for (const el of controls) {
      if (!visible(el) || el.closest(".sr-only")) continue;
      const r = el.getBoundingClientRect();
      // An absolutely placed ::before or ::after with negative insets widens the tap area without changing the look.
      let { width: w, height: h } = r;
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === "none" || ps.position !== "absolute") continue;
        const out = (v) => Math.max(0, -parseFloat(v) || 0);
        w = Math.max(w, r.width + out(ps.left) + out(ps.right));
        h = Math.max(h, r.height + out(ps.top) + out(ps.bottom));
      }
      // Half a pixel of slack for sub-pixel layout.
      if (w >= 43.5 && h >= 43.5) continue;
      // Links inside running text are exempt (WCAG 2.5.8's inline exception).
      if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /^(P|LI|SPAN|DD|TD|FIGCAPTION|LABEL)$/.test(el.parentElement.tagName)) continue;
      // A control inside or named by a 44px label is covered by it: tapping the label works too.
      const labels = [el.closest("label"), ...(el.labels ?? [])].filter(Boolean);
      if (labels.some((l) => l.getBoundingClientRect().height >= 44)) continue;
      small.push({ el: describe(el), w: Math.round(w), h: Math.round(h) });
    }
  }
  // A side-scrolling frame whose pinned column takes most of it: people see the labels and almost nothing they scroll to.
  const crowded = [];
  for (const el of document.body.querySelectorAll("*")) {
    const ox = getComputedStyle(el).overflowX;
    if (!(ox === "auto" || ox === "scroll") || el.scrollWidth <= el.clientWidth + 1 || !visible(el)) continue;
    let pinned = 0;
    for (const c of el.querySelectorAll("*")) {
      const cs = getComputedStyle(c);
      if (cs.position === "sticky" && cs.left !== "auto" && visible(c)) pinned = Math.max(pinned, c.getBoundingClientRect().width);
    }
    if (pinned > el.clientWidth * 0.5) crowded.push({ el: describe(el), frame: el.clientWidth, pinned: Math.round(pinned) });
  }
  return { scrollWidth: document.documentElement.scrollWidth, viewport: vw, cut: cut.slice(0, 15), cutCount: cut.length, small: small.slice(0, 15), smallCount: small.length, crowded: crowded.slice(0, 5), crowdedCount: crowded.length };
}

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: TEXT_SCALE === 1 ? [] : [`--blink-settings=defaultFontSize=${Math.round(16 * TEXT_SCALE)}`],
});
const report = { base: BASE, ranAt: new Date().toISOString(), widths: WIDTHS, pages: [] };

try {
  // Dynamic routes, from the first link on each list page.
  const routes = [...STATIC_ROUTES];
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    for (const d of DISCOVER) {
      await page.goto(BASE + d.from, { waitUntil: "load" });
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
      const hit = hrefs.find((h) => h && d.pattern.test(h.split(/[?#]/)[0]));
      if (hit) for (const suffix of d.then) routes.push(hit.split(/[?#]/)[0] + suffix);
      else console.log(`No link like ${d.pattern} on ${d.from}; skipped.`);
    }
    await ctx.close();
  }
  const selected = routeFilter ?? routes;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  for (const width of WIDTHS) {
    const device = deviceFor(width);
    const ctx = await browser.newContext({ ...device, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    let errors = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => errors.push(`Uncaught: ${String(e.message).slice(0, 200)}`));
    for (const route of selected) {
      errors = [];
      const res = await page.goto(BASE + route, { waitUntil: "load" }).catch((e) => ({ status: () => `failed: ${e.message}` }));
      await page.waitForTimeout(500);
      const found = await page.evaluate(inspect, device.hasTouch);
      const entry = { route, width, status: res?.status?.() ?? null, overflow: found.scrollWidth - found.viewport, ...found, errors: errors.filter((e) => !/Download the React DevTools/.test(e) && !(route === "/this-page-does-not-exist" && /status of 404/.test(e))) };
      report.pages.push(entry);
      const marks = [entry.overflow > 0 ? `SCROLLS SIDEWAYS by ${entry.overflow}px` : "", entry.cutCount ? `${entry.cutCount} cut off` : "", entry.smallCount ? `${entry.smallCount} small targets` : "", entry.crowdedCount ? `${entry.crowdedCount} crowded scroll frames` : "", entry.errors.length ? `${entry.errors.length} errors` : ""].filter(Boolean);
      console.log(`${String(width).padStart(4)} ${route}${marks.length ? `: ${marks.join(", ")}` : ": ok"}`);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${width}-${route.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`), fullPage: true });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
const failing = report.pages.filter((p) => p.overflow > 0 || p.errors.length || p.crowdedCount);
console.log(`\n${report.pages.length} page views: ${report.pages.filter((p) => p.overflow > 0).length} scroll sideways, ${report.pages.filter((p) => p.cutCount).length} cut content off, ${report.pages.filter((p) => p.smallCount).length} have small touch targets, ${report.pages.filter((p) => p.crowdedCount).length} have crowded scroll frames, ${report.pages.filter((p) => p.errors.length).length} log errors.`);
console.log(`Report: ${OUT}`);
process.exitCode = failing.length ? 1 : 0;

// Accessibility audit (ADR 0053): opens every route in headless Chrome, at
// desktop and phone width, and checks what a screen reader and a keyboard
// get. It reads Chrome's own accessibility tree (the one screen readers use)
// and reports:
//   - controls with no accessible name: buttons, links, fields, switches, tabs, ...
//   - images with no alt attribute;
//   - focusable things inside aria-hidden or inert content;
//   - duplicate ids (labels and aria references point at the wrong element);
//   - headings: not exactly one h1, or a level skipped on the way down;
//   - no main landmark, no lang on <html>, more than one nav without a label;
//   - keyboard focus: Tab through the first 60 stops and flag any with no
//     visible change when focused (outline, box-shadow, border or background).
// Run it against a production build, usually the demo workspace:
//
//   pnpm qa:a11y
//   pnpm qa:a11y --routes=/,/pricing --widths=1280
//
// It writes a JSON report and exits 1 when anything is found. It doesn't
// replace a person with a screen reader; it catches what a script can.
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const BASE = flag("base") ?? "http://localhost:3000";
const WIDTHS = (flag("widths") ?? "1280,375").split(",").map(Number);
const OUT = flag("out") ?? join(tmpdir(), `farbaek-a11y-${Date.now()}.json`);
const TAB_STOPS = Number(flag("tabs") ?? 60);

const STATIC_ROUTES = [
  "/", "/pricing", "/security", "/sign-in", "/verify", "/this-page-does-not-exist",
  "/terms", "/privacy", "/acceptable-use", "/proofpack/v1", "/account-deleted",
  "/app", "/app/agents", "/app/approvals", "/app/billing", "/app/build", "/app/help", "/app/help/new", "/app/mesh",
  "/app/more", "/app/new", "/app/projects", "/app/rescue", "/app/sandbox", "/app/sandbox/new", "/app/settings",
  "/app/tasks", "/app/templates", "/app/workspaces/new",
];
const DISCOVER = [
  { from: "/app/projects", pattern: /^\/app\/projects\/[^/]+$/, then: ["", "/files", "/launch", "/security"] },
  { from: "/app/tasks", pattern: /^\/app\/tasks\/[^/]+$/, then: [""] },
  { from: "/app/templates", pattern: /^\/app\/templates\/[^/]+$/, then: [""] },
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

const NAMED_ROLES = new Set(["button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "slider", "spinbutton", "listbox", "dialog", "alertdialog", "img", "progressbar", "meter"]);

/** The DOM checks, in the page. */
function domChecks() {
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
  };
  const issues = [];
  if (!document.documentElement.lang) issues.push({ rule: "lang", el: "html" });
  for (const img of document.querySelectorAll("img:not([alt])")) issues.push({ rule: "img-alt", el: describe(img) });
  const ids = new Map();
  for (const el of document.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) issues.push({ rule: "duplicate-id", el: `#${id} (${n} times)` });
  const focusable = "a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";
  for (const el of document.querySelectorAll(focusable)) {
    // Inert content can't take focus at all; aria-hidden content still can, which strands keyboard users.
    const hidden = el.closest("[aria-hidden='true']");
    if (hidden && el.getAttribute("tabindex") !== "-1") issues.push({ rule: "focusable-hidden", el: describe(el) });
  }
  const visible = (el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0;
  };
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
  const h1 = headings.filter((h) => h.tagName === "H1");
  if (h1.length !== 1) issues.push({ rule: "h1-count", el: `${h1.length} visible h1` });
  let prev = 0;
  for (const h of headings) {
    const level = Number(h.tagName[1]);
    if (prev && level > prev + 1) issues.push({ rule: "heading-skip", el: `h${prev} then ${describe(h)}` });
    prev = level;
  }
  if (!document.querySelector("main,[role=main]")) issues.push({ rule: "no-main", el: "page" });
  const navs = [...document.querySelectorAll("nav,[role=navigation]")].filter(visible);
  if (navs.length > 1) for (const n of navs) if (!n.getAttribute("aria-label") && !n.getAttribute("aria-labelledby")) issues.push({ rule: "nav-unlabelled", el: describe(n) });
  return issues;
}

/** What the focused element looks like, to compare with the same element unfocused. */
function focusLook() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    el: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`,
    visible: r.width > 0 && r.height > 0,
    look: [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine, s.color].join("|"),
  };
}

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const report = { base: BASE, ranAt: new Date().toISOString(), widths: WIDTHS, pages: [] };
try {
  const routes = [...STATIC_ROUTES];
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    for (const d of DISCOVER) {
      await page.goto(BASE + d.from, { waitUntil: "load" });
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
      const hit = hrefs.find((h) => h && d.pattern.test(h.split(/[?#]/)[0]));
      if (hit) for (const suffix of d.then) routes.push(hit.split(/[?#]/)[0] + suffix);
    }
    await ctx.close();
  }
  const selected = routeFilter ?? routes;

  for (const width of WIDTHS) {
    const mobile = width < 768;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    for (const route of selected) {
      // A route, or a full URL (file:// for checking the checks against a page of known faults).
      await page.goto(route.startsWith("/") ? BASE + route : route, { waitUntil: "load" });
      await page.waitForTimeout(400);
      const issues = await page.evaluate(domChecks);

      // Accessible names from Chrome's accessibility tree.
      const { nodes } = await cdp.send("Accessibility.getFullAXTree");
      for (const n of nodes) {
        if (n.ignored) continue;
        const role = n.role?.value;
        if (!NAMED_ROLES.has(role)) continue;
        const name = (n.name?.value ?? "").trim();
        if (name) continue;
        // An img inside a named control is covered by the control; a dialog may be named by its heading.
        let el = "";
        if (n.backendDOMNodeId) {
          const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId }).catch(() => ({ object: null }));
          if (object?.objectId) {
            const r = await cdp.send("Runtime.callFunctionOn", {
              objectId: object.objectId,
              returnByValue: true,
              functionDeclaration: `function () {
                const cls = typeof this.className === "string" ? this.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
                const inNamed = this.closest && this.closest("a[aria-label],button[aria-label],a,button") !== this && !!this.closest("a,button");
                return { d: (this.tagName || "").toLowerCase() + (this.id ? "#" + this.id : "") + (cls ? "." + cls : ""), inNamed };
              }`,
            }).catch(() => null);
            if (r?.result?.value?.inNamed && role === "img") continue;
            el = r?.result?.value?.d ?? "";
          }
        }
        issues.push({ rule: "no-name", el: `${role} ${el}` });
      }

      // Keyboard: tab through, and see that each stop looks different when focused.
      const noFocusStyle = [];
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.keyboard.press("Tab").catch(() => {});
      const seen = new Set();
      for (let i = 0; i < TAB_STOPS; i++) {
        const focused = await page.evaluate(focusLook);
        if (!focused) break;
        if (seen.has(focused.el)) break;
        seen.add(focused.el);
        if (focused.visible && focused.el.startsWith("iframe")) {
          // Focus inside a frame can't be styled on the frame; the page marks it on a wrapper from script.
          // Compare the three nearest wrappers with focus inside, and with focus back on the page.
          const wrappers = () =>
            page.evaluate(() => {
              const out = [];
              for (let n = document.activeElement?.parentElement, i = 0; n && i < 3; n = n.parentElement, i++) {
                const s = getComputedStyle(n);
                out.push([s.outlineStyle, s.boxShadow, s.borderColor].join("|"));
              }
              return out.join("/");
            });
          await page.waitForTimeout(150);
          const inside = await wrappers();
          const frame = await page.evaluateHandle(() => document.activeElement);
          await page.evaluate(() => {
            const el = document.activeElement;
            const parent = el?.parentElement;
            el.blur();
            window.focus();
            parent?.setAttribute("data-audit-was", "1");
          });
          await page.waitForTimeout(150);
          const outside = await page.evaluate(() => {
            const parent = document.querySelector("[data-audit-was]");
            const out = [];
            for (let n = parent, i = 0; n && i < 3; n = n.parentElement, i++) {
              const s = getComputedStyle(n);
              out.push([s.outlineStyle, s.boxShadow, s.borderColor].join("|"));
            }
            parent?.removeAttribute("data-audit-was");
            return out.join("/");
          });
          await frame.evaluate((el) => el.focus());
          if (inside === outside) noFocusStyle.push(focused.el);
        } else if (focused.visible) {
          const unfocused = await page.evaluate(() => {
            const el = document.activeElement;
            el.blur();
            const s = getComputedStyle(el);
            const look = [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine, s.color].join("|");
            el.focus({ focusVisible: true });
            return look;
          });
          if (unfocused === focused.look) noFocusStyle.push(focused.el);
        }
        await page.keyboard.press("Tab");
      }
      for (const el of noFocusStyle) issues.push({ rule: "no-focus-style", el });

      report.pages.push({ route, width, issues });
      const counts = Object.entries(issues.reduce((m, i) => ((m[i.rule] = (m[i.rule] ?? 0) + 1), m), {}));
      console.log(`${String(width).padStart(4)} ${route}${counts.length ? `: ${counts.map(([r, n]) => `${n} ${r}`).join(", ")}` : ": ok"}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
const total = report.pages.reduce((n, p) => n + p.issues.length, 0);
console.log(`\n${report.pages.length} page views, ${total} findings. Report: ${OUT}`);
process.exitCode = total ? 1 : 0;

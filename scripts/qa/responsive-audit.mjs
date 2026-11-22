// Responsive audit (ADR 0051, stage 196): opens every route at representative screens in headless Chrome, as a phone, a
// landscape phone, a tablet, a touch iPad or a desktop, and reports:
//   - sideways scroll (the page is wider than the screen);
//   - cut-off content: visible text or controls running past the screen edge, even where an overflow-x: clip hides the scroll;
//   - small touch targets on touch screens (under 44 by 44 CSS pixels, counting a widened ::before or ::after tap area, and
//     ignoring links inside running text);
//   - lost taps on touch screens: a widened tap area that's clipped or covered, so a tap at its edge reaches something else;
//   - crowded side-scrolling frames: a pinned (sticky) column wider than half its frame;
//   - out of proportion on phones (ADR 0211): a title above its phone size, reading text over 17px, an icon over 20px in a
//     control, a control over 48px tall, card padding over 20px, section padding over 64px, text pushed far from the edge by
//     nested frames, anything pinned covering a third of the screen, and words one per line. Limits follow the text size.
//   - console errors and uncaught exceptions.
// Some overlays are opened by script and checked too (the public menu, the workspace list, the assistant's answer).
// Run it against a production build, usually the demo workspace:
//
//   pnpm build && pnpm start:demo            (or the farbaek-demo preview)
//   pnpm qa:responsive                       every route, every screen
//   pnpm qa:responsive --widths=320,375,844x390,1180t --routes=/,/pricing
//   pnpm qa:responsive --shots=<folder>      also save a screenshot of each (--shot=viewport for the first screen only)
//   pnpm qa:responsive --text-scale=2        as Android's text size at 200% (ADR 0171)
//   pnpm qa:responsive --strict              also fail on anything out of proportion
//   pnpm qa:responsive --theme=dark          as someone who chose Dark (ADR 0227); "system" follows --device-dark
//
// Screens: "375" is a phone (or a tablet from 768, a desktop from 1024), "844x390" a landscape phone, and "1180t" a touch
// screen of that width (an iPad). It writes a JSON report (--out, default the system temp folder) and exits 1 when a page
// scrolls sideways, has a crowded scroll frame, a small target or a lost tap, or logs an error, and with --strict when anything is
// out of proportion. These are emulated screens;
// they don't stand in for real phones. Small targets and lost taps fail the run too (stage 196); --strict also fails on anything out
// of proportion, which is a judgement to check against the contact sheets.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { DISCOVER, STATIC_ROUTES, discoverRoutes } from "./routes.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const BASE = flag("base") ?? "http://localhost:3000";
const SCREENS = (flag("widths") ?? "320,360,375,390,414,430,600,768,1024,1280,1440,844x390,667x375,1024t,1180t,1366t").split(",");
const SHOTS = flag("shots");
const SHOT_MODE = flag("shot") ?? "full";
const OUT = flag("out") ?? join(tmpdir(), `farbaek-responsive-${Date.now()}.json`);
const STRICT = args.includes("--strict");
// The browser's default font size, which rem, em and rem-based media queries all follow.
const TEXT_SCALE = Number(flag("text-scale") ?? 1);
const routeFilter = flag("routes")?.split(",");
// The look a person saved (ADR 0227): the same cookie the app writes. Light when not given.
const THEME = flag("theme");
if (THEME && !["light", "dark", "system"].includes(THEME)) throw new Error("--theme is light, dark or system");
const DEVICE_DARK = args.includes("--device-dark");

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

/** A screen from its name: "375" a phone, "768" a tablet, "1280" a desktop, "844x390" a landscape phone, "1180t" a touch iPad. */
function deviceFor(spec) {
  const m = /^(\d+)(?:x(\d+))?(t)?$/.exec(spec);
  if (!m) throw new Error(`Not a screen: ${spec}`);
  const width = Number(m[1]);
  if (m[2]) return { spec, kind: "phone", viewport: { width, height: Number(m[2]) }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  if (m[3]) return { spec, kind: "tablet", viewport: { width, height: Math.round(width * 0.72) }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  if (width < 768) return { spec, kind: "phone", viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  if (width < 1024) return { spec, kind: "tablet", viewport: { width, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  return { spec, kind: "desktop", viewport: { width, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 };
}

/** Overlays opened by script after a route's own check, and checked again as "route #name". */
const OPENERS = [
  { route: "/", name: "menu", kinds: ["phone", "tablet"], run: (page) => page.click('button[aria-controls][aria-expanded="false"]') },
  { route: "/app/more", name: "workspaces", kinds: ["phone", "tablet"], run: (page) => page.locator("details summary", { hasText: "Switch workspace" }).first().click() },
  { route: "/app", name: "search", kinds: ["phone", "tablet"], run: (page) => page.click('[data-open-palette]') },
  { route: "/app", name: "palette", kinds: ["desktop"], run: (page) => page.keyboard.press("Control+k") },
  {
    route: "/app/survey/sample?step=plan",
    name: "answer",
    kinds: ["phone", "tablet", "desktop"],
    run: async (page) => {
      const box = page.locator('textarea[maxlength="2000"]');
      await box.fill("what's the area");
      await box.press("Enter");
    },
  },
];

/** Runs in the page: what overflows, what's cut off, which touch targets are small, and which taps land elsewhere. */
function inspect(touch) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const describe = (el) => {
    if (!el) return "nothing";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    const text = (el.innerText || el.getAttribute?.("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 60);
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
    // Inside a scroller of its own (a code block, a table, a tab strip), it can be scrolled to; inside a frame on the screen that
    // clips it (a zoomed drawing in its canvas), it's meant to be out of view.
    let scrollable = false;
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth) {
        scrollable = true;
        break;
      }
      if (ox === "hidden" || ox === "clip") {
        const f = n.getBoundingClientRect();
        if (f.left >= -1 && f.right <= vw + 1) {
          scrollable = true;
          break;
        }
      }
    }
    if (!scrollable) cut.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right) });
  }

  const small = [];
  const lost = [];
  const coarse = matchMedia("(pointer: coarse)").matches;
  if (touch) {
    const controls = document.body.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio]");
    for (const el of controls) {
      if (!visible(el) || el.closest(".sr-only")) continue;
      const r = el.getBoundingClientRect();
      // An absolutely placed ::before or ::after reaching past the edges widens the tap area without changing the look.
      let { top, bottom, left, right } = r;
      const own = getComputedStyle(el);
      const v = (x) => parseFloat(x) || 0;
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === "none" || ps.position !== "absolute") continue;
        // A link that isn't positioned stretches its ::after over its nearest positioned ancestor (a whole card is the link).
        if (own.position === "static") {
          let cb = el.parentElement;
          while (cb && cb !== document.body && getComputedStyle(cb).position === "static") cb = cb.parentElement;
          if (cb && cb !== document.body && [ps.top, ps.right, ps.bottom, ps.left].every((x) => v(x) === 0)) {
            const c = cb.getBoundingClientRect();
            top = Math.min(top, c.top);
            bottom = Math.max(bottom, c.bottom);
            left = Math.min(left, c.left);
            right = Math.max(right, c.right);
          }
          continue;
        }
        // Its offsets start inside the control's border (the padding box).
        top = Math.min(top, r.top + v(own.borderTopWidth) + v(ps.top));
        bottom = Math.max(bottom, r.bottom - v(own.borderBottomWidth) - v(ps.bottom));
        left = Math.min(left, r.left + v(own.borderLeftWidth) + v(ps.left));
        right = Math.max(right, r.right - v(own.borderRightWidth) - v(ps.right));
      }
      const w = right - left;
      const h = bottom - top;
      // Half a pixel of slack for sub-pixel layout.
      const bigEnough = w >= 43.5 && h >= 43.5;
      // Links inside running text are exempt (WCAG 2.5.8's inline exception).
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /^(P|LI|SPAN|DD|TD|FIGCAPTION|LABEL)$/.test(el.parentElement.tagName);
      // A control inside or named by a 44px label is covered by it: tapping the label works too.
      const labels = [el.closest("label"), ...(el.labels ?? [])].filter(Boolean);
      const labelled = labels.some((l) => l.getBoundingClientRect().height >= 44);
      if (!bigEnough && !inline && !labelled) small.push({ el: describe(el), w: Math.round(w), h: Math.round(h) });

      // The tap probe: where the area reaches past the box, a tap just inside its edge must still reach this control. Only for
      // controls in view and not covered at their centre (a pinned bar over them at this scroll isn't a fault of theirs).
      if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) continue;
      const reaches = (hit) => hit && (hit === el || el.contains(hit));
      if (!reaches(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // 1.5px inside the widened edge, clear of the sub-pixel boundary.
      const probes = [
        top < r.top - 2 ? [cx, top + 1.5] : null,
        bottom > r.bottom + 2 ? [cx, bottom - 1.5] : null,
        left < r.left - 2 ? [left + 1.5, cy] : null,
        right > r.right + 2 ? [right - 1.5, cy] : null,
      ].filter((p) => p && p[0] >= 0 && p[0] <= vw && p[1] >= 0 && p[1] <= vh);
      // A pinned bar (the tab bar, a sticky header) passing over the edge at this scroll isn't the control's fault.
      const pinned = (hit) => {
        for (let n = hit; n && n !== document.body; n = n.parentElement) {
          const pos = getComputedStyle(n).position;
          if ((pos === "fixed" || pos === "sticky") && !n.contains(el)) return true;
        }
        return false;
      };
      for (const [x, y] of probes) {
        const hit = document.elementFromPoint(x, y);
        if (!reaches(hit) && !pinned(hit)) {
          lost.push({ el: describe(el), at: describe(hit), x: Math.round(x), y: Math.round(y) });
          break;
        }
      }
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
  return {
    scrollWidth: document.documentElement.scrollWidth,
    viewport: vw,
    coarse,
    cut: cut.slice(0, 15),
    cutCount: cut.length,
    small: small.slice(0, 15),
    smallCount: small.length,
    lost: lost.slice(0, 15),
    lostCount: lost.length,
    crowded: crowded.slice(0, 5),
    crowdedCount: crowded.length,
  };
}

/** Runs in the page on phones: what's out of proportion (ADR 0211). Limits are in CSS pixels at the default text size. */
function proportions(opts) {
  const { app, portrait } = opts;
  const scale = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const px = (v) => parseFloat(v) || 0;
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    const text = (el.innerText || el.getAttribute?.("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.getAttribute?.("aria-hidden") === "true" || n.hasAttribute?.("inert") || n.classList?.contains("sr-only")) return false;
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    }
    return true;
  };
  const exempt = (el) => Boolean(el.closest("[data-proportion-exempt]"));
  const found = [];
  const add = (kind, el, value, limit) => found.push({ kind, el: describe(el), value: Math.round(value), limit: Math.round(limit) });

  if (!portrait) {
    pinnedCover(found);
    return found;
  }
  // Titles: an app page's h1 is at most the display title's phone size, a public page's the hero's.
  const h1 = (app ? 30 : 36) * scale;
  const h2 = (app ? 24 : 28) * scale;
  for (const [sel, limit] of [["h1", h1], ["h2", h2]]) {
    for (const el of document.querySelectorAll(sel)) {
      if (!shown(el) || exempt(el)) continue;
      const fs = px(getComputedStyle(el).fontSize);
      if (fs > limit + 0.5) add(sel, el, fs, limit);
    }
  }
  // Reading text.
  for (const el of document.querySelectorAll("p, li, dd, td, blockquote")) {
    if (!shown(el) || exempt(el) || el.closest("h1,h2,h3,button")) continue;
    const fs = px(getComputedStyle(el).fontSize);
    if (fs > 17 * scale + 0.5 && (el.textContent ?? "").trim().split(/\s+/).length > 3) add("text", el, fs, 17 * scale);
  }
  // Icons in controls and rows (art and the tab bar aside).
  for (const svg of document.querySelectorAll("svg")) {
    const control = svg.closest("button, a, summary, [role=button], [role=tab], label");
    if (!control || exempt(svg) || svg.closest("[data-tab-bar]") || !shown(svg)) continue;
    if (control.getBoundingClientRect().height > 72 * scale) continue;
    const r = svg.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    if (size > 20 * scale + 0.5) add("icon", svg, size, 20 * scale);
  }
  // Controls taller than a comfortable target: buttons, fields and pills (cards that are links aside).
  if (scale < 1.25) {
    for (const el of document.querySelectorAll("button, input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, summary, [role=tab], a")) {
      if (!shown(el) || exempt(el) || el.querySelector("h1,h2,h3,h4,p,img,textarea,ul,ol")) continue;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const pill = px(s.borderTopLeftRadius) >= r.height / 2 - 1;
      if (el.tagName === "A" && !pill) continue;
      if (!(r.height > 52 && r.height < 200)) continue;
      // Words that wrap make a control taller on purpose; only a one-line control that's still tall is out of proportion.
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = new Set([...range.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top / 4))).size;
      if (lines <= 1) add("control", el, r.height, 52);
    }
  }
  // Card padding, and how far nested frames push text from the screen's edge.
  for (const el of document.querySelectorAll("div, section, article, li, a, form, details, aside, dialog")) {
    const s = getComputedStyle(el);
    if (px(s.borderTopLeftRadius) < 16) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.5 || !shown(el) || exempt(el)) continue;
    const framed = s.boxShadow !== "none" || px(s.borderTopWidth) > 0 || (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent");
    if (!framed) continue;
    const pad = Math.max(px(s.paddingLeft), px(s.paddingRight));
    if (pad > 20 * scale + 0.5) add("padding", el, pad, 20 * scale);
  }
  let inset = { value: 0, el: null };
  const besidePicture = (el, r) => {
    for (const n of [el, el.parentElement]) {
      for (let sib = n?.previousElementSibling; sib; sib = sib.previousElementSibling) {
        const q = sib.getBoundingClientRect();
        const level = n === el ? q.bottom > r.top && q.top < r.bottom : true;
        if (q.right <= r.left + 1 && level && (sib.matches("svg, img, picture, span, i") || sib.querySelector("svg, img"))) return true;
      }
    }
    return false;
  };
  for (const el of document.querySelectorAll("p, h2, h3, dd")) {
    if (!shown(el) || exempt(el) || el.closest("figure, li") || getComputedStyle(el).textAlign === "center") continue;
    const r = el.getBoundingClientRect();
    if (besidePicture(el, r)) continue;
    // The left-hand column of what's on the screen: a second column, or a card in a sideways rail, starts further in on purpose.
    if (r.width < vw * 0.4 || r.left > vw * 0.5 || r.right > vw + 1) continue;
    if (r.left > inset.value) inset = { value: r.left, el };
  }
  if (inset.el && inset.value > 56 * scale) add("inset", inset.el, inset.value, 56 * scale);
  // Section padding.
  for (const el of document.querySelectorAll("section, footer")) {
    if (!shown(el) || exempt(el)) continue;
    const s = getComputedStyle(el);
    const pad = Math.max(px(s.paddingTop), px(s.paddingBottom));
    if (pad > 64 * scale + 0.5) add("section", el, pad, 64 * scale);
  }
  pinnedCover(found);
  // Words one per line: something squeezed into a column too narrow for it.
  squeezed(found);
  return found;

  /** Anything pinned that covers more than a third of the screen (dialogs and menus that are open aside). */
  function pinnedCover(found) {
  for (const el of document.body.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    if (s.position !== "fixed" && s.position !== "sticky") continue;
    if (el.matches("dialog, [role=dialog], [aria-modal=true], [data-overlay]") || el.closest("dialog, [role=dialog], [data-overlay]") || !shown(el) || exempt(el)) continue;
    const r = el.getBoundingClientRect();
    const covered = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    if (covered > (vw * vh) / 3) found.push({ kind: "pinned", el: describe(el), value: Math.round(covered / vw), limit: Math.round(vh / 3) });
  }
  }

  function squeezed(found) {
  if (scale < 1.25) {
    for (const el of document.querySelectorAll("h1, h2, h3, h4, button, a, label, p, dt, dd, th, td, li")) {
      // The tab bar stacks each icon over its name on purpose.
      if (!shown(el) || exempt(el) || el.closest("[data-tab-bar]")) continue;
      const words = (el.innerText ?? "").trim().split(/\s+/).filter(Boolean);
      if (words.length < 3 || words.length > 14) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "absolute" || /grid/.test(cs.display) || (/flex/.test(cs.display) && cs.flexDirection.startsWith("column")) || el.querySelector("div, p, ul, ol, li, dl, br, section")) continue;
      // The lines the words themselves are on: each text node's line boxes, leaving out hidden and 1px (screen-reader) text.
      const tops = new Set();
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walk.nextNode(); t; t = walk.nextNode()) {
        if (!t.textContent.trim() || !shown(t.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        for (const q of range.getClientRects()) if (q.width > 2 && q.height > 2) tops.add(Math.round(q.top / 6));
      }
      const lines = tops.size;
      if (lines >= words.length) found.push({ kind: "squeezed", el: describe(el), value: lines, limit: words.length - 1 });
    }
  }
  }
}

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: TEXT_SCALE === 1 ? [] : [`--blink-settings=defaultFontSize=${Math.round(16 * TEXT_SCALE)}`],
});
const report = { base: BASE, ranAt: new Date().toISOString(), screens: SCREENS, textScale: TEXT_SCALE, pages: [] };
let notCoarse = 0;

try {
  const routes = [...STATIC_ROUTES, ...(routeFilter ? [] : await discoverRoutes(browser, BASE, DISCOVER))];
  const selected = routeFilter ?? routes;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  for (const spec of SCREENS) {
    const device = deviceFor(spec);
    const { kind, viewport, isMobile, hasTouch, deviceScaleFactor } = device;
    const options = { viewport, isMobile, hasTouch, deviceScaleFactor };
    const ctx = await browser.newContext({ ...options, reducedMotion: "reduce", colorScheme: DEVICE_DARK ? "dark" : "light" });
    if (THEME) await ctx.addCookies([{ name: "fb_theme", value: THEME, url: BASE }]);
    const page = await ctx.newPage();
    let errors = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => errors.push(`Uncaught: ${String(e.message).slice(0, 200)}`));

    const check = async (route, label) => {
      const found = await page.evaluate(inspect, device.hasTouch);
      if (device.hasTouch && !found.coarse) notCoarse++;
      const out = kind === "phone" ? await page.evaluate(proportions, { app: /^\/(app|office|admin|device)\b/.test(route), portrait: device.viewport.width < 640 }) : [];
      const entry = {
        route: label,
        screen: spec,
        kind,
        overflow: found.scrollWidth - found.viewport,
        ...found,
        proportion: out.slice(0, 25),
        proportionCount: out.length,
        errors: errors.filter((e) => !/Download the React DevTools/.test(e) && !(route === "/this-page-does-not-exist" && /status of 404/.test(e))),
      };
      report.pages.push(entry);
      const marks = [
        entry.overflow > 0 ? `SCROLLS SIDEWAYS by ${entry.overflow}px` : "",
        entry.cutCount ? `${entry.cutCount} cut off` : "",
        entry.smallCount ? `${entry.smallCount} small targets` : "",
        entry.lostCount ? `${entry.lostCount} lost taps` : "",
        entry.crowdedCount ? `${entry.crowdedCount} crowded scroll frames` : "",
        entry.proportionCount ? `${entry.proportionCount} out of proportion (${[...new Set(out.map((p) => p.kind))].join(", ")})` : "",
        entry.errors.length ? `${entry.errors.length} errors` : "",
      ].filter(Boolean);
      console.log(`${spec.padStart(7)} ${label}${marks.length ? `: ${marks.join(", ")}` : ": ok"}`);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${spec}-${label.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`), fullPage: SHOT_MODE === "full" });
      return entry;
    };

    for (const route of selected) {
      errors = [];
      const res = await page.goto(BASE + route, { waitUntil: "load" }).catch((e) => ({ status: () => `failed: ${e.message}` }));
      await page.waitForTimeout(500);
      const entry = await check(route, route);
      entry.status = res?.status?.() ?? null;
      for (const o of OPENERS.filter((x) => x.route === route && x.kinds.includes(kind))) {
        errors = [];
        try {
          await o.run(page);
          await page.waitForTimeout(700);
          await check(route, `${route} #${o.name}`);
        } catch (e) {
          console.log(`${spec.padStart(7)} ${route} #${o.name}: couldn't open (${String(e.message).split("\n")[0].slice(0, 80)})`);
        }
        await page.goto(BASE + route, { waitUntil: "load" }).catch(() => {});
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
const pages = report.pages;
const count = (f) => pages.filter(f).length;
const failing = pages.filter((p) => p.overflow > 0 || p.errors.length || p.crowdedCount || p.smallCount || p.lostCount || (STRICT && p.proportionCount));
console.log(
  `\n${pages.length} page views: ${count((p) => p.overflow > 0)} scroll sideways, ${count((p) => p.cutCount)} cut content off, ${count((p) => p.smallCount)} have small touch targets, ${count((p) => p.lostCount)} lose taps, ${count((p) => p.crowdedCount)} have crowded scroll frames, ${count((p) => p.proportionCount)} are out of proportion, ${count((p) => p.errors.length)} log errors.`,
);
const kinds = {};
for (const p of pages) for (const f of p.proportion ?? []) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
if (Object.keys(kinds).length) console.log(`Out of proportion, by kind: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", ")}.`);
if (notCoarse) console.log(`Warning: ${notCoarse} touch screens didn't report a coarse pointer, so touch-only styles weren't checked there.`);
console.log(`Report: ${OUT}`);
process.exitCode = failing.length ? 1 : 0;

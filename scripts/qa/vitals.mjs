// Phone performance (ADR 0052): loads pages the way a mid-range phone on a
// slow 4G connection would (Lighthouse's mobile profile: 4x slower CPU,
// 150 ms round trips, 1.6 Mbps down) and reports what the Core Web Vitals
// would see in the lab:
//   - LCP, and which element it was;
//   - CLS;
//   - TBT, the main-thread time blocked past 50 ms per task, from first paint until 5 s after load;
//   - FCP;
//   - bytes transferred by kind (JS, CSS, fonts, images, media), with the request count;
//     scripts the page's own HTML doesn't list (Next.js prefetching linked pages, lazy
//     widgets) are counted apart, as "later", so JS is what the page itself starts with.
// Each page loads three times on a fresh cache and the median is reported.
// Run it against a production build:
//
//   pnpm qa:vitals
//   pnpm qa:vitals --routes=/,/pricing --runs=5
//
// These are lab numbers from an emulated phone. They show what changed between two builds;
// they aren't field data from people's phones.
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const BASE = flag("base") ?? "http://localhost:3000";
const RUNS = Number(flag("runs") ?? 3);
const ROUTES = (flag("routes") ?? "/,/pricing,/sign-in,/security,/app,/app/new,/app/projects,/app/tasks").split(",");
const OUT = flag("out") ?? join(tmpdir(), `farbaek-vitals-${Date.now()}.json`);

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

// Collected in the page from the first byte.
const OBSERVE = () => {
  const v = { lcp: 0, lcpEl: "", cls: 0, tasks: [] };
  window.__vitals = v;
  const name = (el) => {
    if (!el) return "";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const text = (el.textContent || el.getAttribute?.("alt") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
  };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      v.lcp = e.startTime;
      v.lcpEl = name(e.element);
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) v.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) v.tasks.push([e.startTime, e.duration]);
  }).observe({ type: "longtask", buffered: true });
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const results = [];
try {
  // /app/tasks lists tasks; its first one stands in for a task page.
  const routes = [];
  for (const r of ROUTES) {
    if (r !== "/app/tasks") {
      routes.push(r);
      continue;
    }
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + r, { waitUntil: "load" });
    const href = (await page.$$eval("a[href^='/app/tasks/']", (as) => as.map((a) => a.getAttribute("href"))))[0];
    routes.push(href ?? r);
    await ctx.close();
  }

  for (const route of routes) {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
      await ctx.addInitScript(OBSERVE);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const bytes = { js: 0, later: 0, css: 0, font: 0, image: 0, media: 0, document: 0, other: 0 };
      let requests = 0;
      const types = new Map();
      const urls = new Map();
      let documentId = null;
      cdp.on("Network.requestWillBeSent", (e) => {
        urls.set(e.requestId, new URL(e.request.url).pathname);
        if (e.type === "Document" && !documentId) documentId = e.requestId;
      });
      const scripts = [];
      cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
      cdp.on("Network.loadingFinished", (e) => {
        requests += 1;
        const t = types.get(e.requestId);
        if (t === "Script") {
          scripts.push([urls.get(e.requestId) ?? "", e.encodedDataLength]);
          return;
        }
        const kind = t === "Stylesheet" ? "css" : t === "Font" ? "font" : t === "Image" ? "image" : t === "Media" ? "media" : t === "Document" ? "document" : "other";
        bytes[kind] += e.encodedDataLength;
      });
      const started = Date.now();
      await page.goto(BASE + route, { waitUntil: "load", timeout: 120_000 });
      const loadMs = Date.now() - started;
      await page.waitForTimeout(5000);
      // Scripts the original HTML names are the page's own; the rest came later.
      const html = documentId ? await cdp.send("Network.getResponseBody", { requestId: documentId }).then((r) => r.body, () => "") : "";
      for (const [path, size] of scripts) bytes[html.includes(path) ? "js" : "later"] += size;
      const m = await page.evaluate(() => {
        const v = window.__vitals;
        const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
        const tbt = v.tasks.filter(([start]) => start >= fcp).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0);
        return { lcp: v.lcp, lcpEl: v.lcpEl, cls: v.cls, fcp, tbt, dom: document.getElementsByTagName("*").length };
      });
      runs.push({ ...m, loadMs, requests, bytes });
      await ctx.close();
    }
    const pick = (k) => median(runs.map((r) => r[k]));
    const total = (r) => Object.values(r.bytes).reduce((a, b) => a + b, 0);
    const result = {
      route,
      lcp: Math.round(pick("lcp")),
      lcpEl: runs.find((r) => Math.round(r.lcp) === Math.round(pick("lcp")))?.lcpEl ?? runs[0].lcpEl,
      cls: Number(pick("cls").toFixed(3)),
      tbt: Math.round(pick("tbt")),
      fcp: Math.round(pick("fcp")),
      jsKB: Math.round(median(runs.map((r) => r.bytes.js)) / 1024),
      laterKB: Math.round(median(runs.map((r) => r.bytes.later)) / 1024),
      totalKB: Math.round(median(runs.map(total)) / 1024),
      requests: median(runs.map((r) => r.requests)),
      dom: pick("dom"),
      runs,
    };
    results.push(result);
    console.log(
      `${route.padEnd(44)} LCP ${String(result.lcp).padStart(5)} ms  CLS ${result.cls.toFixed(3)}  TBT ${String(result.tbt).padStart(5)} ms  FCP ${String(result.fcp).padStart(5)} ms  JS ${String(result.jsKB).padStart(4)} KB (+${result.laterKB} later)  total ${String(result.totalKB).padStart(5)} KB  ${result.requests} req  LCP: ${result.lcpEl}`,
    );
  }
} finally {
  await browser.close();
}
writeFileSync(OUT, JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), runs: RUNS, profile: "412x823 @2.625x, CPU 4x, 150 ms RTT, 1.6 Mbps", results }, null, 2));
console.log(`\nReport: ${OUT}`);

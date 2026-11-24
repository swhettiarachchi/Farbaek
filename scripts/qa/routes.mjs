// Every route the audits visit (stage 196): the fixed paths, and the dynamic ones found from their list pages. Shared by the
// responsive and accessibility audits, so neither can miss a page the other checks.

/** Survey Studio's nine steps, on the demo's Sample project. */
const SURVEY_STEPS = ["import", "points", "draft", "boundary", "plan", "check", "export", "history", "settings"];

/** Routes with fixed paths. */
export const STATIC_ROUTES = [
  // Public pages.
  "/", "/chat", "/images", "/video", "/build", "/proof", "/pricing", "/survey", "/security", "/sign-in", "/verify", "/this-page-does-not-exist",
  "/terms", "/privacy", "/acceptable-use", "/delete-account", "/proofpack/v1", "/account-deleted", "/offline",
  "/auth/connect", "/auth/connect/done", "/device",
  // The signed-in app.
  "/app", "/app/chat", "/app/images", "/app/video", "/app/agents", "/app/approvals", "/app/billing", "/app/build", "/app/help", "/app/help/new", "/app/mesh",
  "/app/more", "/app/new", "/app/workbench", "/app/projects", "/app/rescue", "/app/sandbox", "/app/sandbox/new", "/app/settings",
  "/app/tasks", "/app/templates", "/app/workspaces/new", "/app/skills",
  "/app/activity", "/app/incidents", "/app/integrations", "/app/policies", "/app/trust", "/app/workflows", "/app/workflows/new",
  // Survey Studio.
  "/app/survey", "/app/survey/new", "/app/survey/profile", "/app/survey/office",
  ...SURVEY_STEPS.map((s) => `/app/survey/sample?step=${s}`),
];

/** Dynamic routes: the first matching link on `from`, with each suffix in `then`. */
export const DISCOVER = [
  { from: "/app/projects", pattern: /^\/app\/projects\/[^/]+$/, then: ["", "/files", "/launch", "/security", "/github", "/graph", "/design", "/share"] },
  { from: "/app/tasks", pattern: /^\/app\/tasks\/[^/]+$/, then: [""] },
  { from: "/app/incidents", pattern: /^\/app\/incidents\/\d+$/, then: [""] },
  { from: "/app/workflows", pattern: /^\/app\/workflows\/(?!new$)[^/]+$/, then: [""] },
  { from: "/app/build", pattern: /^\/app\/build\/[^/]+$/, then: [""] },
  { from: "/app/templates", pattern: /^\/app\/templates\/[^/]+$/, then: [""] },
  { from: "/app/help", pattern: /^\/app\/help\/(?!new$)[^/]+$/, then: [""] },
  { from: "/app/sandbox", pattern: /^\/app\/sandbox\/(?!new$)[^/]+$/, then: [""] },
  { from: "/app", pattern: /^\/app\/new\/[^/]+$/, then: [""] },
  // Build's workspace for a project (stage 202), from its picker.
  { from: "/app/workbench", pattern: /^\/app\/workbench\/[^/]+$/, then: [""] },
  { from: "/pricing", pattern: /^\/subscribe\/[^/]+$/, then: [""] },
];

/** Finds the dynamic routes from their list pages; logs the ones it can't find. */
export async function discoverRoutes(browser, base, list = DISCOVER) {
  const routes = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  for (const d of list) {
    await page.goto(base + d.from, { waitUntil: "load" });
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    const hit = hrefs.find((h) => h && d.pattern.test(h.split(/[?#]/)[0]));
    if (hit) for (const suffix of d.then) routes.push(hit.split(/[?#]/)[0] + suffix);
    else console.log(`No link like ${d.pattern} on ${d.from}; skipped.`);
  }
  await ctx.close();
  return routes;
}

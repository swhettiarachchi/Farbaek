/**
 * The service worker (public/sw.js, ADR 0079, ADR 0192) keeps only pages with
 * nothing personal in them and Next.js's built files. Run here against fake
 * caches and a fake network, as a browser would run it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://www.farbaek.com";
const SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const DEVICE_HTML = `<html><head><link rel="stylesheet" href="/_next/static/css/app.css"><script src="/_next/static/chunks/device.js"></script></head><body>\\"/_next/static/chunks/rsc.js\\"</body></html>`;

type Req = { url: string; method: string; mode: string };
const key = (r: string | Req) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;

// A same-origin answer, as a browser gives it: its type is "basic", and a clone keeps that.
function response(body: string, init: { status?: number; type?: string } = {}): Response {
  const r = new Response(body, { status: init.status ?? 200 });
  Object.defineProperty(r, "type", { value: init.type ?? "basic" });
  Object.defineProperty(r, "clone", { value: () => response(body, init) });
  return r;
}

function world(pages: Record<string, string | number>) {
  let online = true;
  const fetched: string[] = [];
  const stores = new Map<string, Map<string, Response>>();
  const store = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (r: string | Req) => m.get(key(r))?.clone(),
      put: async (r: string | Req, res: Response) => void m.set(key(r), res),
      // As the real Cache API does, adding refuses an answer that isn't OK.
      add: async (r: string) => {
        const res = await fakeFetch(r);
        if (!res.ok) throw new TypeError("Request failed");
        m.set(key(r), res);
      },
      addAll: async (rs: string[]) => {
        for (const r of rs) {
          const res = await fakeFetch(r);
          if (!res.ok) throw new TypeError("Request failed");
          m.set(key(r), res);
        }
      },
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (r: string | Req | { url: string }) => m.delete(key(r as Req)),
    };
  };
  async function fakeFetch(r: string | Req): Promise<Response> {
    const url = key(r);
    fetched.push(url);
    if (!online) throw new TypeError("Failed to fetch");
    const path = new URL(url).pathname;
    const page = pages[path];
    if (typeof page === "number") return response("error", { status: page });
    return page !== undefined ? response(page) : response("missing", { status: 404 });
  }
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => void (handlers[type] = fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const caches = {
    open: async (name: string) => store(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (r: string | Req) => {
      for (const m of stores.values()) {
        const hit = m.get(key(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  vm.runInNewContext(SOURCE, { self, caches, fetch: fakeFetch, URL, Response, Promise, Set, Math, console });

  async function event(type: string, extra: object = {}) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | null = null;
    handlers[type]!({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<Response>) => (responded = p) });
    const res = responded ? await (responded as Promise<Response>) : null;
    // A wait can add another (a cache write after a response), so settle until none are left.
    for (let i = 0; i < waits.length; i += 1) await waits[i];
    return res;
  }
  const request = (path: string, init: { mode?: string; method?: string } = {}): Req => ({ url: new URL(path, ORIGIN).href, method: init.method ?? "GET", mode: init.mode ?? "no-cors" });
  const cached = () => [...stores.values()].flatMap((m) => [...m.keys()].map((u) => new URL(u).pathname + new URL(u).search));
  return { event, request, cached, fetched, setOnline: (v: boolean) => void (online = v) };
}

const PAGES = {
  "/offline": "offline page",
  "/device": DEVICE_HTML,
  "/brand/farbaek-app-192.png": "icon",
  "/brand/farbaek-logo.webp": "logo",
  "/_next/static/css/app.css": "css",
  "/_next/static/chunks/device.js": "js",
  "/_next/static/chunks/rsc.js": "rsc",
  "/_next/static/chunks/other.js": "other",
  "/app/projects": "Ama's projects",
  "/api/v1/app/me": "{\"email\":\"ama@example.com\"}",
};

describe("the service worker", () => {
  it("keeps the offline page, the device page and the device page's built files on install", async () => {
    const w = world(PAGES);
    await w.event("install");
    expect(w.cached().sort()).toEqual(
      ["/_next/static/chunks/device.js", "/_next/static/chunks/rsc.js", "/_next/static/css/app.css", "/brand/farbaek-app-192.png", "/brand/farbaek-logo.webp", "/device", "/offline"].sort(),
    );
  });

  it("never keeps a signed-in page or an API answer", async () => {
    const w = world(PAGES);
    await w.event("install");
    expect(await (await w.event("fetch", { request: w.request("/app/projects", { mode: "navigate" }) }))!.text()).toBe("Ama's projects");
    expect(await w.event("fetch", { request: w.request("/api/v1/app/me") })).toBeNull();
    expect(await w.event("fetch", { request: w.request("/app/projects/x/device/save", { method: "POST" }) })).toBeNull();
    expect(w.cached().some((p) => p.startsWith("/app") || p.startsWith("/api"))).toBe(false);
  });

  it("opens the kept device page with no connection, whatever project it names, and the offline page for anything else", async () => {
    const w = world(PAGES);
    await w.event("install");
    w.setOnline(false);
    expect(await (await w.event("fetch", { request: w.request("/device?project=abc", { mode: "navigate" }) }))!.text()).toBe(DEVICE_HTML);
    expect(await (await w.event("fetch", { request: w.request("/app", { mode: "navigate" }) }))!.text()).toBe("offline page");
  });

  it("serves built files from the cache once it has them, and keeps new ones", async () => {
    const w = world(PAGES);
    await w.event("install");
    w.setOnline(false);
    expect(await (await w.event("fetch", { request: w.request("/_next/static/chunks/device.js") }))!.text()).toBe("js");
    w.setOnline(true);
    await w.event("fetch", { request: w.request("/_next/static/chunks/other.js") });
    expect(w.cached()).toContain("/_next/static/chunks/other.js");
  });

  it("keeps the device page's files however many other built files pile up", async () => {
    const many = Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`/_next/static/chunks/page-${i}.js`, `page ${i}`]));
    const w = world({ ...PAGES, ...many });
    await w.event("install");
    for (const path of Object.keys(many)) await w.event("fetch", { request: w.request(path) });
    expect(w.cached().filter((p) => p.startsWith("/_next/static/chunks/page-")).length).toBeLessThanOrEqual(400);
    w.setOnline(false);
    for (const path of ["/_next/static/chunks/device.js", "/_next/static/chunks/rsc.js", "/_next/static/css/app.css"]) {
      expect(await (await w.event("fetch", { request: w.request(path) }))!.text()).toBe(PAGES[path as keyof typeof PAGES]);
    }
  });

  it("lets go of the files an older device page named once a newer one is kept", async () => {
    const pages: Record<string, string> = { ...PAGES };
    const w = world(pages);
    await w.event("install");
    pages["/device"] = `<script src="/_next/static/chunks/device-2.js"></script>`;
    pages["/_next/static/chunks/device-2.js"] = "js 2";
    await w.event("fetch", { request: w.request("/device", { mode: "navigate" }) });
    w.setOnline(false);
    expect(await (await w.event("fetch", { request: w.request("/device", { mode: "navigate" }) }))!.text()).toContain("device-2.js");
    expect(await (await w.event("fetch", { request: w.request("/_next/static/chunks/device-2.js") }))!.text()).toBe("js 2");
    expect(w.cached()).not.toContain("/_next/static/chunks/rsc.js");
  });

  it("keeps the old, whole device page when a newer one names a file that didn't arrive", async () => {
    const pages: Record<string, string | number> = { ...PAGES };
    const w = world(pages);
    await w.event("install");
    pages["/device"] = `<script src="/_next/static/chunks/never-arrives.js"></script>`;
    await w.event("fetch", { request: w.request("/device", { mode: "navigate" }) });
    w.setOnline(false);
    expect(await (await w.event("fetch", { request: w.request("/device", { mode: "navigate" }) }))!.text()).toBe(DEVICE_HTML);
    expect(await (await w.event("fetch", { request: w.request("/_next/static/chunks/device.js") }))!.text()).toBe("js");
  });

  it("opens the kept device page when Farbaek's server answers with an error", async () => {
    const pages: Record<string, string | number> = { ...PAGES };
    const w = world(pages);
    await w.event("install");
    pages["/device"] = 502;
    expect(await (await w.event("fetch", { request: w.request("/device", { mode: "navigate" }) }))!.text()).toBe(DEVICE_HTML);
  });

  it("leaves other sites' requests alone", async () => {
    const w = world(PAGES);
    expect(await w.event("fetch", { request: { url: "https://example.com/_next/static/x.js", method: "GET", mode: "no-cors" } })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { PREVIEW_DOC_MESSAGE, PREVIEW_FRAME_CSP, PREVIEW_FRAME_HTML, PREVIEW_LOADED_MESSAGE, PREVIEW_READY_MESSAGE, previewFrameHeaders } from "./preview-frame";
import { STATIC_PREVIEW_CSP } from "./static-preview";

describe("the preview frame (ADR 0169)", () => {
  it("runs under the static-preview policy, sealed into an opaque origin and framed only by Farbaek", () => {
    expect(PREVIEW_FRAME_CSP.startsWith(STATIC_PREVIEW_CSP)).toBe(true);
    expect(PREVIEW_FRAME_CSP).toContain("; sandbox allow-scripts;");
    expect(PREVIEW_FRAME_CSP).toContain("frame-ancestors 'self'");
    // No network for the site's scripts, and no forms.
    expect(PREVIEW_FRAME_CSP).toContain("connect-src 'none'");
    expect(PREVIEW_FRAME_CSP).toContain("form-action 'none'");
    expect(PREVIEW_FRAME_CSP).not.toContain("allow-same-origin");
  });

  it("sends its policy with nosniff, no referrer and noindex", () => {
    expect(previewFrameHeaders()).toEqual({
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": PREVIEW_FRAME_CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "public, max-age=600",
      "x-robots-tag": "noindex",
    });
  });

  it("accepts a document only from its parent at the app's origin, and answers only to that origin", () => {
    const html = PREVIEW_FRAME_HTML;
    expect(html).toContain("if(window.parent===window)return;");
    expect(html).toContain("var app=new URL(location.href).origin");
    expect(html).toContain("if(e.source!==parent||e.origin!==app)return;");
    expect(html).toContain(`d.type==="${PREVIEW_DOC_MESSAGE}"&&typeof d.html==="string"`);
    // Every message up goes to the app's origin, never "*".
    expect(html.match(/parent\.postMessage\([^)]*\)/g)).toEqual([`parent.postMessage({type:"${PREVIEW_LOADED_MESSAGE}"},app)`, "parent.postMessage(e.data,app)", `parent.postMessage({type:"${PREVIEW_READY_MESSAGE}"},app)`]);
    // The site runs in its own sandboxed frame, never written into this document.
    expect(html).toContain('f.setAttribute("sandbox","allow-scripts")');
    expect(html).not.toContain("document.write");
  });
});

/** Runs the frame's own script against stand-in windows, so its checks are tested by behaviour. */
function runFrame({ top = false } = {}) {
  const script = PREVIEW_FRAME_HTML.match(/<script>([\s\S]*)<\/script>/)![1]!;
  const up: { data: unknown; origin: string }[] = [];
  const down: unknown[] = [];
  interface FakeFrame {
    attrs: Record<string, string>;
    srcdoc: string;
    load?: () => void;
    contentWindow: { postMessage: (data: unknown) => void };
    setAttribute(k: string, v: string): void;
    addEventListener(type: string, fn: () => void): void;
    replaceWith(n: FakeFrame): void;
  }
  const frames: FakeFrame[] = [];
  const parent = { postMessage: (data: unknown, origin: string) => up.push({ data, origin }) };
  const self: { parent: unknown } = { parent };
  if (top) self.parent = self;
  const child = { postMessage: (data: unknown) => down.push(data) };
  let onMessage: ((e: { source: unknown; origin: string; data: unknown }) => void) | null = null;
  const document = {
    createElement: (): FakeFrame => ({
      attrs: {},
      srcdoc: "",
      contentWindow: child,
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      addEventListener(_, fn) {
        this.load = fn;
      },
      replaceWith(n) {
        frames.splice(frames.indexOf(this), 1, n);
      },
    }),
    body: { appendChild: (f: (typeof frames)[number]) => frames.push(f) },
  };
  new Function("window", "parent", "location", "document", "addEventListener", script)(self, self.parent, { href: "https://www.farbaek.com/preview-frame" }, document, (_: string, fn: typeof onMessage) => (onMessage = fn));
  const APP = "https://www.farbaek.com";
  return {
    up,
    down,
    frames,
    listening: () => onMessage !== null,
    fromApp: (data: unknown, origin = APP, source: unknown = parent) => onMessage!({ source, origin, data }),
    fromSite: (data: unknown) => onMessage!({ source: child, origin: "null", data }),
  };
}

describe("the preview frame's script, by behaviour", () => {
  const APP = "https://www.farbaek.com";

  it("says it's ready, to the app's origin only", () => {
    expect(runFrame().up).toEqual([{ data: { type: PREVIEW_READY_MESSAGE }, origin: APP }]);
  });

  it("does nothing at all when opened on its own", () => {
    const f = runFrame({ top: true });
    expect(f.up).toEqual([]);
    expect(f.listening()).toBe(false);
  });

  it("takes a document only from its parent at the app's origin, in a sandboxed frame, and says when it loaded", () => {
    const f = runFrame();
    f.fromApp({ type: PREVIEW_DOC_MESSAGE, html: "<p>evil</p>" }, "https://evil.example");
    f.fromApp({ type: PREVIEW_DOC_MESSAGE, html: "<p>evil</p>" }, APP, { postMessage() {} });
    f.fromApp({ type: PREVIEW_DOC_MESSAGE, html: 42 });
    expect(f.frames).toEqual([]);
    f.fromApp({ type: PREVIEW_DOC_MESSAGE, html: "<p>site</p>" });
    expect(f.frames).toHaveLength(1);
    expect(f.frames[0]!).toMatchObject({ srcdoc: "<p>site</p>", attrs: { sandbox: "allow-scripts", referrerpolicy: "no-referrer" } });
    f.frames[0]!.load!();
    expect(f.up.at(-1)).toEqual({ data: { type: PREVIEW_LOADED_MESSAGE }, origin: APP });
    // A new document replaces the frame rather than adding one.
    f.fromApp({ type: PREVIEW_DOC_MESSAGE, html: "<p>next</p>" });
    expect(f.frames.map((x) => x.srcdoc)).toEqual(["<p>next</p>"]);
  });

  it("passes the app's other messages to the site, and the site's to the app, but never the frame's own", () => {
    const f = runFrame();
    f.fromApp({ type: PREVIEW_DOC_MESSAGE, html: "<p>site</p>" });
    f.fromApp({ type: "farbaek-design-select", n: 3 });
    expect(f.down).toEqual([{ type: "farbaek-design-select", n: 3 }]);
    const before = f.up.length;
    f.fromSite({ type: "farbaek-design-pick", n: 3 });
    for (const type of [PREVIEW_READY_MESSAGE, PREVIEW_LOADED_MESSAGE, PREVIEW_DOC_MESSAGE]) f.fromSite({ type, html: "<p>loop</p>" });
    expect(f.up.slice(before)).toEqual([{ data: { type: "farbaek-design-pick", n: 3 }, origin: APP }]);
  });
});

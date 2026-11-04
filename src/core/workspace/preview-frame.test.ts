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

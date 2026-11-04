/**
 * The preview frame (ADR 0169). Previews of people's sites used to be
 * `srcdoc` frames inside the app, and a `srcdoc` document inherits the app's
 * Content-Security-Policy, so the app's nonce policy couldn't be enforced
 * without stopping every site's own scripts.
 *
 * Now the app frames this small, fixed document from its own host
 * (`/preview-frame`). Being loaded over the network, it has its own policy:
 * the static-preview policy, plus `sandbox allow-scripts`, so it runs in an
 * opaque origin even when opened directly, with no access to Farbaek's
 * cookies or storage. It renders the site in a nested `srcdoc` frame, which
 * inherits this policy instead of the app's, and relays messages between the
 * app and the site, so the preview and Studio bridges work as they did.
 */

import { STATIC_PREVIEW_CSP } from "./static-preview";

export const PREVIEW_FRAME_PATH = "/preview-frame";
/** App to frame: the document to show. */
export const PREVIEW_DOC_MESSAGE = "farbaek-preview-doc";
/** Frame to app: the frame is listening. */
export const PREVIEW_READY_MESSAGE = "farbaek-preview-ready";
/** Frame to app: the site's document finished loading. */
export const PREVIEW_LOADED_MESSAGE = "farbaek-preview-loaded";

// The app frames this document from its own host, so the frame's address carries the app's origin even
// though the document itself is opaque. Only that origin's parent can hand it a document; the site's own
// messages go back to that origin only.
const SCRIPT = `(function(){
if(window.parent===window)return;
var app=new URL(location.href).origin,child=null;
function mount(html){
var f=document.createElement("iframe");
f.setAttribute("sandbox","allow-scripts");
f.setAttribute("referrerpolicy","no-referrer");
f.setAttribute("title","Site preview");
f.addEventListener("load",function(){if(f===child)parent.postMessage({type:"${PREVIEW_LOADED_MESSAGE}"},app);});
f.srcdoc=html;
if(child)child.replaceWith(f);else document.body.appendChild(f);
child=f;
}
addEventListener("message",function(e){
if(child&&e.source===child.contentWindow){parent.postMessage(e.data,app);return;}
if(e.source!==parent||e.origin!==app)return;
var d=e.data;
if(d&&d.type==="${PREVIEW_DOC_MESSAGE}"&&typeof d.html==="string"){mount(d.html);return;}
if(child&&child.contentWindow)child.contentWindow.postMessage(d,"*");
});
parent.postMessage({type:"${PREVIEW_READY_MESSAGE}"},app);
})();`;

export const PREVIEW_FRAME_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Preview</title><style>html,body{margin:0;height:100%;background:transparent}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><script>${SCRIPT}</script></body></html>`;

/** The frame's own policy: what every preview runs under, sealed into an opaque origin, framed only by Farbaek. */
export const PREVIEW_FRAME_CSP = `${STATIC_PREVIEW_CSP}; sandbox allow-scripts; frame-ancestors 'self'`;

export function previewFrameHeaders(): Record<string, string> {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": PREVIEW_FRAME_CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "public, max-age=600",
    "x-robots-tag": "noindex",
  };
}

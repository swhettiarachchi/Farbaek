/**
 * The picker script a preview host serves at PICKER_PATH (ADR 0149). It runs
 * inside the person's app, in the preview's frame, and does nothing until
 * Farbaek's own page (the only allowed parent, by origin) turns picking on.
 * Then it outlines what the pointer is over, swallows the click, and tells
 * the parent the element's tag, its own words and its classes. It reads
 * nothing else from the page and never sends anything elsewhere.
 */
export function pickerScript(appOrigin: string): string {
  return `(() => {
  const APP = ${JSON.stringify(appOrigin)};
  if (window.parent === window) return;
  let on = false;
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #1d4ed8;background:rgba(29,78,216,0.08);border-radius:4px;display:none;box-sizing:border-box";
  const describe = (el) => ({
    type: "farbaek:picked",
    tag: el.tagName.toLowerCase().slice(0, 40),
    text: el.childElementCount === 0 ? (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 500) : "",
    classes: (el.getAttribute("class") || "").split(/\\s+/).filter(Boolean).slice(0, 60),
  });
  const place = (el) => {
    const r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  };
  document.addEventListener("mouseover", (e) => { if (on && e.target instanceof Element && e.target !== box) place(e.target); }, true);
  document.addEventListener("click", (e) => {
    if (!on || !(e.target instanceof Element)) return;
    e.preventDefault();
    e.stopPropagation();
    place(e.target);
    window.parent.postMessage(describe(e.target), APP);
  }, true);
  window.addEventListener("message", (e) => {
    if (e.origin !== APP || e.source !== window.parent) return;
    const d = e.data;
    if (!d || d.type !== "farbaek:pick") return;
    on = d.on === true;
    if (!on) box.style.display = "none";
    document.documentElement.style.cursor = on ? "crosshair" : "";
  });
  const ready = () => {
    (document.body || document.documentElement).appendChild(box);
    window.parent.postMessage({ type: "farbaek:ready" }, APP);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
})();
`;
}

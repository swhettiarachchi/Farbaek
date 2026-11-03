import { describe, expect, it } from "vitest";
import {
  DESIGN_ATTR,
  annotateForDesign,
  applyVisualEdit,
  attrValue,
  checkHref,
  checkStyleValue,
  cssColorToHex,
  editableText,
  hasAttr,
  mediaRef,
  mediaSlots,
  outline,
  relativeHref,
  scanElements,
  upsertRule,
} from "./visual-edit";
import { TEXT_SIZES } from "./site-theme";

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Harbour &amp; Co</title>
  <link rel="stylesheet" href="styles.css">
  <!-- <p>not an element</p> -->
  <script>if (a < b) document.write("<p>")</script>
</head>
<body>
  <header id="top"><h1 class="title">Fresh bread daily</h1></header>
  <p>Open <strong>every</strong> day</p>
  <p>Unclosed paragraph
  <ul><li>One<li>Two</ul>
  <a href="menu.html">See the menu</a>
  <img src="images/loaf.jpg" alt="A loaf">
</body>
</html>
`;

const files = { "index.html": PAGE, "styles.css": "body { margin: 0; }\n" };
const find = (html: string, tag: string, nth = 0) => scanElements(html).filter((e) => e.tag === tag)[nth]!;

describe("reading the source", () => {
  it("finds every element with its position, skipping comments and script text", () => {
    const els = scanElements(PAGE);
    expect(els.map((e) => e.tag)).toEqual(["html", "head", "meta", "title", "link", "script", "body", "header", "h1", "p", "strong", "p", "ul", "li", "li", "a", "img"]);
    const h1 = find(PAGE, "h1");
    expect(PAGE.slice(h1.start, h1.openEnd)).toBe('<h1 class="title">');
    expect(PAGE.slice(h1.close!.start, h1.close!.end)).toBe("</h1>");
    expect(els[h1.parent!]!.tag).toBe("header");
  });

  it("closes paragraphs and list items the way a browser does", () => {
    const [, unclosed] = scanElements(PAGE).filter((e) => e.tag === "p");
    expect(unclosed!.close).toBeNull();
    const ul = find(PAGE, "ul");
    expect(ul.children.map((n) => scanElements(PAGE)[n]!.tag)).toEqual(["li", "li"]);
    expect(scanElements(PAGE)[ul.parent!]!.tag).toBe("body");
  });

  it("gives text only for elements that hold only text, decoded", () => {
    expect(editableText(PAGE, find(PAGE, "h1"))).toBe("Fresh bread daily");
    expect(editableText(PAGE, find(PAGE, "p"))).toBeNull();
    expect(editableText(PAGE, find(PAGE, "title"))).toBeNull();
    expect(editableText(PAGE, find(PAGE, "img"))).toBeNull();
  });

  it("numbers each element for the preview without moving anything else", () => {
    const annotated = annotateForDesign(PAGE);
    expect(annotated).toContain(`<h1 ${DESIGN_ATTR}="8" ${DESIGN_ATTR}-text class="title">`);
    expect(annotated).toContain(`<img ${DESIGN_ATTR}="16" src="images/loaf.jpg"`);
    expect(annotated.replace(new RegExp(` ${DESIGN_ATTR}="\\d+"(?: ${DESIGN_ATTR}-text)?`, "g"), "")).toBe(PAGE);
  });

  it("marks the words a person can type over in the preview, and only those (ADR 0162)", () => {
    const typeable = [...annotateForDesign(PAGE).matchAll(new RegExp(`<([a-z0-9]+) ${DESIGN_ATTR}="\\d+" ${DESIGN_ATTR}-text`, "g"))].map((m) => m[1]);
    // Not the paragraph holding <strong>, nor elements that never close, nor the title, an image or the page itself.
    expect(typeable).toEqual(["h1", "strong", "a"]);
    const hidden = annotateForDesign('<body><span aria-hidden="true">x</span><p>  </p><p>Hi</p></body>');
    expect(hidden).not.toContain(`<span ${DESIGN_ATTR}="1" ${DESIGN_ATTR}-text`);
    expect(hidden.match(new RegExp(`${DESIGN_ATTR}-text`, "g"))).toHaveLength(1);
  });

  it("outlines what a person can pick inside the body", () => {
    const items = outline(PAGE);
    expect(items.map((i) => `${i.tag}:${i.label}`)).toEqual(["header:Fresh bread daily", "h1:Fresh bread daily", "p:Open every day", "strong:every", "p:Unclosed paragraph", "li:One", "li:Two", "a:See the menu", "img:A loaf"]);
  });
});

describe("text, links and images", () => {
  it("replaces only the element's text, escaped", () => {
    const r = applyVisualEdit(files, "index.html", find(PAGE, "h1").n, { kind: "text", text: "Bread & <cakes>" });
    expect(r).toMatchObject({ ok: true, changed: ["index.html"] });
    if (!r.ok) return;
    expect(r.files["index.html"]).toBe(PAGE.replace("Fresh bread daily", "Bread &amp; &lt;cakes&gt;"));
  });

  it("refuses text for an element that holds other elements", () => {
    expect(applyVisualEdit(files, "index.html", find(PAGE, "p").n, { kind: "text", text: "x" })).toMatchObject({ ok: false, reason: expect.stringContaining("holds other elements") });
    expect(applyVisualEdit(files, "index.html", 999, { kind: "text", text: "x" })).toMatchObject({ ok: false });
  });

  it("sets a link's address, and refuses script and protocol-relative addresses", () => {
    const a = find(PAGE, "a").n;
    const r = applyVisualEdit(files, "index.html", a, { kind: "link", href: "https://example.com/?a=1&b=2" });
    expect(r.ok && r.files["index.html"]).toContain('<a href="https://example.com/?a=1&amp;b=2">');
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "a b", ""]) expect(applyVisualEdit(files, "index.html", a, { kind: "link", href: bad }).ok).toBe(false);
    expect(applyVisualEdit(files, "index.html", find(PAGE, "h1").n, { kind: "link", href: "#x" }).ok).toBe(false);
    expect(checkHref("contact.html#form")).toBe("contact.html#form");
    expect(checkHref("mailto:hi@example.com")).toBe("mailto:hi@example.com");
  });

  it("sets an image's description", () => {
    const r = applyVisualEdit(files, "index.html", find(PAGE, "img").n, { kind: "image", alt: 'A "sourdough" loaf' });
    expect(r.ok && r.files["index.html"]).toContain('alt="A &quot;sourdough&quot; loaf"');
  });
});

describe("media people can replace (ADR 0156)", () => {
  const MEDIA = `<!doctype html><html lang="en"><body>
<section class="hero">
  <video autoplay muted loop playsinline poster="https://www.farbaek.com/media/v1/aurora-signal/still-16x9.webp" aria-hidden="true" data-farbaek-media="hero-video" data-farbaek-placeholder>
    <source src="https://www.farbaek.com/media/v1/aurora-signal/loop.mp4" type="video/mp4">
  </video>
  <div class="scene" data-farbaek-scene="aurora" data-farbaek-media="hero-scene" aria-hidden="true"></div>
</section>
<img src="https://picsum.photos/id/42/1600/900" srcset="a.jpg 1x, b.jpg 2x" alt="The café at opening" data-farbaek-media="cafe-photo" data-farbaek-placeholder>
</body></html>`;
  const mfiles = { "index.html": MEDIA, "about/team.html": MEDIA };
  const assets = new Set(["assets/cafe.webp"]);
  const at = (tag: string, html = MEDIA) => find(html, tag).n;

  it("lists the page's images, videos and scenes, with their placeholders", () => {
    expect(mediaSlots(scanElements(MEDIA))).toEqual([
      { n: expect.any(Number), kind: "video", slot: "hero-video", placeholder: true, source: "https://www.farbaek.com/media/v1/aurora-signal/loop.mp4" },
      { n: expect.any(Number), kind: "scene", slot: "hero-scene", placeholder: false, source: "aurora" },
      { n: expect.any(Number), kind: "image", slot: "cafe-photo", placeholder: true, source: "https://picsum.photos/id/42/1600/900" },
    ]);
    expect(outline(MEDIA).map((i) => i.label)).toEqual(expect.arrayContaining(["3D scene: aurora", "hero-video"]));
  });

  it("puts the person's own image in, from any page, and the placeholder mark comes off", () => {
    const r = applyVisualEdit(mfiles, "about/team.html", at("img"), { kind: "media", src: "assets/cafe.webp" }, assets);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const img = find(r.files["about/team.html"]!, "img");
    expect(attrValue(img, "src")).toBe("../assets/cafe.webp");
    expect(hasAttr(img, "srcset")).toBe(false);
    expect(hasAttr(img, "data-farbaek-placeholder")).toBe(false);
    expect(attrValue(img, "alt")).toBe("The café at opening");
  });

  it("keeps the mark for a Farbaek file or a stand-in photo", () => {
    const r = applyVisualEdit(mfiles, "index.html", at("img"), { kind: "media", src: "https://picsum.photos/id/30/1080/1350" }, assets);
    expect(r.ok && hasAttr(find(r.files["index.html"]!, "img"), "data-farbaek-placeholder")).toBe(true);
    const own = applyVisualEdit(mfiles, "index.html", at("img"), { kind: "media", src: "https://cdn.example.com/my-cafe.jpg" }, assets);
    expect(own.ok && hasAttr(find(own.files["index.html"]!, "img"), "data-farbaek-placeholder")).toBe(false);
  });

  it("replaces a video's source and poster", () => {
    const r = applyVisualEdit(mfiles, "index.html", at("video"), { kind: "media", src: "https://cdn.example.com/kitchen.webm", poster: "assets/cafe.webp" }, assets);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const html = r.files["index.html"]!;
    expect(attrValue(find(html, "source"), "src")).toBe("https://cdn.example.com/kitchen.webm");
    expect(attrValue(find(html, "source"), "type")).toBe("video/webm");
    expect(attrValue(find(html, "video"), "poster")).toBe("assets/cafe.webp");
    expect(hasAttr(find(html, "video"), "data-farbaek-placeholder")).toBe(false);
    expect(hasAttr(find(html, "video"), "playsinline")).toBe(true);
  });

  it("updates a picture's sources and every source of a video", () => {
    const html = `<!doctype html><html lang="en"><body><picture><source srcset="a.avif" type="image/avif"><source srcset="a.webp" type="image/webp"><img src="a.jpg" alt="x"></picture>
<video autoplay muted loop playsinline poster="p.webp" aria-hidden="true"><source src="old.webm" type="video/webm"><source src="old.mp4" type="video/mp4"></video></body></html>`;
    const f = { "index.html": html };
    const pic = applyVisualEdit(f, "index.html", find(html, "img").n, { kind: "media", src: "https://cdn.example.com/own.jpg" });
    expect(pic.ok).toBe(true);
    if (!pic.ok) return;
    const sources = scanElements(pic.files["index.html"]!).filter((e) => e.tag === "source").slice(0, 2);
    expect(sources.map((s) => attrValue(s, "srcset"))).toEqual(["https://cdn.example.com/own.jpg", "https://cdn.example.com/own.jpg"]);
    expect(sources.every((s) => !hasAttr(s, "type"))).toBe(true);
    const vid = applyVisualEdit(f, "index.html", find(html, "video").n, { kind: "media", src: "https://cdn.example.com/own.mp4" });
    expect(vid.ok).toBe(true);
    if (!vid.ok) return;
    const vs = scanElements(vid.files["index.html"]!).filter((e) => e.tag === "source").slice(2);
    expect(vs.map((s) => `${attrValue(s, "src")} ${attrValue(s, "type")}`)).toEqual(["https://cdn.example.com/own.mp4 video/mp4", "https://cdn.example.com/own.mp4 video/mp4"]);
  });

  it("refuses what isn't https or the project's own image", () => {
    const img = at("img");
    for (const bad of ["http://x.test/a.jpg", "javascript:alert(1)", "data:image/png;base64,AA", "//x.test/a.jpg", "assets/missing.webp", "../assets/cafe.webp", "a b.jpg", ""]) {
      expect(applyVisualEdit(mfiles, "index.html", img, { kind: "media", src: bad }, assets).ok, bad).toBe(false);
    }
    // Projects can't hold video, so a video only takes an https address.
    expect(applyVisualEdit(mfiles, "index.html", at("video"), { kind: "media", src: "assets/cafe.webp" }, assets).ok).toBe(false);
    expect(applyVisualEdit(mfiles, "index.html", at("section"), { kind: "media", src: "https://x.test/a.jpg" }, assets).ok).toBe(false);
    expect(mediaRef("index.html", "https://x.test/a.jpg", "image", assets)).toBe("https://x.test/a.jpg");
    expect(relativeHref("a/b/c.html", "a/x.webp")).toBe("../x.webp");
    expect(relativeHref("index.html", "assets/x.webp")).toBe("assets/x.webp");
  });

  it("switches a scene, to scenes the kit has", () => {
    const box = scanElements(MEDIA).find((e) => attrValue(e, "data-farbaek-scene") !== null)!.n;
    const r = applyVisualEdit(mfiles, "index.html", box, { kind: "scene", scene: "glass" });
    expect(r.ok && r.files["index.html"]).toContain('data-farbaek-scene="glass"');
    expect(applyVisualEdit(mfiles, "index.html", box, { kind: "scene", scene: "teapot" }).ok).toBe(false);
    expect(applyVisualEdit(mfiles, "index.html", at("img"), { kind: "scene", scene: "glass" }).ok).toBe(false);
  });
});

describe("styles", () => {
  it("adds a class and a rule in the page's stylesheet, then updates the same rule", () => {
    const h1 = find(PAGE, "h1").n;
    const first = applyVisualEdit(files, "index.html", h1, { kind: "style", props: { color: "#1D4ED8", "font-size": "48px" } });
    expect(first).toMatchObject({ ok: true, changed: ["styles.css", "index.html"], note: null });
    if (!first.ok) return;
    expect(first.files["index.html"]).toContain('<h1 class="title vb-h1-1">');
    expect(first.files["styles.css"]).toBe("body { margin: 0; }\n\n.vb-h1-1 {\n  color: #1d4ed8 !important;\n  font-size: 48px !important;\n}\n");

    const second = applyVisualEdit(first.files, "index.html", h1, { kind: "style", props: { color: null, "text-align": "center" } });
    expect(second).toMatchObject({ ok: true, changed: ["styles.css"] });
    if (!second.ok) return;
    expect(second.files["styles.css"]).toBe("body { margin: 0; }\n\n.vb-h1-1 {\n  font-size: 48px !important;\n  text-align: center !important;\n}\n");
  });

  it("wins over the site's own, more specific rules, so the change always shows", () => {
    // A site's ".section h1" outranks the editor's class; the person's choice for this element must still apply.
    const site = { ...files, "styles.css": ".section h1 { font-size: 24px; }\n" };
    const r = applyVisualEdit(site, "index.html", find(PAGE, "h1").n, { kind: "style", props: { "font-size": TEXT_SIZES.display.value } });
    expect(r.ok && r.files["styles.css"]).toBe(`.section h1 { font-size: 24px; }\n\n.vb-h1-1 {\n  font-size: ${TEXT_SIZES.display.value} !important;\n}\n`);
  });

  it("uses the element's id when it has one, and a new class number when one is taken", () => {
    const r = applyVisualEdit(files, "index.html", find(PAGE, "header").n, { kind: "style", props: { padding: "24px" } });
    expect(r.ok && r.files["styles.css"]).toContain("#top {\n  padding: 24px !important;\n}");
    const taken = { ...files, "styles.css": ".vb-h1-1 { color: #000000; }\n" };
    const r2 = applyVisualEdit(taken, "index.html", find(PAGE, "h1").n, { kind: "style", props: { "font-weight": "700" } });
    expect(r2.ok && r2.files["index.html"]).toContain('class="title vb-h1-2"');
  });

  it("writes a style block in the head when the page links no stylesheet in the project", () => {
    const bare = { "about.html": "<html><head><title>About</title></head><body><h2>Us</h2></body></html>" };
    const r = applyVisualEdit(bare, "about.html", 4, { kind: "style", props: { "background-color": "#fef3c7" } });
    expect(r).toMatchObject({ ok: true, changed: ["about.html"], note: expect.stringContaining("style block") });
    if (!r.ok) return;
    expect(r.files["about.html"]).toBe('<html><head><title>About</title><style data-visual-edits>\n.vb-h2-1 {\n  background-color: #fef3c7 !important;\n}\n</style>\n</head><body><h2 class="vb-h2-1">Us</h2></body></html>');
    const again = applyVisualEdit(r.files, "about.html", scanElements(r.files["about.html"]!).find((e) => e.tag === "h2")!.n, { kind: "style", props: { "border-radius": "12px" } });
    expect(again.ok && again.files["about.html"]).toContain("<style data-visual-edits>\n.vb-h2-1 {\n  background-color: #fef3c7 !important;\n  border-radius: 12px !important;\n}\n</style>");
  });

  it("writes only the values the editor offers, so nothing else reaches the CSS", () => {
    const h1 = find(PAGE, "h1").n;
    for (const props of [{ color: "red; } body { display: none" }, { color: "#fff" }, { "font-size": "2000px" }, { "font-size": "1em" }, { "font-weight": "bold" }, { "text-align": "justify" }, { padding: "-4px" }]) {
      expect(applyVisualEdit(files, "index.html", h1, { kind: "style", props }).ok).toBe(false);
    }
    expect(checkStyleValue("font-size", "16PX")).toBe("16px");
    expect(applyVisualEdit(files, "index.html", h1, { kind: "style", props: {} })).toMatchObject({ ok: false, reason: "Change a style first." });
  });

  it("changes only a rule whose whole selector matches, at the top level", () => {
    const css = ".card .vb-h1-1 { color: #000000; }\n@media (max-width: 600px) {\n  .vb-h1-1 { color: #111111; }\n}\n";
    const out = upsertRule(css, ".vb-h1-1", [["color", "#222222"]]);
    expect(out).toBe(`${css}\n.vb-h1-1 {\n  color: #222222;\n}\n`);
    expect(upsertRule("/* hero */ .vb-h1-1 { color: #000000; }", ".vb-h1-1", [["color", "#ffffff"]])).toBe("/* hero */ .vb-h1-1 {\n  color: #ffffff;\n}");
  });
});

describe("colours from the preview", () => {
  it("turns computed colours into the editor's hex values", () => {
    expect(cssColorToHex("rgb(29, 78, 216)")).toBe("#1d4ed8");
    expect(cssColorToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(cssColorToHex("rgb(255 255 255 / 50%)")).toBe("#ffffff");
    expect(cssColorToHex("#ABCDEF")).toBe("#abcdef");
    expect(cssColorToHex("transparent")).toBeNull();
  });
});

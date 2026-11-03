import { describe, expect, it } from "vitest";
import { reviewSite } from "@/core/agent/site-review";
import { DARK_LOOKS, LIGHT_LOOKS, STUDIO_KIT_CSS, STUDIO_KIT_JS, STUDIO_KIT_PRO_CSS } from "@/core/media/studio-kit";
import { LOOK_SWATCHES, TEXT_SIZES, contrastRatio } from "./site-theme";
import { SNIPPETS } from "./snippets";
import { DESIGN_SCRIPT, applyVisualEdit, checkStyleValue, labelText, readTheme, scanElements, sections, upsertCustomProps } from "./visual-edit";

const PAGE = `<!doctype html>
<html lang="en" data-fs-look="signal">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kiln</title>
    <meta name="description" content="A bakery." />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Young+Serif&amp;display=swap" />
    <link rel="stylesheet" href="${STUDIO_KIT_CSS}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main id="main">
      <section class="fs-hero" id="top">
        <h1 data-fs-reveal="words">Bread worth getting up for.</h1>
        <a class="fs-btn" href="#visit">See today's bakes <span class="fs-btn__icon" aria-hidden="true"></span></a>
      </section>
      <section class="fs-section" id="story" aria-labelledby="story-title">
        <h2 id="story-title">Slow dough</h2>
      </section>
      <section class="fs-section" id="visit">
        <h2>Come by</h2>
      </section>
    </main>
    <script type="module" src="${STUDIO_KIT_JS}"></script>
  </body>
</html>
`;
const CSS = `/* Kiln & Crumb */
:root {
  /* The brand. */
  --accent: #c76a1c;
  --ink: #17231c;
}

.hero { color: #fff; }
`;
const files = { "index.html": PAGE, "styles.css": CSS, "about.html": PAGE.replace("<title>Kiln</title>", "<title>About</title>") };
const nOf = (html: string, id: string) => scanElements(html).find((e) => e.attrs.some((a) => a.name === "id" && a.value === id))!.n;
const order = (html: string) => sections(html).map((s) => s.label);

describe("sections a person can move, copy and remove (ADR 0159)", () => {
  it("lists main's sections by their headings", () => {
    expect(order(PAGE)).toEqual(["Bread worth getting up for.", "Slow dough", "Come by"]);
  });

  it("moves a section up, down and to the end, leaving the rest of the page byte for byte", () => {
    const up = applyVisualEdit(files, "index.html", nOf(PAGE, "visit"), { kind: "move", before: nOf(PAGE, "top") });
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    const html = up.files["index.html"]!;
    expect(order(html)).toEqual(["Come by", "Bread worth getting up for.", "Slow dough"]);
    expect(html.length).toBe(PAGE.length);
    expect(scanElements(html)[up.select!]!.attrs.find((a) => a.name === "id")?.value).toBe("visit");
    const back = applyVisualEdit(up.files, "index.html", nOf(html, "visit"), { kind: "move", before: null });
    expect(back.ok && back.files["index.html"]).toBe(PAGE);
  });

  it("copies a section with its ids made unique, and its labels following", () => {
    const r = applyVisualEdit(files, "index.html", nOf(PAGE, "story"), { kind: "duplicate" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const html = r.files["index.html"]!;
    expect(order(html)).toEqual(["Bread worth getting up for.", "Slow dough", "Slow dough", "Come by"]);
    expect(html).toContain('id="story-2" aria-labelledby="story-title-2"');
    expect(html).toContain('<h2 id="story-title-2">');
    expect(scanElements(html)[r.select!]!.attrs.find((a) => a.name === "id")?.value).toBe("story-2");
  });

  it("removes a section but never the last one, and refuses what isn't a section", () => {
    const r = applyVisualEdit(files, "index.html", nOf(PAGE, "story"), { kind: "remove" });
    expect(r.ok && order(r.files["index.html"]!)).toEqual(["Bread worth getting up for.", "Come by"]);
    const h1 = scanElements(PAGE).find((e) => e.tag === "h1")!.n;
    expect(applyVisualEdit(files, "index.html", h1, { kind: "remove" })).toMatchObject({ ok: false });
    expect(applyVisualEdit(files, "index.html", h1, { kind: "move", before: null })).toMatchObject({ ok: false });
    const body = scanElements(PAGE).find((e) => e.tag === "body")!.n;
    expect(applyVisualEdit(files, "index.html", nOf(PAGE, "story"), { kind: "move", before: body })).toMatchObject({ ok: false });
  });

  it("adds Farbaek's own sections only, each one passing the site review apart from what the person fills in", () => {
    const main = scanElements(PAGE).find((e) => e.tag === "main")!.n;
    expect(applyVisualEdit(files, "index.html", main, { kind: "insert", snippet: "<script>alert(1)</script>" })).toMatchObject({ ok: false });
    for (const id of Object.keys(SNIPPETS)) {
      const r = applyVisualEdit(files, "index.html", nOf(PAGE, "story"), { kind: "insert", snippet: id });
      expect(r.ok, id).toBe(true);
      if (!r.ok) continue;
      const html = r.files["index.html"]!;
      expect(sections(html), id).toHaveLength(4);
      expect(sections(html)[2]!.n, id).toBe(r.select);
      if (SNIPPETS[id as keyof typeof SNIPPETS].pro) expect(html, id).toContain(STUDIO_KIT_PRO_CSS);
      const findings = reviewSite({ ...r.files, "about.html": r.files["about.html"]! }).findings.filter(
        (f) => !/placeholder|no 3D moment|Only system fonts|no images/.test(f.message),
      );
      expect(findings, id).toEqual([]);
    }
    const atEnd = applyVisualEdit(files, "index.html", main, { kind: "insert", snippet: "cta" });
    expect(atEnd.ok && sections(atEnd.files["index.html"]!).at(-1)!.n).toBe(atEnd.ok ? atEnd.select : -1);
  });
});

describe("button labels and responsive text sizes", () => {
  it("edits the label beside the kit's arrow and keeps the arrow", () => {
    const btn = scanElements(PAGE).find((e) => e.tag === "a")!;
    expect(labelText(PAGE, btn)).toBe("See today's bakes");
    const r = applyVisualEdit(files, "index.html", btn.n, { kind: "label", text: "Order <now> & collect" });
    expect(r.ok && r.files["index.html"]).toContain('<a class="fs-btn" href="#visit">Order &lt;now&gt; &amp; collect <span class="fs-btn__icon" aria-hidden="true"></span></a>');
    const h1 = scanElements(PAGE).find((e) => e.tag === "h1")!;
    expect(labelText(PAGE, h1)).toBeNull();
  });

  it("accepts the size presets that scale with the screen, and nothing else new", () => {
    for (const s of Object.values(TEXT_SIZES)) expect(checkStyleValue("font-size", s.value)).toBe(s.value);
    expect(checkStyleValue("font-size", "clamp(1px, 99vw, 999px)")).toBeNull();
  });
});

describe("the site's theme (ADR 0159)", () => {
  it("sets the look on every page and the colours in :root, keeping its comments and the rest", () => {
    const r = applyVisualEdit(files, "index.html", 0, { kind: "theme", look: "noir", tokens: { accent: "#E0912F", paper: "#0b0b0d" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.files["index.html"]).toContain('data-fs-look="noir"');
    expect(r.files["about.html"]).toContain('data-fs-look="noir"');
    expect(r.files["styles.css"]).toBe(`/* Kiln & Crumb */
:root {
  /* The brand. */
  --accent: #e0912f;
  --ink: #17231c;
  --paper: #0b0b0d;
}

.hero { color: #fff; }
`);
  });

  it("lets a new look show through by clearing the site's own colour overrides, and nothing else", () => {
    const r = applyVisualEdit(files, "index.html", 0, { kind: "theme", look: "bloom" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.files["styles.css"]).toBe(`/* Kiln & Crumb */
:root {
  /* The brand. */
}

.hero { color: #fff; }
`);
    const withFonts = { ...files, "styles.css": CSS.replace("--ink: #17231c;", "--ink: #17231c;\n  --font-display: \"Young Serif\", Georgia, serif;") };
    const kept = applyVisualEdit(withFonts, "index.html", 0, { kind: "theme", look: "noir" });
    expect(kept.ok && kept.files["styles.css"]).toContain('--font-display: "Young Serif"');
  });

  it("swaps the font pairing in the link on every page and in the tokens, and sets corners", () => {
    const r = applyVisualEdit(files, "index.html", 0, { kind: "theme", fonts: "luxury", corners: "sharp" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.files["about.html"]).toContain("family=Cormorant+Garamond");
    expect(r.files["index.html"]).not.toContain("family=Young+Serif");
    expect(r.files["styles.css"]).toContain('--font-display: "Cormorant Garamond", Georgia, serif;');
    expect(r.files["styles.css"]).toContain("--radius: 4px;");
  });

  it("refuses what Studio doesn't offer, and sites not on the kit", () => {
    for (const bad of [{ look: "neon" }, { tokens: { accent: "red" } }, { tokens: { "font-display": "#000000" } }, { fonts: "comic" }, { corners: "wavy" }, {}]) {
      expect(applyVisualEdit(files, "index.html", 0, { kind: "theme", ...bad } as never), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
    const plain = { "index.html": "<!doctype html><html><body><main><section><h1>Hi</h1></section></main></body></html>" };
    expect(applyVisualEdit(plain, "index.html", 0, { kind: "theme", look: "signal" })).toMatchObject({ ok: false, reason: expect.stringMatching(/Upgrade its design/) });
  });

  it("adds a :root rule when a stylesheet has none, and measures contrast", () => {
    expect(upsertCustomProps("body { margin: 0 }\n", [["--accent", "#000000"]])).toBe("body { margin: 0 }\n\n:root {\n  --accent: #000000;\n}\n");
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#777777", "#888888")).toBeLessThan(1.5);
  });
});

describe("the preview's side and the theme reader", () => {
  it("ships a design script that parses, with the toolbar's buttons and no filters", () => {
    const body = /<script>([\s\S]*)<\/script>/.exec(DESIGN_SCRIPT)![1]!;
    expect(() => new Function(body)).not.toThrow();
    for (const label of ["Drag to move this section", "Move up", "Move down", "Duplicate", "Delete"]) expect(DESIGN_SCRIPT).toContain(label);
    expect(DESIGN_SCRIPT).not.toMatch(/(?<![-\w])filter\s*:/);
    expect(DESIGN_SCRIPT).not.toMatch(/eval\(|innerHTML\s*=\s*d\./);
  });

  it("reads the look, colours, fonts and corners a site has now", () => {
    const r = applyVisualEdit(files, "index.html", 0, { kind: "theme", fonts: "editorial", corners: "round" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(readTheme(r.files)).toEqual({ look: "signal", tokens: { accent: "#c76a1c", ink: "#17231c" }, fonts: "editorial", corners: "round" });
    expect(readTheme({})).toEqual({ look: null, tokens: {}, fonts: null, corners: null });
  });

  it("has a swatch for every look", () => {
    expect(Object.keys(LOOK_SWATCHES).sort()).toEqual([...LIGHT_LOOKS, ...DARK_LOOKS].sort());
    for (const s of Object.values(LOOK_SWATCHES)) expect(contrastRatio(s.ink, s.paper), s.label).toBeGreaterThanOrEqual(4.5);
  });
});

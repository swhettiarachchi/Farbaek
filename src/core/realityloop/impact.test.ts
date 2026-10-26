import { describe, expect, it } from "vitest";
import { DEMO_FILES } from "@/content/demo-files";
import { aliasesFrom, analyzeImpact, htmlReferences, importSpecifiers, isPage, resolveSpecifier } from "./impact";

const map = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe("reading imports", () => {
  it("finds every literal import form, and skips commented ones", () => {
    const code = [
      `import a from "./a";`,
      `import type { B } from "./b";`,
      `import "./side-effect.css";`,
      `export { c } from "../c";`,
      `export * from "@/d";`,
      `const e = await import("./e");`,
      `const f = require('./f');`,
      `// import g from "./g";`,
      `/* import h from "./h"; */`,
      `const url = "https://example.com/x"; // a comment`,
      "const name = `./dynamic/${x}`; import(name);",
    ].join("\n");
    expect(importSpecifiers(code).sort()).toEqual(["../c", "./a", "./b", "./e", "./f", "./side-effect.css", "@/d"]);
  });

  it("reads the scripts and stylesheets an HTML page loads, not other sites'", () => {
    const html = `<link rel="stylesheet" href="styles.css"><script src="/app.js" defer></script><script src="https://cdn.example.com/x.js"></script>`;
    expect(htmlReferences(html)).toEqual(["/app.js", "styles.css"]);
  });
});

describe("resolving imports", () => {
  const files = new Set(["src/lib/cart.ts", "src/lib/index.ts", "src/app/page.tsx", "src/util.js", "data/prices.json"]);

  it("follows relative paths, extensions, index files and project aliases, and ignores packages", () => {
    const aliases = [{ prefix: "@/", target: "src/" }];
    expect(resolveSpecifier("src/app/page.tsx", "../lib/cart", files, aliases)).toBe("src/lib/cart.ts");
    expect(resolveSpecifier("src/app/page.tsx", "../lib", files, aliases)).toBe("src/lib/index.ts");
    expect(resolveSpecifier("src/app/page.tsx", "@/lib/cart", files, aliases)).toBe("src/lib/cart.ts");
    expect(resolveSpecifier("src/app/page.tsx", "../lib/cart.js", files, aliases)).toBe("src/lib/cart.ts");
    expect(resolveSpecifier("src/app/page.tsx", "../../data/prices.json", files, aliases)).toBe("data/prices.json");
    expect(resolveSpecifier("src/app/page.tsx", "react", files, aliases)).toBeNull();
    expect(resolveSpecifier("src/app/page.tsx", "../../../outside", files, aliases)).toBeNull();
  });

  it("reads aliases from tsconfig, with comments, and otherwise assumes @/ means src/", () => {
    const tsconfig = `{
      // comment
      "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["./app/*"], }, },
    }`;
    expect(aliasesFrom(map({ "tsconfig.json": tsconfig }))).toEqual({ aliases: [{ prefix: "~/", target: "app/" }], assumed: false });
    expect(aliasesFrom(map({ "src/a.ts": "" }))).toEqual({ aliases: [{ prefix: "@/", target: "src/" }], assumed: true });
    expect(aliasesFrom(map({ "index.html": "" }))).toEqual({ aliases: [], assumed: false });
  });

  it("knows pages", () => {
    expect(["app/page.tsx", "src/app/shop/[id]/page.tsx", "app/layout.tsx", "pages/about.tsx", "index.html"].every(isPage)).toBe(true);
    expect(["pages/api/x.ts", "app/components/card.tsx"].some(isPage)).toBe(false);
  });
});

describe("what a change reaches", () => {
  it("in the demo project: a change to the cart reaches its card, its test and the home page", () => {
    const files = new Map(DEMO_FILES.map((f) => [f.path, f.content]));
    const r = analyzeImpact(["src/lib/cart.ts"], files);
    expect(r.direct.map((d) => d.path).sort()).toEqual(["src/components/product-card.tsx", "src/lib/cart.test.ts"]);
    expect(r.further).toEqual([{ path: "src/app/page.tsx", via: "src/components/product-card.tsx", depth: 2 }]);
    expect(r.pages).toEqual(["src/app/page.tsx"]);
    expect(r.tests).toEqual(["src/lib/cart.test.ts"]);
    expect(r.untested).toEqual([]);
    expect(r.changed).toEqual([{ path: "src/lib/cart.ts", importers: 2, tested: true }]);
    expect(r.alias).toEqual({ prefix: "@/", target: "src/", assumed: true });
  });

  it("says which changed files no test reaches, and stops at the depth asked", () => {
    const files = map({
      "a.ts": "",
      "b.ts": `import "./a";`,
      "c.ts": `import "./b";`,
      "d.ts": `import "./c";`,
      "e.ts": `import "./d";`,
      "other.ts": "",
      "other.test.ts": `import "./other";`,
    });
    const r = analyzeImpact(["a.ts", "other.ts"], files);
    expect(r.direct.map((d) => d.path).sort()).toEqual(["b.ts", "other.test.ts"]);
    expect(r.further.map((d) => [d.path, d.depth])).toEqual([
      ["c.ts", 2],
      ["d.ts", 3],
    ]);
    expect(r.untested).toEqual(["a.ts"]);
  });

  it("follows a static site's pages to their scripts and styles", () => {
    const files = map({ "index.html": `<link rel="stylesheet" href="styles.css"><script src="app.js"></script>`, "app.js": `import "./util.js";`, "util.js": "", "styles.css": "" });
    expect(analyzeImpact(["util.js"], files).pages).toEqual(["index.html"]);
    expect(analyzeImpact(["styles.css"], files)).toMatchObject({ pages: ["index.html"], untested: [] });
  });
});

import { describe, expect, it } from "vitest";
import { inertPackageJson, isStaticSite, needsPackageJson } from "./static-site";

describe("a package.json that leaves a site static", () => {
  it("is inert with only a name and a version, or a test script", () => {
    expect(inertPackageJson('{ "name": "tip-calculator", "version": "1.0.0" }')).toBe(true);
    expect(inertPackageJson('{ "name": "x", "scripts": { "test": "node test.js" } }')).toBe(true);
    expect(inertPackageJson('{ "name": "x", "dependencies": {} }')).toBe(true);
  });

  it("isn't inert with anything to install, build or run", () => {
    expect(inertPackageJson('{ "dependencies": { "express": "5.1.0" } }')).toBe(false);
    expect(inertPackageJson('{ "devDependencies": { "vite": "7.0.0" } }')).toBe(false);
    for (const s of ["build", "start", "dev", "serve", "preview", "postinstall", "prepare"]) {
      expect(inertPackageJson(JSON.stringify({ scripts: { [s]: "x" } })), s).toBe(false);
    }
    expect(inertPackageJson('{ "workspaces": ["packages/*"] }')).toBe(false);
  });

  it("isn't inert when it can't be read", () => {
    expect(inertPackageJson(undefined)).toBe(false);
    expect(inertPackageJson(null)).toBe(false);
    expect(inertPackageJson("{ not json")).toBe(false);
    expect(inertPackageJson("[]")).toBe(false);
  });

  it("makes index.html a static site only with no package.json or an inert one", () => {
    expect(isStaticSite(["index.html", "styles.css"])).toBe(true);
    expect(isStaticSite(["index.html", "package.json", "src/app.js"], '{ "name": "tip-calculator", "version": "1.0.0" }')).toBe(true);
    expect(isStaticSite(["index.html", "package.json"], '{ "scripts": { "start": "node server.js" } }')).toBe(false);
    expect(isStaticSite(["index.html", "package.json"])).toBe(false);
    expect(isStaticSite(["package.json"], '{ "name": "x" }')).toBe(false);
  });

  it("asks for package.json's text only when both files are there", () => {
    expect(needsPackageJson(["index.html", "package.json"])).toBe(true);
    expect(needsPackageJson(["index.html"])).toBe(false);
    expect(needsPackageJson(["package.json", "server.js"])).toBe(false);
  });
});

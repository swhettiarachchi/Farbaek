import { describe, expect, it } from "vitest";
import { appChecks, checksToRun, fallbackChecksWords } from "./app-check";

const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: "cafe", scripts });
const reading = (files: Record<string, string>) => (p: string) => files[p] ?? null;

describe("checksToRun", () => {
  it("runs the plan's checks when it has any, whatever the project", () => {
    expect(checksToRun(["pnpm test"], ["index.html"])).toEqual(["pnpm test"]);
    expect(checksToRun(["npm run lint"], ["package.json"], reading({ "package.json": pkg({ build: "next build" }) }))).toEqual(["npm run lint"]);
  });

  it("runs the site check for a static site with no checks", () => {
    expect(checksToRun([], ["index.html", "styles.css"])).toEqual(["farbaek check-site"]);
  });

  it("runs an app's own build and tests when its plan lists none", () => {
    const files = { "package.json": pkg({ dev: "next dev", build: "next build", test: "vitest run" }) };
    expect(checksToRun([], ["package.json", "package-lock.json", "app/page.tsx"], reading(files))).toEqual(["CI=1 npm run build", "CI=1 npm test"]);
    expect(checksToRun([], ["package.json", "pnpm-lock.yaml"], reading(files))).toEqual(["CI=1 corepack pnpm run build", "CI=1 corepack pnpm test"]);
  });

  it("has nothing to run when it can't read package.json", () => {
    expect(checksToRun([], ["package.json", "index.html"])).toEqual([]);
    expect(checksToRun([], ["package.json"], reading({ "package.json": "{ not json" }))).toEqual([]);
  });
});

describe("appChecks", () => {
  it("skips npm's placeholder test and tests that watch for changes", () => {
    expect(appChecks(["package.json"], reading({ "package.json": pkg({ build: "vite build", test: 'echo "Error: no test specified" && exit 1' }) }))).toEqual(["CI=1 npm run build"]);
    expect(appChecks(["package.json"], reading({ "package.json": pkg({ test: "jest --watch" }) }))).toEqual([]);
    expect(appChecks(["package.json"], reading({ "package.json": pkg({ test: "vitest" }) }))).toEqual(["CI=1 npm test"]);
  });

  it("has nothing to run for an app with neither a build nor tests", () => {
    expect(appChecks(["package.json"], reading({ "package.json": pkg({ start: "node server.js" }) }))).toEqual([]);
    expect(appChecks(["package.json"], reading({ "package.json": JSON.stringify({ name: "x" }) }))).toEqual([]);
  });

  it("checks that a Python project's files compile", () => {
    expect(appChecks(["main.py", "requirements.txt"], reading({}))).toEqual(["python3 -m compileall -q ."]);
    expect(appChecks(["notes.txt"], reading({}))).toEqual([]);
  });
});

describe("fallbackChecksWords", () => {
  it("says which fallback runs", () => {
    expect(fallbackChecksWords(["farbaek check-site"]).kind).toBe("site");
    expect(fallbackChecksWords(["CI=1 npm run build", "CI=1 npm test"]).text).toBe("The plan lists no checks, so Farbaek runs the app's own build and its tests.");
    expect(fallbackChecksWords(["CI=1 corepack pnpm run build"]).text).toBe("The plan lists no checks, so Farbaek runs the app's own build.");
    expect(fallbackChecksWords(["python3 -m compileall -q ."]).kind).toBe("python");
  });
});

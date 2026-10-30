import { describe, expect, it } from "vitest";
import { fixedVersion, lockfilePackages, osvFindings, osvQueries, pythonName, type OsvAdvisory } from "./osv";

const pkgLock = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "": { name: "shop", version: "1.0.0" },
    "node_modules/lodash": { version: "4.17.15" },
    "node_modules/@scope/ui": { version: "2.1.0" },
    "node_modules/a/node_modules/lodash": { version: "4.17.21" },
    "node_modules/local": { link: true },
    "node_modules/weird": { version: "file:../x" },
  },
});

describe("reading lockfiles", () => {
  it("reads exact versions from npm, pnpm, yarn, pip and poetry lockfiles, and nothing from ranges", () => {
    const files = [
      { path: "package-lock.json", content: pkgLock },
      { path: "web/pnpm-lock.yaml", content: "lockfileVersion: '9.0'\npackages:\n\n  '@babel/core@7.24.0':\n    resolution: {}\n  react@18.3.1(react-dom@18.3.1):\n    x: y\n  /left-pad@1.3.0:\n    x: y\n" },
      { path: "yarn.lock", content: '# yarn lockfile v1\n\n"minimist@^1.2.0", minimist@^1.2.5:\n  version "1.2.5"\n  resolved "x"\n\n"@types/node@*":\n  version "20.1.0"\n' },
      { path: "requirements.txt", content: "Django==4.2.1\nrequests>=2.0\nPillow[jpeg] == 9.0.0 ; python_version > '3'\n# flask==1.0\n" },
      { path: "poetry.lock", content: '[[package]]\nname = "Jinja2"\nversion = "3.1.2"\n\n[[package]]\nname = "urllib3"\nversion = "1.26.5"\n' },
      { path: "node_modules/x/package-lock.json", content: pkgLock },
    ];
    const r = lockfilePackages(files);
    expect(r.lockfiles).toEqual(["package-lock.json", "web/pnpm-lock.yaml", "yarn.lock", "requirements.txt", "poetry.lock"]);
    expect(r.packages.map((p) => `${p.ecosystem}:${p.name}@${p.version}`)).toEqual([
      "npm:lodash@4.17.15",
      "npm:@scope/ui@2.1.0",
      "npm:lodash@4.17.21",
      "npm:@babel/core@7.24.0",
      "npm:react@18.3.1",
      "npm:left-pad@1.3.0",
      "npm:minimist@1.2.5",
      "npm:@types/node@20.1.0",
      "PyPI:django@4.2.1",
      "PyPI:pillow@9.0.0",
      "PyPI:jinja2@3.1.2",
      "PyPI:urllib3@1.26.5",
    ]);
    expect(r.packages[0]!.file).toBe("package-lock.json");
    expect(pythonName("Zope.Interface__x")).toBe("zope-interface-x");
  });

  it("reads lockfile v1 and ignores a broken one", () => {
    const v1 = JSON.stringify({ lockfileVersion: 1, dependencies: { a: { version: "1.0.0", dependencies: { b: { version: "2.0.0" } } } } });
    expect(lockfilePackages([{ path: "package-lock.json", content: v1 }]).packages.map((p) => `${p.name}@${p.version}`)).toEqual(["a@1.0.0", "b@2.0.0"]);
    expect(lockfilePackages([{ path: "package-lock.json", content: "{oops" }])).toEqual({ packages: [], lockfiles: ["package-lock.json"], capped: false });
  });

  it("builds OSV.dev's batch query", () => {
    expect(osvQueries([{ ecosystem: "npm", name: "lodash", version: "4.17.15", file: "package-lock.json" }])).toEqual({ queries: [{ package: { name: "lodash", ecosystem: "npm" }, version: "4.17.15" }] });
  });
});

describe("findings", () => {
  const lodash = { ecosystem: "npm" as const, name: "lodash", version: "4.17.15", file: "package-lock.json" };
  const advisory: OsvAdvisory = {
    id: "GHSA-p6mc-m468-83gw",
    summary: "Prototype Pollution in lodash",
    severity: "HIGH",
    aliases: ["CVE-2020-8203"],
    affected: [
      { package: { name: "lodash-es", ecosystem: "npm" }, ranges: [{ events: [{ introduced: "3.7.0" }, { fixed: "4.17.20" }] }] },
      { package: { name: "lodash", ecosystem: "npm" }, ranges: [{ events: [{ introduced: "3.7.0" }, { fixed: "4.17.19" }] }] },
    ],
  };

  it("names the advisory, its severity and the version that fixes it", () => {
    expect(fixedVersion(advisory, lodash)).toBe("4.17.19");
    const [f] = osvFindings([{ pkg: lodash, ids: ["GHSA-p6mc-m468-83gw"] }], new Map([[advisory.id, advisory]]));
    expect(f).toMatchObject({
      rule: "GHSA-p6mc-m468-83gw",
      severity: "high",
      source: "dependencies",
      title: "lodash 4.17.15: Prototype Pollution in lodash",
      fix: "Update lodash to 4.17.19 or later, then refresh the lockfile.",
      file: "package-lock.json",
    });
    expect(f!.detail).toContain("CVE-2020-8203");
  });

  it("still counts an advisory whose details couldn't be fetched, most serious first", () => {
    const low: OsvAdvisory = { ...advisory, id: "GHSA-low", severity: "LOW" };
    const out = osvFindings([{ pkg: lodash, ids: ["GHSA-low", "GHSA-unknown", "GHSA-p6mc-m468-83gw"] }], new Map([[low.id, low], [advisory.id, advisory]]));
    expect(out.map((f) => [f.rule, f.severity])).toEqual([
      ["GHSA-p6mc-m468-83gw", "high"],
      ["GHSA-unknown", "medium"],
      ["GHSA-low", "low"],
    ]);
    expect(out[1]!.fix).toMatch(/No fixed version/);
  });
});

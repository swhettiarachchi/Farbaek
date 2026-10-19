import { describe, expect, it } from "vitest";
import { deploymentDigest, hasUnpublishedChanges, publishGate, siteNameFrom, siteNameProblem, type GateInput } from "./site";

describe("site names", () => {
  it("accept lowercase letters, numbers and single hyphens, and refuse the rest", () => {
    expect(siteNameProblem("sunrise-bakery")).toBeNull();
    expect(siteNameProblem("a1b")).toBeNull();
    expect(siteNameProblem("ab")).toBe("length");
    expect(siteNameProblem("x".repeat(41))).toBe("length");
    expect(siteNameProblem("Sunrise")).toBe("characters");
    expect(siteNameProblem("-bakery")).toBe("characters");
    expect(siteNameProblem("bakery-")).toBe("characters");
    expect(siteNameProblem("my--site")).toBe("characters");
    expect(siteNameProblem("my.site")).toBe("characters");
  });

  it("keep Farbaek's own names and the preview prefix", () => {
    expect(siteNameProblem("www")).toBe("reserved");
    expect(siteNameProblem("admin")).toBe("reserved");
    expect(siteNameProblem("p-abc")).toBe("reserved");
  });

  it("suggest a usable name from a project's name", () => {
    expect(siteNameFrom("Sunrise Bakery!")).toBe("sunrise-bakery");
    expect(siteNameFrom("Futuristic one-page site for Volt Ride")).toBe("volt-ride");
    expect(siteNameFrom("One-page site for Sunrise Bakery")).toBe("sunrise-bakery");
    expect(siteNameFrom("Landing page for my bakery")).toBe("bakery");
    expect(siteNameFrom("Portfolio")).toBe("portfolio");
    expect(siteNameFrom("Café Olé")).toBe("cafe-ole");
    expect(siteNameFrom("AB")).toBe("ab-site");
    expect(siteNameFrom("Admin")).toBe("site-admin");
    expect(siteNameFrom("!!!")).toBe("site-new");
    expect(siteNameProblem(siteNameFrom("x".repeat(80)))).toBeNull();
  });
});

describe("deploymentDigest", () => {
  it("doesn't depend on file order, and changes with any revision", async () => {
    const a = { path: "index.html", revision: 2, sha256: "a".repeat(64), size: 10 };
    const b = { path: "styles.css", revision: 1, sha256: "b".repeat(64), size: 20 };
    const one = await deploymentDigest("p1", [a, b]);
    expect(await deploymentDigest("p1", [b, a])).toBe(one);
    expect(await deploymentDigest("p1", [{ ...a, revision: 3 }, b])).not.toBe(one);
    expect(await deploymentDigest("p2", [a, b])).not.toBe(one);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(hasUnpublishedChanges(null, one)).toBe(false);
    expect(hasUnpublishedChanges(one, one)).toBe(false);
    expect(hasUnpublishedChanges("0".repeat(64), one)).toBe(true);
  });
});

describe("publishGate", () => {
  const ok: GateInput = {
    domain: "farbaek.si",
    profile: "static",
    paths: ["index.html", "styles.css"],
    filesChangedAt: "2026-10-19T10:00:00Z",
    check: { status: "done", startedAt: "2026-10-19T10:05:00Z", critical: 0 },
  };

  it("lets a static site through after a current check with nothing critical", () => {
    expect(publishGate(ok)).toBeNull();
  });

  it("names the first thing to fix", () => {
    expect(publishGate({ ...ok, domain: null })?.code).toBe("NO_DOMAIN");
    expect(publishGate({ ...ok, profile: "node" })?.code).toBe("NOT_STATIC");
    expect(publishGate({ ...ok, paths: ["about.html"] })?.code).toBe("NO_INDEX");
    expect(publishGate({ ...ok, check: null })?.code).toBe("NO_CHECK");
    expect(publishGate({ ...ok, check: { ...ok.check!, status: "failed" } })?.code).toBe("NO_CHECK");
    expect(publishGate({ ...ok, check: { ...ok.check!, status: "running" } })?.code).toBe("CHECK_RUNNING");
    expect(publishGate({ ...ok, filesChangedAt: "2026-10-19T10:06:00Z" })?.code).toBe("CHECK_STALE");
    expect(publishGate({ ...ok, check: { ...ok.check!, critical: 2 } })).toMatchObject({ code: "CRITICAL_FINDINGS", message: expect.stringContaining("2 critical problems") });
  });
});

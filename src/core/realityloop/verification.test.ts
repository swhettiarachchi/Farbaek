import { describe, expect, it } from "vitest";
import { autoVerifiedOutcome, verificationSetup, verificationState, VERIFICATION_RESULT_WORDS } from "./verification";

const none = () => null;

describe("verificationSetup", () => {
  it("installs with the project's own lockfile, never running lifecycle scripts", () => {
    expect(verificationSetup(["package.json", "package-lock.json"], () => "{}")).toEqual({ command: "npm ci --ignore-scripts", label: "Install packages with npm", network: true });
    expect(verificationSetup(["package.json", "pnpm-lock.yaml"], () => "{}")?.command).toBe("corepack pnpm install --frozen-lockfile --ignore-scripts");
    expect(verificationSetup(["package.json"], () => "{}")?.command).toBe("npm install --ignore-scripts");
    expect(verificationSetup(["requirements.txt", "app.py"], none)?.command).toBe("python3 -m pip install -r requirements.txt");
  });

  it("installs nothing for a project with no manifest, such as a static site", () => {
    expect(verificationSetup(["index.html", "styles.css", "scripts/check.mjs"], none)).toBeNull();
  });

  it("only reads manifests at the project's root", () => {
    expect(verificationSetup(["docs/package.json", "index.html"], none)).toBeNull();
  });
});

describe("verificationState", () => {
  const at = (iso: string) => new Date(iso);
  it("is running until the stale limit, then stale; finished attempts keep their status", () => {
    const v = { status: "running" as const, startedAt: "2026-10-23T10:00:00Z" };
    expect(verificationState(v, at("2026-10-23T10:19:59Z"))).toBe("running");
    expect(verificationState(v, at("2026-10-23T10:20:00Z"))).toBe("stale");
    expect(verificationState({ ...v, status: "done" }, at("2026-10-23T12:00:00Z"))).toBe("done");
    expect(verificationState({ ...v, status: "failed" }, at("2026-10-23T10:01:00Z"))).toBe("failed");
  });
});

describe("words", () => {
  it("names every result, and says what a run's automatic check found", () => {
    expect(Object.keys(VERIFICATION_RESULT_WORDS).sort()).toEqual(["failed", "partially_verified", "unverified", "verified"]);
    expect(autoVerifiedOutcome({ ok: true, result: "verified" })).toMatch(/checks passed: verified/);
    expect(autoVerifiedOutcome({ ok: true, result: "failed" })).toMatch(/autonomy is paused/);
    expect(autoVerifiedOutcome({ ok: true, result: "partially_verified" })).toMatch(/some of its checks failed, so autonomy is paused/);
    expect(autoVerifiedOutcome({ ok: false, reason: "The sandbox had stopped." })).toBe(
      "Finished. The change applied on its own, but its checks couldn't run (The sandbox had stopped). Run them from the task, or undo it there.",
    );
    for (const text of [...Object.values(VERIFICATION_RESULT_WORDS).flatMap((w) => [w.title, w.detail]), autoVerifiedOutcome({ ok: true, result: "unverified" })]) expect(text).not.toMatch(/—/);
  });
});

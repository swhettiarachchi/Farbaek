import { describe, expect, it } from "vitest";
import { linkWords, patternsFor, replayIncident, suggestPreventionRules, type IncidentChange } from "./incidents";

const change = (paths: string[], outcome: IncidentChange["outcome"] = "ALLOW_WITHIN_LIMITS"): IncidentChange => ({
  proposalId: "p1",
  taskId: "t1",
  at: "2026-10-24T09:00:00.000Z",
  files: paths.map((path) => ({ path, kind: "edit" as const })),
  outcome,
});

describe("prevention rules from an incident", () => {
  it("names the narrowest folder the files share, else each file's folder, else the files", () => {
    expect(patternsFor(["src/lib/cart.ts", "src/lib/price/round.ts"])).toEqual(["src/lib/"]);
    expect(patternsFor(["src/lib/cart.ts", "app/page.tsx"])).toEqual(["src/lib/", "app/"]);
    expect(patternsFor(["README.md", "app/page.tsx"])).toEqual(["README.md", "app/"]);
    expect(patternsFor([])).toEqual([]);
  });

  it("suggests holding the files for a person, or for an owner, citing the incident", () => {
    const rules = suggestPreventionRules([change(["src/lib/cart.ts"])], 7);
    expect(rules.map((r) => [r.effect, r.paths])).toEqual([
      ["person_approval", ["src/lib/"]],
      ["owner_approval", ["src/lib/"]],
    ]);
    expect(rules[0]!.reason).toContain("problem #7");
    expect(suggestPreventionRules([], 1)).toEqual([]);
  });
});

describe("the replay", () => {
  it("shows that a person rule would have stopped a change that applied on its own", () => {
    const changes = [change(["src/lib/cart.ts"])];
    const [step] = replayIncident(changes, suggestPreventionRules(changes, 3));
    expect(step).toMatchObject({
      then: "own",
      withRule: [
        { effect: "person_approval", outcome: "person", stricter: true },
        { effect: "owner_approval", outcome: "owner", stricter: true },
      ],
    });
  });

  it("never makes a change looser, and leaves changes to other files alone", () => {
    const [stopped] = replayIncident([change(["src/lib/cart.ts"], "BLOCK")], [{ effect: "person_approval", paths: ["src/lib/"], reason: "x" }]);
    expect(stopped!.withRule[0]).toMatchObject({ outcome: "stopped", stricter: false });
    const [other] = replayIncident([change(["app/page.tsx"])], [{ effect: "owner_approval", paths: ["src/lib/"], reason: "x" }]);
    expect(other!.withRule[0]).toMatchObject({ outcome: "own", stricter: false });
  });

  it("says when the link is only timing", () => {
    expect(linkWords(true, 24)).toBe("The change this problem is about.");
    expect(linkWords(false, 24)).toContain("can't tell which, if any, caused it");
  });
});

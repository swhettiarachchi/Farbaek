import { describe, expect, it } from "vitest";
import { heldSkillsNote, skillPinStatus, splitByPins } from "./skill-pins";

const H = (c: string) => c.repeat(64);

describe("skillPinStatus", () => {
  it("is approved only for the pinned bytes", () => {
    expect(skillPinStatus({ sha256: H("a") }, { revision: 2, sha256: H("a") })).toBe("approved");
    expect(skillPinStatus({ sha256: H("b") }, { revision: 2, sha256: H("a") })).toBe("changed");
    expect(skillPinStatus({ sha256: H("a") }, undefined)).toBe("new");
  });
});

describe("splitByPins", () => {
  const files = [
    { path: "src/app.ts", sha256: H("1") },
    { path: ".farbaek/skills/house-style/SKILL.md", sha256: H("2") },
    { path: ".claude/skills/brand/SKILL.md", sha256: H("3") },
    { path: ".claude/skills/planted/SKILL.md", sha256: H("4") },
    // Not a skill path, so it's an ordinary file whatever its name.
    { path: "docs/skills/notes/SKILL.md", sha256: H("5") },
  ];
  const pins = new Map([
    [".farbaek/skills/house-style/SKILL.md", { revision: 3, sha256: H("2") }],
    [".claude/skills/brand/SKILL.md", { revision: 1, sha256: H("0") }],
  ]);

  it("keeps ordinary files and approved skills, and holds new or changed skills", () => {
    const { use, held } = splitByPins(files, pins);
    expect(use.map((f) => f.path)).toEqual(["src/app.ts", ".farbaek/skills/house-style/SKILL.md", "docs/skills/notes/SKILL.md"]);
    expect(held).toEqual([
      { path: ".claude/skills/brand/SKILL.md", status: "changed" },
      { path: ".claude/skills/planted/SKILL.md", status: "new" },
    ]);
  });

  it("says which skills were left out, and why", () => {
    expect(heldSkillsNote(splitByPins(files, pins).held)).toBe(
      "Left out until someone reviews them on the project page: brand (changed since it was approved), planted (new, not approved yet).",
    );
    expect(heldSkillsNote([])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { ReplayChange } from "./replay";
import { testRules } from "./rules-test";

let n = 0;
const change = (path: string, over: Partial<ReplayChange> = {}): ReplayChange => ({
  proposalId: `p${++n}`,
  taskId: `t${n}`,
  createdAt: "2026-10-20T09:00:00.000Z",
  status: "applied",
  files: [{ path, kind: "edit" }],
  violations: 0,
  fromAgent: false,
  hasChecks: true,
  evidence: "verified",
  ...over,
});
const set = (version: number, rules: { paths: string[]; effect: "block" | "owner_approval" | "person_approval" }[]) => ({
  version,
  sha256: String(version).repeat(64).slice(0, 64),
  rules: rules.map((r, i) => ({ id: `r${i + 1}`, reason: "Because.", ...r })),
});
const base = { autonomy: null, sandboxConnected: true, days: 90, now: new Date("2026-10-25T00:00:00Z") };

describe("testing rules against past changes", () => {
  it("counts what each change would have needed, before and after", async () => {
    const changes = [change("src/billing/a.ts"), change("src/app/page.tsx"), change("db/x.sql")];
    const r = await testRules(changes, { ...base, current: null, draft: set(1, [{ paths: ["src/billing/"], effect: "block" }]) });
    expect(r.changes).toBe(3);
    expect(r.before).toEqual({ stopped: 0, owner: 1, person: 2, own: 0 });
    expect(r.after).toEqual({ stopped: 1, owner: 1, person: 1, own: 0 });
    expect(r).toMatchObject({ stricter: 1, looser: 0, days: 90, testedAt: "2026-10-25T00:00:00.000Z" });
    expect(r.changed).toEqual([expect.objectContaining({ from: "person", to: "stopped", paths: ["src/billing/a.ts"], rules: ["r1"] })]);
  });

  it("counts a draft that drops today's rule as looser", async () => {
    const current = set(2, [{ paths: ["docs/"], effect: "owner_approval" }]);
    const r = await testRules([change("docs/a.md")], { ...base, current, draft: set(3, []) });
    expect(r).toMatchObject({ stricter: 0, looser: 1 });
    expect(r.changed[0]).toMatchObject({ from: "owner", to: "person", rules: ["r1"] });
  });

  it("uses today's level 2, which never applies the desktop agent's changes", async () => {
    const autonomy = { level: 2 as const, maxFiles: 3, allowCreates: false };
    const r = await testRules([change("docs/a.md"), change("docs/b.md", { fromAgent: true })], {
      ...base,
      autonomy,
      current: null,
      draft: set(1, [{ paths: ["docs/"], effect: "person_approval" }]),
    });
    expect(r.before).toMatchObject({ own: 1, person: 1 });
    expect(r.after).toMatchObject({ own: 0, person: 2 });
    const rehearsing = await testRules([change("docs/a.md")], { ...base, autonomy: { ...autonomy, rehearsal: true }, current: null, draft: set(1, []) });
    expect(rehearsing.before.own).toBe(0);
  });

  it("lists at most ten changes but counts them all", async () => {
    const changes = Array.from({ length: 14 }, (_, i) => change(`src/billing/${i}.ts`));
    const r = await testRules(changes, { ...base, current: null, draft: set(1, [{ paths: ["src/billing/"], effect: "block" }]) });
    expect(r.stricter).toBe(14);
    expect(r.changed).toHaveLength(10);
  });
});

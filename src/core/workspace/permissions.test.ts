import { describe, expect, it } from "vitest";
import { PERMISSIONS, may, parsePermissions, roleAllows, withheldList, withheldReason, withheldSummary } from "./permissions";

describe("permissions", () => {
  it("keeps only known permissions that are turned off", () => {
    expect(parsePermissions({ approve: false, publish: true, deploy: false, run_agents: "false" })).toEqual({ approve: false });
    expect(parsePermissions(null)).toEqual({});
    expect(parsePermissions(["approve"])).toEqual({});
  });

  it("follows the database: owners and admins have all, members all but what's off, viewers none", () => {
    for (const p of PERMISSIONS) {
      expect(may("owner", { [p]: false }, p)).toBe(true);
      expect(may("admin", { [p]: false }, p)).toBe(true);
      expect(may("member", {}, p)).toBe(true);
      expect(may("member", { [p]: false }, p)).toBe(false);
      expect(may("viewer", {}, p)).toBe(false);
      expect(may(null, {}, p)).toBe(false);
    }
    expect(may("member", { publish: false }, "approve")).toBe(true);
  });

  it("says what's off, in words", () => {
    expect(withheldList({ run_agents: false, approve: false })).toEqual(["approve", "run_agents"]);
    expect(withheldSummary({})).toBeNull();
    expect(withheldSummary({ publish: false })).toBe("Can't publish or launch.");
    expect(withheldSummary({ run_agents: false, approve: false })).toBe("Can't approve changes. Can't start agent runs.");
    expect(withheldReason("approve")).toBe("An owner or admin turned off approving changes for you in this workspace.");
    expect(roleAllows("admin")).toMatch(/Approves changes, publishes and launches, and starts agent runs/);
    expect(roleAllows("viewer")).toBe("Reads everything, changes nothing.");
  });
});

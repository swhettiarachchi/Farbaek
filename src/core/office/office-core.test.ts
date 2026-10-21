import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/core/trust/canonical-json";
import { GENESIS_HASH, verifyStaffAuditChain, type ChainRow } from "./audit-chain";
import { OFFICE_ACTIONS, STAFF_ROLES, can, maskEmail, needsStepUp, usageCap, USAGE_STEP_UP_UNITS } from "./permissions";
import { firstFactorAt, lastTotpAt, parseAmr, tokenVerdict } from "./session-policy";

describe("permissions", () => {
  it("deny by default and give every action to the owner", () => {
    for (const action of OFFICE_ACTIONS) expect(can("owner", action), action).toBe(true);
    expect(can(null, "console.read")).toBe(false);
    expect(can("root" as never, "console.read")).toBe(false);
    expect(can("viewer", "staff.manage")).toBe(false);
    expect(can("admin", "flags.set")).toBe(false);
    expect(can("support", "site.block")).toBe(false);
    for (const role of STAFF_ROLES) expect(can(role, "console.read")).toBe(true);
  });

  it("ask for a fresh code on staff changes, switches and large usage additions", () => {
    expect(needsStepUp("staff.manage")).toBe(true);
    expect(needsStepUp("flags.set")).toBe(true);
    expect(needsStepUp("usage.add", { units: USAGE_STEP_UP_UNITS })).toBe(false);
    expect(needsStepUp("usage.add", { units: USAGE_STEP_UP_UNITS + 1 })).toBe(true);
    expect(needsStepUp("workspace.suspend")).toBe(false);
    expect(usageCap("owner")).toBeGreaterThan(usageCap("admin"));
    expect(usageCap("support")).toBe(0);
  });

  it("mask emails so they can be recognised but not copied", () => {
    expect(maskEmail("jonathan@example.com")).toBe("jo•••@example.com");
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
    expect(maskEmail("nope")).toBe("•••");
  });
});

describe("session policy", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const at = (h: number) => Math.floor(now.getTime() / 1000) - h * 3600;

  it("reads both amr formats and tells the first factor from the authenticator", () => {
    const amr = [
      { method: "totp", timestamp: at(0.1) },
      { method: "otp", timestamp: at(2) },
    ];
    expect(parseAmr(amr)).toHaveLength(2);
    expect(parseAmr(["otp", "totp"])).toEqual([
      { method: "otp", timestamp: null },
      { method: "totp", timestamp: null },
    ]);
    expect(parseAmr("otp")).toEqual([]);
    expect(firstFactorAt(amr)?.getTime()).toBe(at(2) * 1000);
    expect(lastTotpAt(amr)?.getTime()).toBe(at(0.1) * 1000);
    expect(firstFactorAt(["otp"])).toBeNull();
  });

  it("needs aal2, a first factor with a time, and no more than 12 hours since it", () => {
    const amr = [{ method: "totp", timestamp: at(1) }, { method: "otp", timestamp: at(2) }];
    expect(tokenVerdict({ aal: "aal2", amr }, now)).toMatchObject({ ok: true });
    expect(tokenVerdict({ aal: "aal1", amr: [{ method: "otp", timestamp: at(0) }] }, now)).toEqual({ ok: false, reason: "verify" });
    expect(tokenVerdict({ aal: "aal2", amr: [{ method: "otp", timestamp: at(13) }] }, now)).toEqual({ ok: false, reason: "expired" });
    expect(tokenVerdict({ aal: "aal2", amr: ["otp", "totp"] }, now)).toEqual({ ok: false, reason: "sign_in" });
    expect(tokenVerdict(null, now)).toEqual({ ok: false, reason: "sign_in" });
  });
});

describe("audit chain", () => {
  async function chain(n: number): Promise<ChainRow[]> {
    const rows: ChainRow[] = [];
    let prev = GENESIS_HASH;
    for (let seq = 1; seq <= n; seq++) {
      const envelope = JSON.stringify({ v: 1, seq, action: "auth.signed_in", result: "success", target_type: "staff", target_id: `u${seq}` });
      const row_hash = await sha256Hex(prev + envelope);
      rows.push({ seq, prev_hash: prev, envelope, row_hash, action: "auth.signed_in", result: "success", target_type: "staff", target_id: `u${seq}` });
      prev = row_hash;
    }
    return rows;
  }

  it("accepts an intact chain, from the start or from a known row", async () => {
    const rows = await chain(5);
    expect(await verifyStaffAuditChain(rows)).toEqual({ ok: true, checked: 5, throughSeq: 5, headHash: rows[4]!.row_hash });
    expect(await verifyStaffAuditChain(rows.slice(2), rows[1]!)).toMatchObject({ ok: true, checked: 3 });
    expect(await verifyStaffAuditChain([])).toEqual({ ok: true, checked: 0, throughSeq: 0, headHash: GENESIS_HASH });
  });

  it("finds an edited envelope, a missing row, a reorder and columns that disagree", async () => {
    const rows = await chain(4);
    expect(await verifyStaffAuditChain(rows.map((r, i) => (i === 1 ? { ...r, envelope: r.envelope.replace("u2", "u9") } : r)))).toMatchObject({ ok: false, firstBadSeq: 2 });
    expect(await verifyStaffAuditChain([rows[0]!, rows[2]!, rows[3]!])).toMatchObject({ ok: false, firstBadSeq: 3 });
    expect(await verifyStaffAuditChain([rows[1]!, rows[0]!])).toMatchObject({ ok: false, firstBadSeq: 2 });
    expect(await verifyStaffAuditChain(rows.map((r, i) => (i === 2 ? { ...r, action: "staff.removed" } : r)))).toMatchObject({ ok: false, firstBadSeq: 3 });
  });
});

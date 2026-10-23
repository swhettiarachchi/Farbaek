import { describe, expect, it } from "vitest";
import { EVIDENCE_WORDS, evidenceFromPacks, launchEvidence, overrideReasonProblem, verifiedChange, type EvidencePack } from "./evidence";

const pack = (digest: string, status: EvidencePack["status"], createdAt: string, verifies: string | null = null, taskId = "t1"): EvidencePack => ({ digest, status, createdAt, taskId, verifies });
const T0 = "2026-10-23T10:00:00.000Z";
const T1 = "2026-10-23T10:05:00.000Z";
const T2 = "2026-10-23T10:09:00.000Z";

describe("launchEvidence", () => {
  it("is none without a change ProofPack", () => {
    expect(launchEvidence({ change: null, verification: null, filesChangedAt: T0 })).toEqual({ status: "none", proofPack: null, taskId: null });
  });

  it("is verified by a passing check run of the latest change, and names that run", () => {
    const change = pack("c", "unverified", T0);
    expect(launchEvidence({ change, verification: pack("v", "verified", T1, "c"), filesChangedAt: T0 })).toEqual({ status: "verified", proofPack: "v", taskId: "t1" });
  });

  it("takes the check run's result, or the change's own status when nothing ran", () => {
    const change = pack("c", "unverified", T0);
    expect(launchEvidence({ change, verification: pack("v", "failed", T1, "c"), filesChangedAt: T0 }).status).toBe("failed");
    expect(launchEvidence({ change, verification: pack("v", "partially_verified", T1, "c"), filesChangedAt: T0 }).status).toBe("partially_verified");
    expect(launchEvidence({ change, verification: null, filesChangedAt: T0 })).toEqual({ status: "unverified", proofPack: "c", taskId: "t1" });
  });

  it("is changed when a file changed after the change was applied, even if it was verified", () => {
    const change = pack("c", "unverified", T0);
    expect(launchEvidence({ change, verification: pack("v", "verified", T1, "c"), filesChangedAt: T2 })).toEqual({ status: "changed", proofPack: "c", taskId: "t1" });
  });

  it("ignores a check run of a different change", () => {
    const change = pack("c2", "unverified", T1);
    expect(launchEvidence({ change, verification: pack("v", "verified", T2, "c1"), filesChangedAt: T1 }).status).toBe("unverified");
  });
});

describe("evidenceFromPacks", () => {
  it("goes by the latest applied change, not the newest ProofPack", () => {
    // Newest first: the first change's check run landed after the second change.
    const packs = [pack("v1", "verified", T2, "c1"), pack("c2", "unverified", T1, null, "t2"), pack("c1", "unverified", T0)];
    expect(evidenceFromPacks(packs, T1)).toEqual({ status: "unverified", proofPack: "c2", taskId: "t2" });
  });

  it("uses the latest check run of that change", () => {
    const packs = [pack("v2", "verified", T2, "c"), pack("v1", "failed", T1, "c"), pack("c", "unverified", T0)];
    expect(evidenceFromPacks(packs, T0)).toEqual({ status: "verified", proofPack: "v2", taskId: "t1" });
    expect(evidenceFromPacks([], null).status).toBe("none");
  });
});

describe("verifiedChange", () => {
  it("reads the change a check run verified, and nothing else", () => {
    expect(verifiedChange({ predicate: { verification: { appliedProofPack: "c" } } })).toBe("c");
    expect(verifiedChange({ predicate: { status: "unverified" } })).toBeNull();
    expect(verifiedChange(null)).toBeNull();
    expect(verifiedChange({ predicate: { verification: { appliedProofPack: 7 } } })).toBeNull();
  });
});

describe("overrideReasonProblem", () => {
  it("needs 10 to 500 characters once trimmed", () => {
    expect(overrideReasonProblem("   too short   ")).toMatch(/at least 10/);
    expect(overrideReasonProblem("Hand-made page, reviewed by me.")).toBeNull();
    expect(overrideReasonProblem("x".repeat(500))).toBeNull();
    expect(overrideReasonProblem("x".repeat(501))).toMatch(/500/);
  });

  it("has words for every state, with no em dashes", () => {
    for (const w of Object.values(EVIDENCE_WORDS)) {
      expect(w.title.length).toBeGreaterThan(0);
      expect(`${w.title} ${w.detail}`).not.toMatch(/—/);
    }
  });
});

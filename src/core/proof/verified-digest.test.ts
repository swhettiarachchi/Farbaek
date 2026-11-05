import { describe, expect, it } from "vitest";
import { canonicalHash } from "@/core/trust/canonical-json";
import { verifiedSeal } from "./verified-digest";

const statement = { predicate: { appliedChange: { matched: true } } };

describe("the Seal on a finished task (ADR 0172)", () => {
  it("takes a verified receipt that ran against the applied files, and says what it is", async () => {
    const digest = await canonicalHash(statement);
    expect(await verifiedSeal([], [{ status: "verified", statement, digest }])).toEqual({ digest, caption: "Farbaek verified checks" });
  });

  it("draws none without verified evidence", async () => {
    const digest = await canonicalHash(statement);
    expect(await verifiedSeal([], [])).toBeNull();
    expect(await verifiedSeal([], [{ status: "failed", statement, digest }])).toBeNull();
  });

  it("draws none for a receipt whose contents changed, or that ran on other files", async () => {
    const digest = await canonicalHash(statement);
    expect(await verifiedSeal([], [{ status: "verified", statement: { predicate: { appliedChange: { matched: true }, tampered: true } }, digest }])).toBeNull();
    const elsewhere = { predicate: { appliedChange: { matched: false } } };
    expect(await verifiedSeal([], [{ status: "verified", statement: elsewhere, digest: await canonicalHash(elsewhere) }])).toBeNull();
  });

  it("lets the newest record decide: an older success can't stand in", async () => {
    const digest = await canonicalHash(statement);
    const good = { status: "verified", statement, digest };
    // A newer failed run.
    expect(await verifiedSeal([good], [{ status: "failed", statement, digest }, good])).toBeNull();
    // A damaged newest pack, with an intact receipt beside it.
    expect(await verifiedSeal([{ status: "verified", statement, digest: "0".repeat(64) }], [good])).toBeNull();
  });
});

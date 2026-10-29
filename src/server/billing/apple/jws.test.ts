import { describe, expect, it } from "vitest";
import type { AppleTransaction } from "@/core/billing/apple";
import fixtures from "./fixtures.json";
import { APPLE_ROOT_CA_G3_SHA256, AppleJwsError, verifyAppleJws } from "./jws";

const opts = { rootSha256: fixtures.rootSha256, now: new Date(fixtures.signedDate + 86_400_000) };

describe("Apple's signed records (ADR 0112)", () => {
  it("reads a record signed through the pinned chain", () => {
    const t = verifyAppleJws<AppleTransaction>(fixtures.transaction, opts);
    expect(t).toMatchObject({ productId: "com.farbaek.app.starter.monthly", appAccountToken: fixtures.org, environment: "Sandbox" });
    const n = verifyAppleJws<{ notificationType: string; data: { signedTransactionInfo: string } }>(fixtures.notification, opts);
    expect(n.notificationType).toBe("SUBSCRIBED");
    expect(verifyAppleJws<AppleTransaction>(n.data.signedTransactionInfo, opts).originalTransactionId).toBe("2000000999000001");
  });

  it("pins Apple's real root by default, so the stand-in chain is refused in production", () => {
    expect(APPLE_ROOT_CA_G3_SHA256).toBe("63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79");
    expect(() => verifyAppleJws(fixtures.transaction, { now: opts.now })).toThrow(/isn't signed by Apple/);
  });

  it("refuses a changed record, a broken chain, and anything that isn't one", () => {
    const [h, p, s] = fixtures.transaction.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), productId: "com.farbaek.app.pro.monthly" })).toString("base64url");
    expect(() => verifyAppleJws(`${h}.${forged}.${s}`, opts)).toThrow(/signature doesn't match/);
    expect(() => verifyAppleJws(fixtures.foreignRoot, opts)).toThrow(AppleJwsError);
    for (const bad of [null, 42, "", "a.b", "a.b.c", `${h}.${p}`, "x".repeat(70_000)]) expect(() => verifyAppleJws(bad, opts)).toThrow(AppleJwsError);
    const unsignedHeader = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    expect(() => verifyAppleJws(`${unsignedHeader}.${p}.${s}`, opts)).toThrow(/isn't signed the way Apple signs/);
  });
});

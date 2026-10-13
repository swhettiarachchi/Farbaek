import { describe, expect, it } from "vitest";
import { CanonicalizationError, canonicalHash, canonicalize, sha256Hex, shortHash } from "./canonical-json";

describe("canonicalize (RFC 8785)", () => {
  it("matches the RFC 8785 section 3.2.2 example", () => {
    const input = JSON.parse(
      '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/","literals":[null,true,false]}',
    );
    expect(canonicalize(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it("sorts keys by UTF-16 code units, recursively", () => {
    expect(canonicalize({ b: 1, a: { d: [3, { z: 0, y: 1 }], c: 2 } })).toBe('{"a":{"c":2,"d":[3,{"y":1,"z":0}]},"b":1}');
    // "€" (euro) sorts before "😀" (emoji) by code unit, and capitals before lowercase.
    expect(canonicalize({ "😀": 1, "€": 2, a: 3, B: 4 })).toBe('{"B":4,"a":3,"€":2,"😀":1}');
  });

  it("serializes numbers the ECMAScript way", () => {
    expect(canonicalize([-0, 1.0, 100, 1e21, 0.1, -5e-7])).toBe("[0,1,100,1e+21,0.1,-5e-7]");
  });

  it("rejects values that are not I-JSON instead of dropping them", () => {
    expect(() => canonicalize({ a: undefined })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ a: Number.NaN })).toThrow(/not finite/);
    expect(() => canonicalize({ a: Infinity })).toThrow(/not finite/);
    expect(() => canonicalize({ a: () => 1 })).toThrow(/Unsupported/);
    expect(() => canonicalize({ a: 1n })).toThrow(/Unsupported/);
    expect(() => canonicalize({ a: new Date(0) })).toThrow(/plain objects/);
    expect(() => canonicalize("\ud800")).toThrow(/lone surrogate/);
    expect(() => canonicalize([1, , 3])).toThrow(/Sparse/);
  });

  it("rejects cycles but allows repeated references", () => {
    const shared = { x: 1 };
    expect(canonicalize({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => canonicalize(loop)).toThrow(/Circular/);
  });

  it("reports where the problem is", () => {
    try {
      canonicalize({ action: { fields: [{ price: undefined }] } });
      throw new Error("expected a throw");
    } catch (e) {
      expect((e as CanonicalizationError).path).toBe("$.action.fields[0].price");
    }
  });
});

describe("hashing", () => {
  it("computes SHA-256 over UTF-8", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("gives the same hash regardless of key order", async () => {
    expect(await canonicalHash({ a: 1, b: [1, 2] })).toBe(await canonicalHash({ b: [1, 2], a: 1 }));
    expect(await canonicalHash({ a: 1 })).not.toBe(await canonicalHash({ a: 2 }));
  });

  it("shortens hashes for display only", () => {
    expect(shortHash("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")).toBe("sha256:ba7816…15ad");
  });
});

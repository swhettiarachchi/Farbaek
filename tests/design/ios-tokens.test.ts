/**
 * Farbaek for iPhone uses the web's colour tokens exactly (ADR 0008, ADR
 * 0110): its Tokens.swift is generated from tokens.css, and no Swift file
 * defines a colour of its own.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOKENS_CSS, TOKENS_SWIFT, swiftTokens } from "../../scripts/ios-tokens.mjs";

function swiftFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? swiftFiles(path) : path.endsWith(".swift") ? [path] : [];
  });
}

describe("the iPhone app's colours", () => {
  it("are the web's tokens, regenerated with node scripts/ios-tokens.mjs", () => {
    expect(readFileSync(TOKENS_SWIFT, "utf8").replace(/\r\n/g, "\n")).toBe(swiftTokens(readFileSync(TOKENS_CSS, "utf8")));
  });

  it("come only from Palette: no Swift file makes its own", () => {
    const offenders = swiftFiles("ios")
      .filter((f) => !f.replace(/\\/g, "/").endsWith("Design/Tokens.swift"))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split(/\r?\n/)
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter(({ line }) => /Color\(hex:|Color\(red:|Color\(\.sRGB|UIColor\(red:|\.(red|blue|green|orange|yellow|purple|pink|gray|grey)\b(?!\))/.test(line) && !line.trim().startsWith("//")),
      );
    expect(offenders.map((o) => `${o.f}:${o.i}: ${o.line.trim()}`)).toEqual([]);
  });

  it("never use em dashes in the app's words", () => {
    const offenders = swiftFiles("ios").filter((f) => readFileSync(f, "utf8").includes("—"));
    expect(offenders).toEqual([]);
  });
});

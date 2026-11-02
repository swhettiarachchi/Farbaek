import { describe, expect, it } from "vitest";
import { withoutStrayEnd } from "./stray-end";

describe("a link with a sentence's punctuation on the end", () => {
  it("loses the full stop, comma, bracket or other end of a sentence", () => {
    expect(withoutStrayEnd("/sign-in/password.")).toBe("/sign-in/password");
    expect(withoutStrayEnd("/pricing,")).toBe("/pricing");
    expect(withoutStrayEnd("/delete-account).")).toBe("/delete-account");
    expect(withoutStrayEnd("/app/billing;")).toBe("/app/billing");
    expect(withoutStrayEnd("/verify!")).toBe("/verify");
    expect(withoutStrayEnd("/security]")).toBe("/security");
  });

  it("leaves ordinary paths, files and the home page alone", () => {
    expect(withoutStrayEnd("/sign-in/password")).toBeNull();
    expect(withoutStrayEnd("/robots.txt")).toBeNull();
    expect(withoutStrayEnd("/.well-known/security.txt")).toBeNull();
    expect(withoutStrayEnd("/")).toBeNull();
    expect(withoutStrayEnd("/.")).toBeNull();
  });
});

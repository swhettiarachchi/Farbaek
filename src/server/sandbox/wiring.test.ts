import { describe, expect, it } from "vitest";
import { sameOrigin } from "./wiring";

describe("same-origin check for cookie-authenticated API changes", () => {
  const req = (origin: string | null) => new Request("http://localhost:3000/api/v1/sandboxes", { method: "POST", headers: origin ? { origin } : {} });

  it("accepts the app's own origin", () => {
    expect(sameOrigin(req("http://localhost:3000"))).toBe(true);
  });

  it("refuses other sites, preview hosts and requests without an Origin", () => {
    expect(sameOrigin(req("https://evil.example"))).toBe(false);
    expect(sameOrigin(req("http://p-abcdefghijklmnopqrstuvwxyz.preview.localhost:3000"))).toBe(false);
    expect(sameOrigin(req("null"))).toBe(false);
    expect(sameOrigin(req(null))).toBe(false);
  });
});
